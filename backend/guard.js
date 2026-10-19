// Public-demo gate. Off unless DEMO_PASSCODE is set, so local tests stay open.
// Tracking pixels, unsubscribe links and registration forms stay open: they are
// how the in-app email demo records opens, clicks and sign-ups.
const crypto = require('crypto');

const WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map();

function passcode() { return process.env.DEMO_PASSCODE || ''; }

function tokenFor(pass) {
  return crypto.createHmac('sha256', String(pass)).update('mops-demo-v1').digest('base64url');
}

function same(a, b) {
  const ba = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ba, bb);
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || 'local';
}

// Other services on this machine call the hub over loopback. The public proxy never does.
function fromLoopback(req) {
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function exempt(pathname) {
  if (pathname === '/health' || pathname === '/healthz' || pathname === '/gate' || pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/svc/engine/t/') || pathname.startsWith('/svc/engine/u/') || pathname.startsWith('/svc/engine/r/')) return true;
  if (pathname.startsWith('/t/') || pathname.startsWith('/r/')) return true;
  return false;
}

function hit(key, limit) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n += 1;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
  }
  return b.n <= limit;
}

function limited(req, pathname) {
  const ip = clientIp(req);
  const method = req.method || 'GET';
  if (method === 'POST' && pathname === '/api/engine/loadtest') return !hit('load:' + ip, 4);
  if (!passcode()) return false;
  if (pathname === '/gate' && method === 'POST') return !hit('gate:' + ip, 12);
  if (method === 'GET' || method === 'HEAD') return !hit('get:' + ip, 600);
  return !hit('post:' + ip, 120);
}

function authed(req) {
  const pass = passcode();
  if (!pass) return true;
  const c = cookies(req);
  if (c.mops_gate && same(c.mops_gate, tokenFor(pass))) return true;
  const header = req.headers['x-demo-passcode'];
  return !!(header && same(header, pass));
}

function page(msg) {
  const note = msg ? `<p class="err">${msg}</p>` : '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Northwind demo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06070a;color:#f4f4f6;font-family:Inter,system-ui,sans-serif}
form{width:min(380px,92vw);background:#ffffff0c;border:1px solid #ffffff18;border-radius:20px;padding:28px}
h1{font-size:22px;margin:0 0 6px;letter-spacing:-.03em}p{color:#a4a4b0;font-size:14px;line-height:1.5}
input{width:100%;box-sizing:border-box;margin:14px 0;padding:12px 14px;border-radius:12px;border:1px solid #ffffff22;background:#0006;color:#fff;font-size:16px}
button{width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(90deg,#9d8cff,#4fe3c1);color:#06070a;font-weight:700;font-size:15px;cursor:pointer}
.err{color:#ffb4b4}</style>
<form method="post" action="/gate"><h1>Northwind Networks</h1><p>This is a private demo. Enter the passcode to continue.</p>${note}
<input type="password" name="passcode" autocomplete="current-password" autofocus required placeholder="Passcode"><button>Enter demo</button></form>`;
}

function send(res, code, body, headers) {
  res.writeHead(code, headers);
  res.end(body);
}

function setCookie(res, value) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `mops_gate=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

function readBody(req) {
  return new Promise(resolve => { let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b)); });
}

async function handle(req, res, pathname) {
  if (fromLoopback(req)) return false;
  if (pathname === '/gate' && req.method === 'POST') {
    if (limited(req, pathname)) { send(res, 429, page('Too many attempts. Wait a few minutes and try again.'), { 'content-type': 'text/html; charset=utf-8' }); return true; }
    const pass = passcode();
    const raw = await readBody(req);
    const ct = req.headers['content-type'] || '';
    let given = '';
    if (ct.includes('json')) { try { given = JSON.parse(raw || '{}').passcode || ''; } catch { given = ''; } }
    else given = new URLSearchParams(raw).get('passcode') || '';
    if (!pass || !same(given, pass)) { send(res, 401, page('That passcode is not right.'), { 'content-type': 'text/html; charset=utf-8' }); return true; }
    send(res, 303, '', { location: '/', 'set-cookie': setCookie(res, tokenFor(pass)) });
    return true;
  }
  if (exempt(pathname) || authed(req)) {
    if (limited(req, pathname)) {
      const json = (req.headers.accept || '').includes('json') || pathname.startsWith('/api/');
      if (json) send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' });
      else send(res, 429, page('Too many requests. Please wait a minute.'), { 'content-type': 'text/html; charset=utf-8' });
      return true;
    }
    return false;
  }
  if (pathname.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
    send(res, 401, JSON.stringify({ error: 'passcode required' }), { 'content-type': 'application/json' });
    return true;
  }
  send(res, 401, page(''), { 'content-type': 'text/html; charset=utf-8' });
  return true;
}

module.exports = { handle, exempt, tokenFor };
