/**
 * 幸赋链 · 五力创业测评 支付API
 * 微信支付 Native 扫码支付（直连商户号）
 *
 * POST /api/pay        创建订单，返回支付二维码
 * GET  /api/pay?id=xxx 查询订单支付状态
 */

import crypto from 'crypto';

const APP_ID  = process.env.WX_APP_ID  || '';   // 服务号 AppID
const MCH_ID  = process.env.WX_MCH_ID  || '';   // 商户号
const KEY     = process.env.WX_API_KEY || '';   // APIv2 密钥
const API     = 'https://api.mch.weixin.qq.com';

function md5(s) {
  return crypto.createHash('md5').update(s, 'utf-8').digest('hex');
}

function nonceStr() {
  return crypto.randomBytes(16).toString('hex');
}

function orderId() {
  const ts = Date.now().toString(36);
  const r = Math.random().toString(36).substring(2, 6);
  return `XFL${ts}${r}`;
}

/** 微信支付 MD5 签名 */
function sign(params) {
  const keys = Object.keys(params).filter(k => params[k] !== '').sort();
  const s = keys.map(k => `${k}=${params[k]}`).join('&') + `&key=${KEY}`;
  return md5(s).toUpperCase();
}

/** 构建请求 XML */
function toXml(obj) {
  return '<xml>' + Object.entries(obj)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join('') + '</xml>';
}

/** 解析微信返回的 XML */
function fromXml(xml) {
  const o = {};
  const re = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gs;
  let m;
  while ((m = re.exec(xml)) !== null) {
    o[m[1]] = m[2] !== undefined ? m[2] : (m[3] || '');
  }
  return o;
}

/** 调用微信支付 API */
async function wxPost(path, params) {
  params.appid = APP_ID;
  params.mch_id = MCH_ID;
  params.nonce_str = nonceStr();
  params.sign = sign(params);

  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    body: toXml(params),
    headers: { 'Content-Type': 'text/xml' },
  });
  const text = await res.text();
  return fromXml(text);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      // ===== 创建订单 =====
      const id = orderId();
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host  = req.headers['x-forwarded-host'] || req.headers.host;
      const notifyUrl = `${proto}://${host}/api/pay/notify`;

      const result = await wxPost('/pay/unifiedorder', {
        body: '幸赋链·五力创业成功率测评',
        out_trade_no: id,
        total_fee: '1990',
        spbill_create_ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                          req.socket.remoteAddress || '127.0.0.1',
        notify_url: notifyUrl,
        trade_type: 'NATIVE',
        product_id: id,
      });

      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return res.json({
          ok: true,
          order_id: id,
          qrcode: `https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=${encodeURIComponent(result.code_url)}`,
        });
      }

      return res.json({
        ok: false,
        msg: result.err_code_des || result.return_msg || '支付创建失败',
      });
    }

    if (req.method === 'GET') {
      // ===== 查询订单 =====
      const id = req.query.id;
      if (!id) return res.json({ ok: false, msg: '缺少订单号' });

      const result = await wxPost('/pay/orderquery', {
        out_trade_no: id,
      });

      return res.json({
        ok: true,
        paid: result.trade_state === 'SUCCESS',
        trade_state: result.trade_state || '',
        paid_time: result.time_end || null,
      });
    }

    return res.status(405).json({ ok: false, msg: 'Method not allowed' });
  } catch (err) {
    console.error('[WeChatPay]', err);
    return res.status(500).json({ ok: false, msg: '服务器繁忙，请稍后再试' });
  }
}
