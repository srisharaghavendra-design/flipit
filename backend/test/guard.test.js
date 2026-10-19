const test = require('node:test');
const assert = require('node:assert/strict');
const { handle, tokenFor } = require('../guard');

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
  return { handled, res };
}

test('a public visitor needs the passcode; health, tracking and loopback do not', async () => {
  const prev = process.env.DEMO_PASSCODE;
  process.env.DEMO_PASSCODE = 'northwind-demo';
  try {
    const health = await hit('/health');
    assert.equal(health.handled, false);
    const pixel = await hit('/svc/engine/t/o/S1.gif');
    assert.equal(pixel.handled, false);
    const home = await hit('/');
    assert.equal(home.res.status, 401);
    assert.match(home.res.body, /passcode/i);
    const api = await hit('/api/engine/loadtest', { method: 'POST', headers: { accept: 'application/json' } });
    assert.equal(api.res.status, 401);
    assert.match(api.res.body, /passcode required/);
    const bad = await hit('/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"passcode":"nope"}' });
    assert.equal(bad.res.status, 401);
    const good = await hit('/gate', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'passcode=northwind-demo' });
    assert.equal(good.res.status, 303);
    assert.ok(good.res.headers['set-cookie'].includes(tokenFor('northwind-demo')));
    const cookie = good.res.headers['set-cookie'].split(';')[0];
    const inside = await hit('/engine', { headers: { cookie } });
    assert.equal(inside.handled, false);
    const local = await hit('/api/engine/reset', { method: 'POST', ip: '127.0.0.1' });
    assert.equal(local.handled, false);
  } finally {
    if (prev == null) delete process.env.DEMO_PASSCODE; else process.env.DEMO_PASSCODE = prev;
  }
});

test('with no passcode the app is open', async () => {
  const prev = process.env.DEMO_PASSCODE;
  delete process.env.DEMO_PASSCODE;
  try {
    const home = await hit('/');
    assert.equal(home.handled, false);
  } finally {
    if (prev == null) delete process.env.DEMO_PASSCODE; else process.env.DEMO_PASSCODE = prev;
  }
});

test('the scale-test button is rate limited for public callers', async () => {
  const prev = process.env.DEMO_PASSCODE;
  process.env.DEMO_PASSCODE = 'northwind-demo';
  try {
    const cookie = 'mops_gate=' + tokenFor('northwind-demo');
    let blocked = 0;
    for (let i = 0; i < 6; i++) {
      const r = await hit('/api/engine/loadtest', { method: 'POST', headers: { cookie, accept: 'application/json' }, ip: '198.51.100.9' });
      if (r.res.status === 429) blocked++;
    }
    assert.ok(blocked >= 1);
  } finally {
    if (prev == null) delete process.env.DEMO_PASSCODE; else process.env.DEMO_PASSCODE = prev;
  }
});
