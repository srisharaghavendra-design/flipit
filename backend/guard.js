// Session gate. Demo users sign in from a labelled picker. There is no shared passcode
// unless DEMO_PASSCODE is set for a private preview. Loopback is not a bypass.
// Tracking pixels and registration stay open; click redirects are allow-listed in the engine, not here.
const crypto = require('crypto');
const auth = require('./auth');
const { brandName } = require('../brand');

const WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map();

function clientIp(req) {
  const trust = process.env.MOPS_TRUST_PROXY === '1' || process.env.VERCEL === '1';
  if (trust) {
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
      const parts = String(xf).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  return req.socket?.remoteAddress || 'local';
}

function exempt(pathname) {
  if (pathname === '/health' || pathname === '/healthz' || pathname === '/favicon.ico') return true;
  if (pathname === '/api/login' || pathname === '/api/login/users' || pathname === '/api/login/callback' || pathname === '/api/login/saml') return true;
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
  if ((pathname === '/api/login' || pathname === '/api/gate') && method === 'POST') return !hit('login:' + ip, 30);
  if (method === 'GET' || method === 'HEAD') return !hit('get:' + ip, 600);
  return !hit('post:' + ip, 120);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > 2_000_000) { reject(Object.assign(new Error('Request is too large'), { status: 413 })); try { req.destroy(); } catch (e) {} return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

function previewOn() { return String(process.env.DEMO_PASSCODE || '').trim().length > 0; }

function signGate(payload) {
  return crypto.createHmac('sha256', process.env.MOPS_SESSION_SECRET || '').update(String(payload)).digest('base64url');
}
function openGate() {
  const payload = Buffer.from(JSON.stringify({ g: 1, exp: Date.now() + 2 * 60 * 60 * 1000 })).toString('base64url');
  return payload + '.' + signGate(payload);
}
function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function readGate(req) {
  const raw = String(readCookies(req).mops_gate || '');
  const cut = raw.lastIndexOf('.');
  if (cut <= 0) return false;
  const payload = raw.slice(0, cut);
  const mac = raw.slice(cut + 1);
  const a = Buffer.from(signGate(payload));
  const b = Buffer.from(String(mac));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return !!(data && data.g === 1 && data.exp > Date.now());
  } catch (e) { return false; }
}
function gateCookie(token) {
  const secure = (process.env.VERCEL || process.env.NODE_ENV === 'production') ? '; Secure' : '';
  return `mops_gate=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${2 * 60 * 60}; SameSite=Lax${secure}`;
}
function passOk(got) {
  const want = String(process.env.DEMO_PASSCODE || '');
  const a = Buffer.from(String(got || ''));
  const b = Buffer.from(want);
  if (!want || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function shell(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · ${brandName()}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0c;color:#f5f5f7;font-family:Inter,system-ui,sans-serif}
form,main{width:min(560px,94vw);background:#14161b;border:1px solid #2a2d34;border-radius:28px;padding:32px}
h1{font-size:36px;margin:0 0 8px;letter-spacing:-.04em;font-weight:560}p,li{color:#9b9ba3;font-size:15px;line-height:1.45}
ol{margin:12px 0;padding-left:20px}li{margin:8px 0}
.tag{display:inline-block;color:#d6ff4a;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px}
label{display:block;font-size:13px;color:#9b9ba3;margin:16px 0 6px}
input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1px solid #2a2d34;background:#101114;color:#f5f5f7;font:inherit}
button{display:block;width:100%;text-align:left;margin:8px 0;padding:14px 16px;border-radius:14px;border:1px solid #2a2d34;background:#101114;color:#f5f5f7;cursor:pointer;font:inherit}
button b{display:block;font-size:16px}button span{color:#9b9ba3;font-size:13px}
button[type=submit].go{text-align:center;background:#d6ff4a;color:#111;font-weight:700;margin-top:14px}</style>${body}`;
}
function passcodePage(error) {
  const note = error ? `<p>${error}</p>` : '<p>This preview is private. Enter the shared passcode to continue.</p>';
  return shell('Sign in', `<form method="post" action="/api/gate"><p class="tag">Private preview</p><h1>Enter the passcode</h1>${note}
<label for="passcode">Preview passcode</label><input id="passcode" name="passcode" type="password" autocomplete="off" required>
<button class="go" type="submit">Continue</button></form>`);
}
function landingPage() {
  return shell('Choose a role', `<main><p class="tag">Private preview</p><h1>Who are you today?</h1>
<p>This is a fictional campaign. Nothing here is a real customer.</p>
<ol>
<li>Choose Maria. She is the marketer. Ask who you can email in Illinois, send the Chicago invite, upload the attendee file, and file the $180,000 budget.</li>
<li>Choose Chris. He is the approver. Approve the budget.</li>
<li>Open Watch it work and press Run live demo. For about a minute you will see the queue, the mail, the CRM sync, and the report being built.</li>
</ol>
<p>Your browser has its own copy of the book. Start over clears it. It expires two hours after you begin. Another visitor cannot see your work.</p>
<form method="post" action="/api/login">
<button type="submit" name="user" value="maria"><b>Maria Alvarez</b><span>Marketer · Americas</span></button>
<button type="submit" name="user" value="chris"><b>Chris M.</b><span>Approver · the $180,000</span></button>
</form></main>`);
}
function door(req) { return previewOn() ? (readGate(req) ? landingPage() : passcodePage()) : page(); }

function page() {
  const people = auth.USERS.filter(u => u.role !== 'admin').map(u => `<button type="submit" name="user" value="${u.id}"><b>${u.name}</b><span>${u.role} · ${u.persona} · ${u.regions.join(', ')}</span></button>`).join('');
  const sso = auth.provider() === 'demo' ? '' : `<p>Company SSO is configured (${auth.provider()}). The picker below is only the local demo.</p>`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · ${brandName()}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a0c;color:#f5f5f7;font-family:Inter,system-ui,sans-serif}
form{width:min(520px,94vw);background:#14161b;border:1px solid #2a2d34;border-radius:28px;padding:32px}
h1{font-size:36px;margin:0 0 8px;letter-spacing:-.04em;font-weight:560}p{color:#9b9ba3;font-size:15px;line-height:1.45}
.tag{display:inline-block;color:#d6ff4a;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px}
button{display:block;width:100%;text-align:left;margin:8px 0;padding:14px 16px;border-radius:14px;border:1px solid #2a2d34;background:#101114;color:#f5f5f7;cursor:pointer}
button b{display:block;font-size:16px}button span{color:#9b9ba3;font-size:13px}</style>
<form method="post" action="/api/login"><p class="tag">Demo sign-in</p><h1>Who are you today?</h1>
<p>This picker is a demo, not company SSO. Each person has a role and a region. Spend over $150,000 needs Chris M.</p>${sso}${people}</form>`;
}

function send(res, code, body, headers) {
  res.writeHead(code, headers);
  res.end(body);
}

async function gateLogin(req, res) {
  let got = '';
  const ct = req.headers['content-type'] || '';
  try {
    const raw = await readBody(req);
    if (ct.includes('json')) got = (JSON.parse(raw || '{}').passcode || '');
    else got = new URLSearchParams(raw).get('passcode') || '';
  } catch (e) {
    send(res, e.status || 400, JSON.stringify({ error: e.message || 'Bad request' }), { 'content-type': 'application/json' });
    return;
  }
  const json = ct.includes('json');
  if (!passOk(got)) {
    if (json) send(res, 401, JSON.stringify({ error: 'That passcode is not right.' }), { 'content-type': 'application/json' });
    else send(res, 401, passcodePage('That passcode is not right.'), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }
  const cookie = gateCookie(openGate());
  if (json) send(res, 200, JSON.stringify({ ok: true }), { 'content-type': 'application/json', 'set-cookie': cookie });
  else send(res, 303, '', { location: '/', 'set-cookie': cookie });
}

async function login(req, res) {
  const ct = req.headers['content-type'] || '';
  if (previewOn() && !readGate(req)) {
    if (ct.includes('json')) send(res, 401, JSON.stringify({ error: 'Enter the preview passcode first.' }), { 'content-type': 'application/json' });
    else send(res, 401, passcodePage(), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }
  let id = '';
  try {
    const raw = await readBody(req);
    if (ct.includes('json')) id = (JSON.parse(raw || '{}').user || JSON.parse(raw || '{}').id || '');
    else id = new URLSearchParams(raw).get('user') || '';
  } catch (e) {
    send(res, e.status || 400, JSON.stringify({ error: e.message || 'Bad login' }), { 'content-type': 'application/json' });
    return;
  }
  const user = auth.USERS.find(u => u.id === id);
  if (user && user.role === 'admin') {
    const got = String(req.headers['x-mops-internal'] || '');
    const want = String(process.env.MOPS_SECRET || '');
    let ok = false;
    if (got && want && got.length === want.length) ok = require('crypto').timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!ok) { send(res, 403, JSON.stringify({ error: 'Admin sign-in is not on the demo picker.' }), { 'content-type': 'application/json' }); return; }
  }
  if (!user) {
    const json = ct.includes('json') || (req.headers.accept || '').includes('json');
    if (json) send(res, 401, JSON.stringify({ error: 'Unknown demo user' }), { 'content-type': 'application/json' });
    else send(res, 401, door(req), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }
  if (previewOn() && user.role !== 'admin' && user.id !== 'maria' && user.id !== 'chris') {
    const msg = 'This preview has two roles: Maria and Chris.';
    if (ct.includes('json')) send(res, 403, JSON.stringify({ error: msg }), { 'content-type': 'application/json' });
    else send(res, 403, landingPage(), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }
  const token = auth.openSession(user);
  const json = ct.includes('json');
  if (json) send(res, 200, JSON.stringify({ ok: true, user: auth.publicUser(user) }), { 'content-type': 'application/json', 'set-cookie': auth.cookieHeader(token) });
  else send(res, 303, '', { location: '/', 'set-cookie': auth.cookieHeader(token) });
}

async function handle(req, res, pathname) {
  if (previewOn() && pathname === '/api/gate' && req.method === 'POST') {
    if (limited(req, pathname)) { send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' }); return true; }
    await gateLogin(req, res);
    return true;
  }
  if (pathname === '/api/login/users' && req.method === 'GET') {
    let users = auth.USERS.filter(u => u.role !== 'admin');
    if (previewOn()) users = users.filter(u => u.id === 'maria' || u.id === 'chris');
    send(res, 200, JSON.stringify({ provider: auth.provider(), demo: true, users: users.map(auth.publicUser) }), { 'content-type': 'application/json' });
    return true;
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    if (limited(req, pathname)) { send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' }); return true; }
    await login(req, res);
    return true;
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    send(res, 200, JSON.stringify({ ok: true }), { 'content-type': 'application/json', 'set-cookie': 'mops_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
    return true;
  }
  const user = auth.fromRequest(req);
  req.mopsUser = user || null;
  if (exempt(pathname)) return false;
  if (pathname === '/api/session' && req.method === 'GET') {
    if (!user) { send(res, 401, JSON.stringify({ error: 'sign in required' }), { 'content-type': 'application/json' }); return true; }
    send(res, 200, JSON.stringify({ user: auth.publicUser(user), provider: auth.provider() }), { 'content-type': 'application/json' });
    return true;
  }
  if (!user) {
    if (limited(req, pathname)) {
      const json = (req.headers.accept || '').includes('json') || pathname.startsWith('/api/');
      if (json) send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' });
      else send(res, 429, door(req), { 'content-type': 'text/html; charset=utf-8' });
      return true;
    }
    if (pathname.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
      send(res, 401, JSON.stringify({ error: 'sign in required' }), { 'content-type': 'application/json' });
      return true;
    }
    send(res, 401, door(req), { 'content-type': 'text/html; charset=utf-8' });
    return true;
  }
  if (limited(req, pathname)) {
    send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' });
    return true;
  }
  return false;
}

module.exports = { handle, exempt, clientIp, readBody };
