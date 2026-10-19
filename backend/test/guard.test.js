const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, clientIp } = require('../guard');

function mockReq({ method = 'GET', headers = {}, ip = '203.0.113.8', body = '' } = {}) {
  return {
    method,
    headers,
    socket: { remoteAddress: ip },
    on(ev, fn) { if (ev === 'data' && body) fn(body); if (ev === 'end') fn(); }
  };
}

function mockRes() {
  const res = { status: 0, headers: {}, body: '', writeHead(c, h) { res.status = c; res.headers = h || {}; }, end(b) { res.body = b || ''; } };
  return res;
}

async function hit(pathname, opts) {
  const req = mockReq(opts);
  const res = mockRes();
  const handled = await handle(req, res, pathname);
  return { handled, res, req };
}

test('demo sign-in replaces the passcode, and loopback is not a bypass', async () => {
  const health = await hit('/health');
  assert.equal(health.handled, false);
  const pixel = await hit('/svc/engine/t/o/S1.gif');
  assert.equal(pixel.handled, false);
  const home = await hit('/');
  assert.equal(home.res.status, 401);
  assert.match(home.res.body, /Demo sign-in/);
  assert.doesNotMatch(home.res.body, /passcode/i);
  assert.doesNotMatch(home.res.body, /Northwind Admin/);
  assert.doesNotMatch(home.res.body, /value="admin"/);
  const users = await hit('/api/login/users');
  assert.equal(users.res.status, 200);
  assert.doesNotMatch(users.res.body, /"id":"admin"/);
  const api = await hit('/api/engine/loadtest', { method: 'POST', headers: { accept: 'application/json' } });
  assert.equal(api.res.status, 401);
  assert.match(api.res.body, /sign in required/);
  const bad = await hit('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"user":"nobody"}' });
  assert.equal(bad.res.status, 401);
  const admin = await hit('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"user":"admin"}' });
  assert.equal(admin.res.status, 403);
  const good = await hit('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"user":"maria"}' });
  assert.equal(good.res.status, 200);
  assert.match(good.res.headers['set-cookie'], /mops_session=/);
  assert.match(good.res.headers['set-cookie'], /HttpOnly/);
  assert.match(good.res.headers['set-cookie'], /SameSite=Lax/);
  const cookie = good.res.headers['set-cookie'].split(';')[0];
  const inside = await hit('/engine', { headers: { cookie } });
  assert.equal(inside.handled, false);
  assert.equal(inside.req.mopsUser.id, 'maria');
  const local = await hit('/api/engine/reset', { method: 'POST', ip: '127.0.0.1', headers: { accept: 'application/json' } });
  assert.equal(local.res.status, 401);
});

test('the client address is the socket, not a header the caller sets', () => {
  const req = mockReq({ headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.4' }, ip: '203.0.113.8' });
  delete process.env.MOPS_TRUST_PROXY;
  delete process.env.VERCEL;
  assert.equal(clientIp(req), '203.0.113.8');
});

test('the scale-test button is rate limited for a signed-in caller', async () => {
  const good = await hit('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mops-internal': process.env.MOPS_SECRET }, body: '{"user":"admin"}', ip: '198.51.100.9' });
  const cookie = good.res.headers['set-cookie'].split(';')[0];
  let blocked = 0;
  for (let i = 0; i < 6; i++) {
    const r = await hit('/api/engine/loadtest', { method: 'POST', headers: { cookie, accept: 'application/json', 'x-forwarded-for': '203.0.113.' + i }, ip: '198.51.100.9' });
    if (r.res.status === 429) blocked++;
  }
  assert.ok(blocked >= 1);
});
