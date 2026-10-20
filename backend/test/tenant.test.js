// Self-serve workspaces. Fixtures below are not the preview passcode or any live key.
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-tenant-'));
process.env.MOPS_DATA_DIR = dir;
process.env.MOPS_RUNS_DIR = path.join(dir, 'runs');
process.env.MOPS_SESSION_SECRET = 'tenant-test-secret';
process.env.MOPS_WEBEX_SECRET = 'global-webex-secret';
process.env.INBOUND_WEBHOOK_SECRET = 'tenant-inbound-secret';
process.env.MOPS_EMAIL_ALLOWLIST = '';
process.env.MOPS_WEBEX_ALLOWLIST = '';
process.env.WEBEX_BOT_TOKEN = 'global-bot-token';
process.env.WEBEX_BOT_EMAIL = 'global-bot@webex.example';
process.env.AGENTMAIL_API_KEY = 'test-key';
process.env.AGENTMAIL_INBOX_ID = 'northwind-mops@agentmail.to';
process.env.MOPS_PUBLIC_URL = 'http://127.0.0.1:8799';
process.env.ELT_MS = '0';
process.env.COVER_MS = '0';
process.env.PULL_MS = '999999';
process.env.MOPS_AUTOPILOT = '0';
delete process.env.BRAND_NAME;
delete process.env.DEMO_PASSCODE;

const handleRequest = require('../../api/index');
const scope = require('../../platform/scope');
const inbound = require('../../platform/inbound');
const workspace = require('../../platform/workspace');

const sent = [];
const fake = async (url, opts) => {
  sent.push({ url: String(url), body: opts && opts.body || '', headers: opts && opts.headers || {}, method: (opts && opts.method) || 'GET' });
  return { status: 200, async text() { return '{}'; } };
};
inbound.setTransport(fake);
workspace.setTransport(fake);

function request(method, url, { headers = {}, body = '' } = {}) {
  const waiters = [];
  let ended = false;
  const req = {
    method, url, headers, socket: { remoteAddress: '203.0.113.60' },
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

function cookie(res) {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [raw || ''];
  return list.map(item => String(item).split(';')[0]).filter(Boolean).join('; ');
}

function json(res) { return JSON.parse(res.body || '{}'); }

test('two workspaces cannot read each other', { timeout: 180000 }, async () => {
  assert.throws(() => scope.scopeStatement("SELECT email FROM contacts WHERE tenant_id = 'beta'", 'alpha'), /crosses a workspace/);
  assert.throws(() => scope.scopeStatement('INSERT INTO contacts(id, tenant_id) VALUES(?, ?)', 'alpha', ['c1', 'beta']), /crosses a workspace/);
  const wrapped = scope.scopeStatement('SELECT email FROM contacts c JOIN accounts a ON a.id = c.account_id WHERE c.state = ?', 'alpha');
  assert.match(wrapped, /tenant_id = 'alpha'/);
  assert.equal(wrapped.includes('beta'), false);
  assert.throws(() => scope.assertSend(10, 1, 10), /send limit/);

  const signupPage = await request('GET', '/signup');
  assert.equal(signupPage.status, 200);
  assert.match(signupPage.body, /Company name/);
  assert.match(signupPage.body, /Passcode/);
  assert.equal(/cisco/i.test(signupPage.body), false);

  const home = await request('GET', '/');
  assert.equal(/Harborlight/.test(home.body), false);
  assert.match(home.body, /Create a workspace/);

  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const created = await request('POST', '/api/signup', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: 'Harborlight', color: '#9a3412', logo, adminName: 'Ada Harbor', email: 'ada.harbor@harborlight.example', passcode: 'harbor-pass-1' })
  });
  assert.equal(created.status, 200, created.body);
  const harbor = json(created);
  const cookieA = cookie(created);
  assert.equal(harbor.slug, 'harborlight');
  assert.equal(harbor.inbound, 'northwind-mops+harborlight@agentmail.to');
  assert.match(cookieA, /mops_company=/);

  const other = await request('POST', '/api/signup', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: 'Fieldnote', color: '#1d4ed8', adminName: 'Bo Field', email: 'bo.field@fieldnote.example', passcode: 'field-pass-1' })
  });
  assert.equal(other.status, 200, other.body);
  const field = json(other);
  const cookieB = cookie(other);

  const bad = await request('POST', '/api/workspace/login', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada.harbor@harborlight.example', passcode: 'wrong-pass-1' })
  });
  assert.equal(bad.status, 401);

  const file = path.join(dir, 'workspaces', harbor.id, 'platform.db');
  const raw = new (require('better-sqlite3'))(file, { readonly: true });
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  const names = new Set(tables.map(row => row.name));
  for (const name of scope.TABLES) assert.ok(names.has(name), name);
  for (const name of names) {
    if (name === 'schema_migrations') continue;
    assert.ok(scope.SCOPED.has(name), name);
    const cols = raw.prepare('PRAGMA table_info(' + name + ')').all();
    assert.ok(cols.some(col => col.name === 'tenant_id'), name);
  }
  raw.close();

  const contacts = 'Email Address,First Name,Last Name,Job Title,Company,Country,State,City,Consent\ncasey.pike@harborlight.example,Casey,Pike,CISO,Harborlight,United States,Illinois,Chicago,opted_in\n';
  const campaigns = 'Campaign Name,Region,Program,Owner,City,Country,Start Date,End Date,Budget\nHarborlight breakfast,Americas,Events,Ada Harbor,Chicago,United States,2026-11-01,2026-11-01,12000\n';
  const loaded = await request('POST', '/api/workspace/onboarding', {
    headers: { 'content-type': 'application/json', cookie: cookieA },
    body: JSON.stringify({ sample: true, contactsCsv: contacts, campaignsCsv: campaigns })
  });
  assert.equal(loaded.status, 200, loaded.body);
  const load = json(loaded);
  assert.equal(load.sample, true);
  assert.equal(load.contacts.mapped.email, 'email address');
  assert.equal(load.contacts.imported, 1);
  assert.equal(load.campaigns.mapped.name, 'campaign name');
  assert.equal(load.campaigns.imported, 1);

  const fieldContacts = 'Email,First,Last,Company\nonly.fieldnote@fieldnote.example,Only,Fieldnote,Fieldnote\n';
  const fieldLoad = await request('POST', '/api/workspace/onboarding', {
    headers: { 'content-type': 'application/json', cookie: cookieB },
    body: JSON.stringify({ contactsCsv: fieldContacts })
  });
  assert.equal(fieldLoad.status, 200, fieldLoad.body);

  async function find(cookieJar, q) {
    const res = await request('GET', '/api/platform/data/tables/contacts?q=' + encodeURIComponent(q), { headers: { cookie: cookieJar } });
    assert.equal(res.status, 200, res.body);
    return json(res);
  }
  assert.equal((await find(cookieA, 'only.fieldnote@fieldnote.example')).total, 0);
  assert.equal((await find(cookieB, 'casey.pike@harborlight.example')).total, 0);
  assert.equal((await find(cookieA, 'casey.pike@harborlight.example')).total, 1);
  assert.equal((await find(cookieB, 'only.fieldnote@fieldnote.example')).total, 1);
  const breakfast = await request('GET', '/api/platform/data/tables/campaigns?q=' + encodeURIComponent('Harborlight breakfast'), { headers: { cookie: cookieB } });
  assert.equal(json(breakfast).total, 0);

  const Database = require('better-sqlite3');
  const live = new Database(file);
  live.prepare('INSERT INTO accounts(id, name, domain, region, industry, employees, tier, country, city, tenant_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run('A-foreign', 'Other Co', 'other.example', 'Americas', 'Fictional', 10, 3, 'United States', 'Chicago', 'wother');
  live.prepare('INSERT INTO contacts(id, account_id, email, first_name, last_name, title, country, state, city, fit, behavior, score, stage, tenant_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('C-foreign', 'A-foreign', 'foreign.only@other.example', 'Foreign', 'Only', 'CIO', 'United States', 'Illinois', 'Chicago', 1, 0, 1, 'lead', 'wother');
  live.close();
  assert.equal((await find(cookieA, 'foreign.only@other.example')).total, 0);
  const sandbox = require('../../backend/sandbox');
  const db = require('../../platform/db');
  await sandbox.run(path.dirname(file), () => scope.bind(harbor.id, async () => {
    await db.open();
    const hidden = await db.current().get('SELECT email FROM contacts WHERE email = ?', ['foreign.only@other.example']);
    const shown = await db.current().get('SELECT email FROM contacts WHERE email = ?', ['casey.pike@harborlight.example']);
    assert.equal(hidden, undefined);
    assert.equal(shown.email, 'casey.pike@harborlight.example');
  }));

  const rules = await request('POST', '/api/workspace/settings', {
    headers: { 'content-type': 'application/json', cookie: cookieA },
    body: JSON.stringify({
      approverName: 'Riley Cho', approverEmail: 'riley.cho@harborlight.example', sendLimit: 80,
      territories: [{ country: 'United States', region: 'Americas', ae: 'Riley Cho', sdr: 'Sam Okonkwo' }],
      webexToken: 'workspace-bot-token', webexEmail: 'harbor-bot@webex.example', webexSecret: 'workspace-webex-secret'
    })
  });
  assert.equal(rules.status, 200, rules.body);
  assert.equal(json(rules).sendLimit, 80);
  assert.equal(json(rules).webex, true);
  assert.equal(JSON.stringify(json(rules)).includes('workspace-bot-token'), false);
  const territory = await request('GET', '/api/platform/data/tables/territories?q=United%20States', { headers: { cookie: cookieA } });
  assert.match(territory.body, /Riley Cho/);

  const invite = await request('POST', '/api/workspace/invite', {
    headers: { 'content-type': 'application/json', cookie: cookieA },
    body: JSON.stringify({ name: 'Riley Cho', email: 'riley.cho@harborlight.example', role: 'approver' })
  });
  assert.equal(invite.status, 200, invite.body);
  const invited = json(invite);
  assert.equal(invited.role, 'approver');
  const approver = await request('POST', '/api/workspace/login', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: invited.email, passcode: invited.passcode })
  });
  assert.equal(approver.status, 200, approver.body);
  const cookieR = cookie(approver);

  const ask = await request('POST', '/api/platform/ask', {
    headers: { 'content-type': 'application/json', cookie: cookieA },
    body: JSON.stringify({ text: '@mops who can I email in Illinois', channel: 'App' })
  });
  assert.equal(ask.status, 200, ask.body);
  assert.match(json(ask).reply, /37 opted-in/);
  const budget = await request('POST', '/api/platform/ask', {
    headers: { 'content-type': 'application/json', cookie: cookieA },
    body: JSON.stringify({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'App' })
  });
  assert.equal(budget.status, 200, budget.body);
  assert.match(json(budget).reply, /Waiting on Chris/);
  const approved = await request('POST', '/api/platform/ask', {
    headers: { 'content-type': 'application/json', cookie: cookieR },
    body: JSON.stringify({ text: '@mops approve Chicago', channel: 'App' })
  });
  assert.equal(approved.status, 200, approved.body);
  assert.match(json(approved).reply, /approved/i);
  assert.match(json(approved).reply, /BAN/);
  const otherPackets = await request('GET', '/api/platform/spend/packets', { headers: { cookie: cookieB } });
  assert.equal(otherPackets.status, 200, otherPackets.body);
  assert.equal(/180000|180,000/.test(otherPackets.body), false);

  const desk = await request('GET', '/platform', { headers: { cookie: cookieA } });
  assert.equal(desk.status, 200, desk.body);
  assert.match(desk.body, /Harborlight/);
  assert.match(desk.body, /#9a3412/);
  const ops = await request('GET', '/platform/ops', { headers: { cookie: cookieA } });
  assert.match(ops.body, /Run live demo/);
  assert.match(ops.body, /\/api\/platform\/ops\/stream/);
  assert.match(ops.body, /Email and Webex/);
  assert.match(ops.body, /northwind-mops\+harborlight@agentmail\.to/);
  const logoRes = await request('GET', '/api/workspace/logo', { headers: { cookie: cookieA } });
  assert.equal(logoRes.status, 200);
  assert.match(String(logoRes.headers['content-type'] || ''), /image\/png/);
  const logoB = await request('GET', '/api/workspace/logo', { headers: { cookie: cookieB } });
  assert.equal(logoB.status, 404);

  sent.length = 0;
  const magic = await request('POST', '/api/workspace/magic', {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada.harbor@harborlight.example' })
  });
  assert.equal(magic.status, 200, magic.body);
  assert.equal(json(magic).sent, true);
  const link = JSON.parse(sent[0].body).text.match(/https?:\/\/\S+/)[0];
  const consumed = await request('GET', link.replace('http://127.0.0.1:8799', ''));
  assert.equal(consumed.status, 303);
  assert.match(cookie(consumed), /mops_company=/);

  const mail = JSON.stringify({
    event_type: 'message.received',
    event_id: 'mail-harbor-1',
    message: {
      from_: ['Ada Harbor <ada.harbor@harborlight.example>'],
      to: ['northwind-mops+harborlight@agentmail.to'],
      inbox_id: 'northwind-mops@agentmail.to',
      message_id: 'mail-harbor-1',
      subject: '@mops who can I email in Illinois',
      text: '@mops who can I email in Illinois'
    }
  });
  const tagged = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'tenant-inbound-secret' },
    body: mail
  });
  assert.equal(tagged.status, 200, tagged.body);
  assert.match(json(tagged).reply, /37 opted-in/);
  assert.match(json(tagged).link, /\/api\/workspace\/magic\?token=/);
  const stranger = await request('POST', '/api/inbound/email', {
    headers: { 'content-type': 'application/json', 'x-mops-inbound-secret': 'tenant-inbound-secret' },
    body: JSON.stringify({
      event_type: 'message.received', event_id: 'mail-stranger',
      message: { from_: ['pat.stranger@example.com'], to: ['northwind-mops+harborlight@agentmail.to'], inbox_id: 'northwind-mops@agentmail.to', message_id: 'mail-stranger', subject: '@mops hello', text: '@mops hello' }
    })
  });
  assert.equal(stranger.status, 403);
  const inboxA = await request('GET', '/api/platform/ops/inbox', { headers: { cookie: cookieA } });
  assert.match(inboxA.body, /ada.harbor@harborlight.example/);
  const inboxB = await request('GET', '/api/platform/ops/inbox', { headers: { cookie: cookieB } });
  assert.equal(inboxB.body.includes('ada.harbor@harborlight.example'), false);
  const why = await request('GET', '/api/platform/brain/why?q=' + encodeURIComponent('Email from ada.harbor'), { headers: { cookie: cookieA } });
  assert.match(why.body, /Email from ada.harbor@harborlight.example/);

  const webexBody = JSON.stringify({
    resource: 'messages', event: 'created',
    data: { id: 'wx-harbor-1', personEmail: 'ada.harbor@harborlight.example', text: '@mops who can I email in Illinois', roomId: 'room-harbor' }
  });
  const sig = crypto.createHmac('sha1', 'workspace-webex-secret').update(webexBody).digest('hex');
  sent.length = 0;
  const webex = await request('POST', '/api/inbound/webex', {
    headers: { 'content-type': 'application/json', 'x-spark-signature': sig },
    body: webexBody
  });
  assert.equal(webex.status, 200, webex.body);
  assert.equal(json(webex).delivered, true);
  assert.match(sent[0].headers.authorization || sent[0].headers.Authorization, /workspace-bot-token/);
  assert.match(String(sent[0].url), /webexapis.com\/v1\/messages/);
  const opsAgain = await request('GET', '/api/platform/ops/inbox', { headers: { cookie: cookieA } });
  assert.match(opsAgain.body, /Webex/);
});
