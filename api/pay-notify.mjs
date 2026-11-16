/**
 * 幸赋链 · 微信支付异步通知回调
 *
 * 微信支付在用户扫码完成后，通过此接口通知支付结果。
 * 本接口返回 XML 给微信服务器确认。
 */

import crypto from 'crypto';

const KEY = process.env.WX_API_KEY || '';

function md5(s) {
  return crypto.createHash('md5').update(s, 'utf-8').digest('hex');
}

function verifySign(params) {
  const received = params.sign || '';
  const keys = Object.keys(params).filter(k => k !== 'sign' && params[k] !== '');
  const s = keys.sort().map(k => `${k}=${params[k]}`).join('&') + `&key=${KEY}`;
  const calculated = md5(s).toUpperCase();
  return received === calculated;
}

function fromXml(xml) {
  const o = {};
  const re = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gs;
  let m;
  while ((m = re.exec(xml)) !== null) {
    o[m[1]] = m[2] !== undefined ? m[2] : (m[3] || '');
  }
  return o;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const raw = await new Promise(r => {
      let d = '';
      req.on('data', c => d += c);
      req.on('end', () => r(d));
    });

    const data = fromXml(raw);
    console.log('[WeChatNotify]', JSON.stringify(data));

    // 验证签名
    if (!verifySign(data)) {
      return res
        .setHeader('Content-Type', 'text/xml; charset=utf-8')
        .send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[签名验证失败]]></return_msg></xml>');
    }

    // 处理支付成功
    if (data.return_code === 'SUCCESS' && data.result_code === 'SUCCESS') {
      const orderId = data.out_trade_no;
      const wechatId = data.transaction_id;
      const paidTime = data.time_end;

      console.log(`[WeChatNotify] 订单 ${orderId} 支付成功，微信订单号: ${wechatId}`);

      // TODO: 更新数据库订单状态
      // 这里将来可以持久化到 SQLite/数据库
    }

    // 回复微信：SUCCESS（不再回调）
    res
      .setHeader('Content-Type', 'text/xml; charset=utf-8')
      .send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');

  } catch (err) {
    console.error('[WeChatNotify Error]', err);
    res
      .setHeader('Content-Type', 'text/xml; charset=utf-8')
      .send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[服务器错误]]></return_msg></xml>');
  }
}
