// Session gate. Demo users sign in from a labelled picker. There is no shared passcode.
// Loopback is not a bypass. Tracking pixels and registration stay open; click redirects
// are allow-listed in the engine, not here.
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
  if (pathname === '/api/login' && method === 'POST') return !hit('login:' + ip, 30);
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

async function login(req, res) {
  let id = '';
  const ct = req.headers['content-type'] || '';
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
    else send(res, 401, page(), { 'content-type': 'text/html; charset=utf-8' });
    return;
  }
  const token = auth.openSession(user);
  const json = ct.includes('json');
  if (json) send(res, 200, JSON.stringify({ ok: true, user: auth.publicUser(user) }), { 'content-type': 'application/json', 'set-cookie': auth.cookieHeader(token) });
  else send(res, 303, '', { location: '/', 'set-cookie': auth.cookieHeader(token) });
}

async function handle(req, res, pathname) {
  if (pathname === '/api/login/users' && req.method === 'GET') {
    send(res, 200, JSON.stringify({ provider: auth.provider(), demo: true, users: auth.USERS.filter(u => u.role !== 'admin').map(auth.publicUser) }), { 'content-type': 'application/json' });
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
      else send(res, 429, page(), { 'content-type': 'text/html; charset=utf-8' });
      return true;
    }
    if (pathname.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
      send(res, 401, JSON.stringify({ error: 'sign in required' }), { 'content-type': 'application/json' });
      return true;
    }
    send(res, 401, page(), { 'content-type': 'text/html; charset=utf-8' });
    return true;
  }
  if (limited(req, pathname)) {
    send(res, 429, JSON.stringify({ error: 'Too many requests. Please wait a minute.' }), { 'content-type': 'application/json' });
    return true;
  }
  return false;
}

module.exports = { handle, exempt, clientIp, readBody };
