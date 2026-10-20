// Preview gate and per-browser sandbox. This file sets DEMO_PASSCODE before loading the server.
// The value below is a test fixture, not the passcode handed to visitors.
const os = require('os');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-preview-'));
process.env.MOPS_DATA_DIR = dir;
process.env.MOPS_RUNS_DIR = path.join(dir, 'runs');
process.env.VERCEL = '1';
process.env.DEMO_PASSCODE = 'test-gate-9';
process.env.MOPS_SESSION_SECRET = 'preview-test-secret';
process.env.ELT_MS = '0';
process.env.COVER_MS = '0';
process.env.PULL_MS = '999999';
process.env.MOPS_AUTOPILOT = '0';
process.env.CRM_FAIL_RATE = '0';
delete process.env.BRAND_NAME;

const handleRequest = require('../../api/index');

function request(method, url, { headers = {}, body = '', ip = '203.0.113.40' } = {}) {
  const waiters = [];
  let ended = false;
  const req = {
    method, url, headers, socket: { remoteAddress: ip },
    on(ev, fn) {
      if (ev !== 'data' && ev !== 'end') return;
      if (ended) {
        if (ev === 'data' && body) fn(body);
        if (ev === 'end') fn();
        return;
      }
      waiters.push([ev, fn]);
    },
    flush() {
      if (ended) return;
      ended = true;
      for (const [ev, fn] of waiters) {
        if (ev === 'data' && body) fn(body);
        if (ev === 'end') fn();
      }
    }
  };
  return new Promise((resolve, reject) => {
    const chunks = [];
    let status = 0;
    let rh = {};
    const res = {
      writableEnded: false,
      get headersSent() { return this._s; },
      writeHead(c, h) { status = c; rh = h || {}; this._s = true; },
      setHeader(k, v) { rh[k] = v; },
      write(c) { chunks.push(Buffer.from(c)); return true; },
      end(b) {
        if (b != null) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b)));
        this.writableEnded = true;
        this._s = true;
        resolve({ status, headers: rh, body: Buffer.concat(chunks).toString('utf8') });
      }
    };
    Promise.resolve(handleRequest(req, res)).then(() => {
      if (!res.writableEnded) reject(new Error('handler did not end ' + url));
    }).catch(reject);
    req.flush();
  });
}

function cookiePair(res) {
  const raw = res.headers['set-cookie'] || '';
  return String(raw).split(';')[0];
}

test('a preview passcode comes before Maria and Chris', async () => {
  const health = await request('GET', '/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).company, 'Northwind Networks');

  const home = await request('GET', '/');
  assert.equal(home.status, 401);
  assert.match(home.body, /passcode/i);
  assert.doesNotMatch(home.body, /value="maria"/);
  assert.doesNotMatch(home.body, /Lukas/);

  const bad = await request('POST', '/api/gate', { headers: { 'content-type': 'application/json' }, body: '{"passcode":"nope"}' });
  assert.equal(bad.status, 401);

  const early = await request('POST', '/api/login', { headers: { 'content-type': 'application/json' }, body: '{"user":"maria"}' });
  assert.equal(early.status, 401);

  const gate = await request('POST', '/api/gate', { headers: { 'content-type': 'application/json' }, body: '{"passcode":"test-gate-9"}' });
  assert.equal(gate.status, 200);
  assert.match(cookiePair(gate), /mops_gate=/);
  assert.match(gate.headers['set-cookie'], /HttpOnly/);
  assert.match(gate.headers['set-cookie'], /Secure/);
  const gateCookie = cookiePair(gate);

  const landing = await request('GET', '/', { headers: { cookie: gateCookie } });
  assert.equal(landing.status, 401);
  assert.match(landing.body, /Maria Alvarez/);
  assert.match(landing.body, /Chris M\./);
  assert.match(landing.body, /who you can email in Illinois/);
  assert.match(landing.body, /Run live demo/);
  assert.match(landing.body, /two hours/);
  assert.doesNotMatch(landing.body, /Lukas/);
  assert.doesNotMatch(landing.body, /passcode/i);

  const users = await request('GET', '/api/login/users');
  const listed = JSON.parse(users.body).users.map(u => u.id).sort();
  assert.deepEqual(listed, ['chris', 'maria']);

  const lukas = await request('POST', '/api/login', { headers: { cookie: gateCookie, 'content-type': 'application/json' }, body: '{"user":"lukas"}' });
  assert.equal(lukas.status, 403);

  const maria = await request('POST', '/api/login', { headers: { cookie: gateCookie, 'content-type': 'application/json' }, body: '{"user":"maria"}' });
  assert.equal(maria.status, 200);
  const session = cookiePair(maria);
  const cookies = gateCookie + '; ' + session;

  const desk = await request('GET', '/', { headers: { cookie: cookies } });
  assert.equal(desk.status, 200);
  assert.match(desk.body, /__MOPS_SANDBOX__ = \("true" === "true"\)/);
  assert.match(desk.body, /sandbox\.js/);

  const ops = await request('GET', '/platform/ops', { headers: { cookie: cookies } });
  assert.equal(ops.status, 200);
  assert.match(ops.body, /Run live demo/);
  assert.match(ops.body, /\/api\/platform\/ops\/stream/);
  assert.match(ops.body, /const paced=true/);
  assert.match(ops.body, /if\(!paced\)/);
});

test('two browsers do not share a sandbox, and the paced demo finishes', { timeout: 180000 }, async () => {
  const gate = await request('POST', '/api/gate', { headers: { 'content-type': 'application/json' }, body: '{"passcode":"test-gate-9"}', ip: '203.0.113.41' });
  const gateCookie = cookiePair(gate);
  const maria = await request('POST', '/api/login', { headers: { cookie: gateCookie, 'content-type': 'application/json' }, body: '{"user":"maria"}', ip: '203.0.113.41' });
  const cookies = gateCookie + '; ' + cookiePair(maria);
  const body = JSON.stringify({ campaignId: 'CAMP-CHI', amount: 12345, currency: 'USD', idempotencyKey: 'box-a-only', channel: 'App' });
  const filed = await request('POST', '/api/platform/spend/budgets', {
    headers: { cookie: cookies, 'content-type': 'application/json' },
    body,
    ip: '203.0.113.41'
  });
  assert.equal(filed.status, 200, filed.body.slice(0, 300));
  const next = filed.headers['x-mops-sandbox-next'];
  assert.ok(next, 'missing sandbox hash');
  const filedBody = JSON.parse(filed.body);
  assert.equal(filedBody.amount, 12345);

  const other = await request('GET', '/api/platform/spend/packets', { headers: { cookie: cookies }, ip: '203.0.113.42' });
  assert.equal(other.status, 200);
  assert.doesNotMatch(other.body, /box-a-only|12345/);

  const mine = await request('GET', '/api/platform/spend/packets', {
    headers: { cookie: cookies, 'x-mops-sandbox': next },
    ip: '203.0.113.41'
  });
  assert.equal(mine.status, 200);
  assert.match(mine.body, /12345/);

  const stale = await request('GET', '/api/platform/spend/packets', {
    headers: { cookie: cookies, 'x-mops-sandbox': 'deadbeefdeadbeefdeadbeef' },
    ip: '203.0.113.41'
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.headers['x-mops-replay'], '1');

  const synced = await request('POST', '/api/sandbox/sync', {
    headers: { cookie: cookies, 'content-type': 'application/json' },
    body: JSON.stringify({ log: [{ m: 'POST', u: '/api/platform/spend/budgets', b: body, user: 'maria' }] }),
    ip: '203.0.113.43'
  });
  assert.equal(synced.status, 200, synced.body.slice(0, 300));
  assert.equal(JSON.parse(synced.body).hash, next);

  const demo = await request('POST', '/api/platform/ops/demo', {
    headers: { cookie: cookies, 'content-type': 'application/json', 'x-mops-sandbox': next },
    body: '{"spanMs":60000,"channel":"App"}',
    ip: '203.0.113.41'
  });
  assert.equal(demo.status, 200, demo.body.slice(0, 400));
  const played = JSON.parse(demo.body);
  assert.equal(played.paced, true);
  assert.ok(Array.isArray(played.events) && played.events.length > 10, 'events ' + (played.events && played.events.length));
  assert.ok(played.snapshot.mail.delivered >= 30, 'delivered ' + played.snapshot.mail.delivered);
  assert.ok(played.snapshot.mail.held >= 1);
  assert.ok(played.snapshot.sync.length >= 1);
  assert.ok(played.snapshot.efficiency.some(row => row.pastGoal));
  const demoHash = demo.headers['x-mops-sandbox-next'];
  assert.ok(demoHash);

  const report = await request('GET', '/api/platform/insights/reports/weekly.pptx?region=Americas', {
    headers: { cookie: cookies, 'x-mops-sandbox': demoHash },
    ip: '203.0.113.41'
  });
  assert.equal(report.status, 200);
  assert.match(report.headers['content-type'] || '', /presentation/);

  const pdf = await request('GET', '/api/platform/insights/reports/monthly.pdf?region=portfolio', {
    headers: { cookie: cookies, 'x-mops-sandbox': demoHash },
    ip: '203.0.113.41'
  });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'] || '', /pdf/);
});

test('a sandbox still opens after many writes', { timeout: 60000 }, async () => {
  const gate = await request('POST', '/api/gate', { headers: { 'content-type': 'application/json' }, body: '{"passcode":"test-gate-9"}', ip: '203.0.113.50' });
  const cookies = cookiePair(gate);
  const maria = await request('POST', '/api/login', { headers: { cookie: cookies, 'content-type': 'application/json' }, body: '{"user":"maria"}', ip: '203.0.113.50' });
  let jar = cookies + '; ' + cookiePair(maria);
  let hash = '';
  for (let i = 0; i < 10; i++) {
    const body = JSON.stringify({ campaignId: 'CAMP-CHI', amount: 1000 + i, currency: 'USD', idempotencyKey: 'box-many-' + i, channel: 'App' });
    const headers = { cookie: jar, 'content-type': 'application/json' };
    if (hash) headers['x-mops-sandbox'] = hash;
    const filed = await request('POST', '/api/platform/spend/budgets', { headers, body, ip: '203.0.113.50' });
    assert.equal(filed.status, 200, filed.body.slice(0, 240));
    hash = filed.headers['x-mops-sandbox-next'];
    assert.ok(hash);
  }
  const mine = await request('GET', '/api/platform/spend/packets', {
    headers: { cookie: jar, 'x-mops-sandbox': hash },
    ip: '203.0.113.50'
  });
  assert.equal(mine.status, 200, mine.body.slice(0, 240));
  assert.match(mine.body, /1009/);
});
