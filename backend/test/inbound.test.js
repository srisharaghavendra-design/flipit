// Email and Webex tags. Secrets below are fixtures, not the preview values.
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-inbound-'));
process.env.MOPS_DATA_DIR = dir;
process.env.MOPS_RUNS_DIR = path.join(dir, 'runs');
process.env.MOPS_SESSION_SECRET = 'inbound-test-secret';
process.env.MOPS_WEBEX_SECRET = 'inbound-webex-secret';
process.env.INBOUND_WEBHOOK_SECRET = 'inbound-email-secret';
process.env.MOPS_EMAIL_ALLOWLIST = 'maria.alvarez@northwind.example,pat.lee@northwind.example';
process.env.MOPS_WEBEX_ALLOWLIST = 'maria.alvarez@northwind.example';
process.env.WEBEX_BOT_TOKEN = 'test-webex-token';
process.env.WEBEX_BOT_EMAIL = 'mops-bot@webex.example';
process.env.MOPS_PUBLIC_URL = 'http://127.0.0.1:8799';
process.env.ELT_MS = '0';
process.env.COVER_MS = '0';
process.env.PULL_MS = '999999';
process.env.MOPS_AUTOPILOT = '0';
delete process.env.BRAND_NAME;
delete process.env.AGENTMAIL_API_KEY;
delete process.env.DEMO_PASSCODE;

const handleRequest = require('../../api/index');
const inbound = require('../../platform/inbound');
const pages = require('../../platform/pages');

const calls = [];
inbound.setTransport(async (url, opts) => {
  calls.push({ url: String(url), body: opts && opts.body || '', method: (opts && opts.method) || 'GET' });
  return { status: 200, async text() { return JSON.stringify({ id: 'wx-reply-1' }); } };
});

function request(method, url, { headers = {}, body = '' } = {}) {
  const waiters = [];
  let ended = false;
  const req = {
    method, url, headers, socket: { remoteAddress: '203.0.113.50' },
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

function email(from, text, id) {
  return JSON.stringify({
    event_type: 'message.received',
    event_id: id,
    message: {
      from_: [from],
      inbox_id: 'northwind-mops@agentmail.to',
      message_id: id,
      subject: text,
      text
    }
  });
}

function spark(raw) {
  return crypto.createHmac('sha1', process.env.MOPS_WEBEX_SECRET).update(raw).digest('hex');
}

function cookie(res) {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [raw || ''];
  return list.map(item => String(item).split(';')[0]).filter(Boolean).join('; ');
}

function openDb(email) {
  return require('../../backend/sandbox').senderDir(email).then(folder => {
    const Database = require('better-sqlite3');
    return new Database(path.join(folder, 'platform.db'), { readonly: true });
  });
}

test('an email tag runs in that sender’s workspace and cites the email', async () => {
  const missing = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json' },
    body: email('maria.alvarez@northwind.example', '@mops who can I email in Illinois', 'msg-missing')
  });
  assert.equal(missing.status, 401);

  const stranger = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('stranger@northwind.example', '@mops who can I email in Illinois', 'msg-stranger')
  });
  assert.equal(stranger.status, 403);

  const maria = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('Maria Alvarez <maria.alvarez@northwind.example>', '@mops who can I email in Illinois', 'msg-maria-1')
  });
  assert.equal(maria.status, 200);
  const first = JSON.parse(maria.body);
  assert.match(first.reply, /36 opted-in/);
  assert.equal(first.delivered, false);
  assert.match(first.link, /^http:\/\/127\.0\.0\.1:8799\/\?ws=/);

  const again = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('maria.alvarez@northwind.example', '@mops who can I email in Illinois', 'msg-maria-1')
  });
  assert.equal(JSON.parse(again.body).idempotent, true);

  const budget = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('maria.alvarez@northwind.example', '@mops new budget: Chicago security roundtable, $180K', 'msg-maria-2')
  });
  assert.match(JSON.parse(budget.body).reply, /\$180,000/);
  assert.match(JSON.parse(budget.body).reply, /Waiting on Chris/);

  const pat = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('pat.lee@northwind.example', '@mops who can I email in Illinois', 'msg-pat-1')
  });
  assert.match(JSON.parse(pat.body).reply, /36 opted-in/);

  const mariaDb = await openDb('maria.alvarez@northwind.example');
  const why = mariaDb.prepare("SELECT channel, source_message, why FROM event_log WHERE channel = 'Email'").all();
  assert.ok(why.some(row => /Email from maria.alvarez@northwind.example/.test(row.source_message) && /36 opted-in/.test(row.why)));
  const packets = mariaDb.prepare('SELECT amount_usd, status FROM plan_packets').all();
  assert.ok(packets.some(row => row.amount_usd === 180000 && row.status === 'pending'));
  mariaDb.close();

  const patDb = await openDb('pat.lee@northwind.example');
  const patPackets = patDb.prepare('SELECT COUNT(*) AS n FROM plan_packets').get();
  assert.equal(patPackets.n, 0);
  const patWhy = patDb.prepare("SELECT source_message FROM event_log WHERE channel = 'Email'").all();
  assert.ok(patWhy.some(row => /pat.lee@northwind.example/.test(row.source_message)));
  patDb.close();
});

test('a Webex tag replies in the thread and both tags show on ops', async () => {
  const raw = JSON.stringify({
    resource: 'messages',
    event: 'created',
    data: {
      id: 'wx-msg-1',
      roomId: 'ROOM1',
      personEmail: 'maria.alvarez@northwind.example',
      text: '@mops who can I email in Illinois'
    }
  });
  const bad = await request('POST', '/api/inbound/webex', {
    headers: { 'content-type': 'application/json', 'x-spark-signature': 'nope' },
    body: raw
  });
  assert.equal(bad.status, 401);

  const ok = await request('POST', '/api/inbound/webex', {
    headers: { 'content-type': 'application/json', 'x-spark-signature': spark(raw) },
    body: raw
  });
  assert.equal(ok.status, 200);
  const body = JSON.parse(ok.body);
  assert.match(body.reply, /36 opted-in/);
  assert.equal(body.delivered, true);
  assert.ok(calls.some(call => call.url === 'https://webexapis.com/v1/messages' && call.method === 'POST' && /Open this workspace/.test(call.body)));

  const quiet = JSON.stringify({
    resource: 'messages',
    event: 'created',
    data: { id: 'wx-msg-2', roomId: 'ROOM1', personEmail: 'maria.alvarez@northwind.example', text: 'hello room' }
  });
  const ignored = await request('POST', '/api/inbound/webex', {
    headers: { 'content-type': 'application/json', 'x-spark-signature': spark(quiet) },
    body: quiet
  });
  assert.equal(JSON.parse(ignored.body).ignored, true);

  const login = await request('POST', '/api/login', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'maria' })
  });
  assert.equal(login.status, 200);
  const inbox = await request('GET', '/api/platform/ops/inbox', { headers: { cookie: cookie(login) } });
  assert.equal(inbox.status, 200);
  const events = JSON.parse(inbox.body).events;
  assert.ok(events.some(row => row.channel === 'Email' && /36 opted-in/.test(row.message)));
  assert.ok(events.some(row => row.channel === 'Webex' && row.why === 'Tagged @mops from Webex.'));

  const ops = pages.opsPage();
  assert.match(ops, /Run live demo/);
  assert.match(ops, /\/api\/platform\/ops\/stream/);
  assert.match(ops, /\/api\/platform\/ops\/inbox/);
  assert.match(ops, /Email and Webex/);

  const webexDb = await openDb('maria.alvarez@northwind.example');
  const cited = webexDb.prepare("SELECT channel, source_message, why FROM event_log WHERE channel = 'Webex'").all();
  assert.ok(cited.some(row => row.source_message === 'Webex from maria.alvarez@northwind.example' && /36 opted-in/.test(row.why)));
  webexDb.close();

  const link = JSON.parse((await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'inbound-email-secret' },
    body: email('maria.alvarez@northwind.example', '@mops what is left in the Americas budget', 'msg-maria-3')
  })).body).link;
  const token = new URL(link).searchParams.get('ws');
  const door = await request('GET', '/?ws=' + encodeURIComponent(token));
  assert.equal(door.status, 401);
  assert.match(cookie(door), /mops_ws=/);
  const packets = await request('GET', '/api/platform/spend/packets', {
    headers: { cookie: cookie(login) + '; ' + cookie(door) }
  });
  assert.equal(packets.status, 200);
  assert.match(packets.body, /180000/);
});
