// Two processes, two data directories, one browser's signed log. Requests alternate.
const os = require('os'), path = require('path'), fs = require('fs'), test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('../stack');

const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-a-'));
const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-b-'));
const base = { MOPS_SESSION_SECRET: '', MOPS_AUTOPILOT: '0', SYNC_MAX_ATTEMPTS: '3', ELT_MS: '0', PULL_MS: '999999', CRM_FAIL_RATE: '0', COVER_MS: '0' };
const A = { ...base, MOPS_PORT: '9691', ENGINE_PORT: '9692', CRM_PORT: '9693', MAIL_PORT: '9694', SMTP_PORT: '9695', WH_PORT: '9696', MOPS_DATA_DIR: dirA, MOPS_RUNS_DIR: path.join(dirA, 'runs'), MOPS_PUBLIC: 'http://127.0.0.1:9691' };
const B = { ...base, MOPS_PORT: '9697', ENGINE_PORT: '9698', CRM_PORT: '9699', MAIL_PORT: '9700', SMTP_PORT: '9708', WH_PORT: '9709', MOPS_DATA_DIR: dirB, MOPS_RUNS_DIR: path.join(dirB, 'runs'), MOPS_PUBLIC: 'http://127.0.0.1:9697' };
let sa, sb, i = 0, log = '0', maria = '', chris = '';
const roots = ['http://127.0.0.1:9691', 'http://127.0.0.1:9697'];

async function rr(pathname, opt = {}) {
  const root = roots[i++ % 2];
  const headers = { cookie: opt.cookie || maria, 'content-type': 'application/json', 'x-mops-log': log, ...(opt.headers || {}) };
  const r = await fetch(root + pathname, { method: opt.method || (opt.body !== undefined ? 'POST' : 'GET'), headers, body: opt.body === undefined ? undefined : JSON.stringify(opt.body), redirect: 'manual' });
  const next = r.headers.get('x-mops-log');
  if (next) log = next;
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (body && body.mopsLog) log = body.mopsLog;
  return { status: r.status, body, headers: r.headers, root };
}

test.before(async () => { sa = await start(A, { quiet: true }); sb = await start(B, { quiet: true }); });
test.after(() => { sa && sa.stop(); sb && sb.stop(); });

test('a campaign survives two instances with separate /tmp', async () => {
  const loginPage = await fetch('http://127.0.0.1:9691/login', { redirect: 'manual' });
  assert.equal(loginPage.status, 303);

  const lm = await fetch('http://127.0.0.1:9691/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mops-log': '0' }, body: JSON.stringify({ user: 'maria' }) });
  maria = (lm.headers.get('set-cookie') || '').split(';')[0];
  assert.equal(lm.status, 200);
  const lc = await fetch('http://127.0.0.1:9697/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mops-log': '0' }, body: JSON.stringify({ user: 'chris' }) });
  chris = (lc.headers.get('set-cookie') || '').split(';')[0];
  assert.equal(lc.status, 200);
  log = lm.headers.get('x-mops-log') || '0';

  const started = await rr('/api/engine/lifecycle/start', { cookie: maria, body: { text: 'Chicago security roundtable at the River North Club, March 18-19 2026, zero trust, for CIOs, $180,000 USD' } });
  assert.equal(started.status, 200, JSON.stringify(started.body).slice(0, 300));
  assert.equal(started.body.fields.city, 'Chicago');
  assert.ok(started.body.budget.usd > 150000);
  const services = (started.body.trace || []).map(s => s.service);
  assert.ok(services.includes('Intake agent'), services.join(','));
  assert.ok(services.includes('FX'), services.join(','));
  assert.ok(services.includes('Policy engine'), services.join(','));
  assert.ok(services.includes('Budget ledger'), services.join(','));
  const id = started.body.id;

  const sub = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'submit-budget' } });
  assert.equal(sub.body.budget.status, 'pending_approval', sub.body.error);
  assert.ok((sub.body.trace || []).some(s => s.service === 'Audit log' && s.response && s.response.hash));

  const denied = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'approve-budget' } });
  assert.match(denied.body.error || '', /approver/i);

  const ap = await rr('/api/engine/lifecycle/' + id, { cookie: chris, body: { action: 'approve-budget' } });
  assert.equal(ap.body.budget.status, 'approved');
  assert.equal(ap.body.budget.approver, 'Chris M.');

  const sow = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'continue' } });
  assert.equal(sow.body.step, 'sow', sow.body.error);
  const text = 'Agency: Harbor North Events\nVenue: River North Club\nAmount: $180,000\nNo GST or VAT is added.';
  const ingested = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'ingest-sow', patch: { name: 'sow.txt', text } } });
  assert.ok(ingested.body.sow, ingested.body.error);
  const blocked = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'sign-sow' } });
  assert.match(blocked.body.error || '', /Chris/);
  const answers = {};
  for (const q of sow.body.sow.questions || []) answers[q.key] = q.key === 'venue' ? 'River North Club' : q.key === 'cost_center' ? 'CC-4408' : 'Harbor North Events';
  await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'save-sow', patch: { answers } } });
  const signed = await rr('/api/engine/lifecycle/' + id, { cookie: chris, body: { action: 'sign-sow' } });
  assert.equal(signed.body.sow.signedBy, 'Chris M.', signed.body.error);
  const codes = await rr('/api/engine/lifecycle/' + id, { cookie: chris, body: { action: 'continue' } });
  assert.equal(codes.body.step, 'codes', codes.body.error);
  assert.match(codes.body.codes.campaign_code, /^FY\d{2}Q[1-4]-/);
  assert.match(codes.body.codes.ban_id, /^BAN-/);
  assert.ok((codes.body.trace || []).some(s => s.service === 'BAN registry'));
  assert.ok((codes.body.trace || []).some(s => s.service === 'SFDC sync' && s.response && s.response.simulated));

  const csv = Buffer.from('Email,FirstName,LastName,Company,Title,Country\nada@acme.example,Ada,Klein,Acme,CIO,United States\n').toString('base64');
  const preview = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'preview-upload', patch: { name: 'list.csv', base64: csv } } });
  assert.ok(preview.body.jobs && preview.body.jobs.upload, preview.body.error);
  assert.ok((preview.body.trace || []).some(s => s.service === 'Upload'));
  const confirmed = await rr('/api/engine/lifecycle/' + id, { cookie: maria, body: { action: 'confirm-upload', patch: {} } });
  assert.equal(confirmed.status, 200, confirmed.body.error);
  const again = await rr('/api/engine/lifecycle/' + id, { cookie: chris });
  assert.equal(again.body.codes.campaign_code, codes.body.codes.campaign_code);
  assert.equal(again.body.setup.mapping.confirmed, true);
  const file = await rr('/api/engine/lifecycle/' + id + '/upload.csv', { cookie: maria });
  assert.match(String(file.body), /Email|CampaignId/);

  const arch = await rr('/api/engine/architecture', { cookie: maria });
  assert.deepEqual((arch.body.layers || []).map(l => l.id), ['channels', 'brain', 'agents', 'bus', 'systems', 'data']);
  const events = await rr('/api/engine/events?since=0', { cookie: maria });
  assert.equal(events.status, 200);
  assert.ok(Array.isArray(events.body.events));
  const explorer = await rr('/api/engine/explorer', { cookie: maria });
  assert.ok((explorer.body.tables || []).some(t => t.id === 'budget_ledger' && t.count >= 1));
  assert.ok((explorer.body.tables || []).some(t => t.id === 'ban_registry' && t.count >= 1));
  const contacts = (explorer.body.tables || []).find(t => t.id === 'contacts');
  const leads = (explorer.body.tables || []).find(t => t.id === 'leads');
  assert.ok(contacts && contacts.count > 0);
  assert.ok(leads && leads.count > 0 && leads.count !== contacts.count);
  const arch2 = await rr('/api/engine/architecture', { cookie: maria });
  const data = (arch2.body.layers || []).find(l => l.id === 'data');
  const same = id => (data.nodes || []).find(n => n.id === id);
  assert.equal(String(same('d-contacts').badge), String(contacts.count));
  assert.equal(String(same('d-leads').badge), String(leads.count));
  const ledger = (explorer.body.tables || []).find(t => t.id === 'budget_ledger');
  assert.equal(String(same('d-budgets').badge), String(ledger.count));
});

const net = require('net');
function portFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function waitFree(port) {
  for (let n = 0; n < 40; n++) { if (await portFree(port)) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('port still busy ' + port);
}
function killStack(s) { if (!s) return; for (const k of s.kids || []) { try { k.kill('SIGKILL'); } catch (e) {} } }
let seedSnap = '', coldTurn = 0;
async function coldFetch(pathname, opt = {}) {
  const which = (coldTurn++ % 2) === 0 ? 'A' : 'B';
  killStack(which === 'A' ? sa : sb);
  const port = which === 'A' ? 9691 : 9697;
  await waitFree(port);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-cold-'));
  fs.cpSync(seedSnap, dir, { recursive: true });
  const env = { ...(which === 'A' ? A : B), MOPS_DATA_DIR: dir, MOPS_RUNS_DIR: path.join(dir, 'runs') };
  const started = await start(env, { quiet: true });
  if (which === 'A') sa = started; else sb = started;
  const headers = { cookie: opt.cookie || maria, 'content-type': 'application/json', 'x-mops-log': opt.log == null ? log : opt.log, ...(opt.headers || {}) };
  const r = await fetch('http://127.0.0.1:' + port + pathname, { method: opt.method || (opt.body !== undefined ? 'POST' : 'GET'), headers, body: opt.body === undefined ? undefined : JSON.stringify(opt.body) });
  const next = r.headers.get('x-mops-log');
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  if (body && body.mopsLog) { log = body.mopsLog; delete body.mopsLog; }
  else if (next) log = next;
  return { status: r.status, body, port };
}

test('Mei SGD 220000 reaches launch on a cold instance, five times', { timeout: 420000 }, async () => {
  killStack(sa); killStack(sb); sa = null; sb = null;
  await waitFree(9691); await waitFree(9697);
  seedSnap = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-seed-'));
  fs.cpSync(dirA, seedSnap, { recursive: true });
  const warm = await start({ ...A, MOPS_DATA_DIR: seedSnap, MOPS_RUNS_DIR: path.join(seedSnap, 'runs') }, { quiet: true });
  sa = warm;
  const lm = await fetch('http://127.0.0.1:9691/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mops-log': '0' }, body: JSON.stringify({ user: 'mei' }) });
  const mei = (lm.headers.get('set-cookie') || '').split(';')[0];
  assert.equal(lm.status, 200, 'mei login');
  const lc = await fetch('http://127.0.0.1:9691/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mops-log': '0' }, body: JSON.stringify({ user: 'chris' }) });
  const chrisCookie = (lc.headers.get('set-cookie') || '').split(';')[0];
  assert.equal(lc.status, 200, 'chris login');
  killStack(sa); sa = null; await waitFree(9691);
  const sample = 'FirstName,LastName,Email,Company,Title,Country,Consent\nAda,Klein,ada.tan@acme.example,Acme,CIO,Singapore,yes\nBo,Held,bo.held@example.com,Example,CISO,Singapore,\n';
  for (let n = 0; n < 5; n++) {
    log = '0';
    const out = await coldFetch('/api/logout', { method: 'POST', cookie: mei, body: {} });
    assert.equal(out.status, 200, 'logout ' + n + ' ' + JSON.stringify(out.body).slice(0, 180));
    const stale = await coldFetch('/api/engine/lifecycle/LC-NONE', { method: 'POST', cookie: mei, headers: { 'x-mops-log-id': 'not-this-instance' }, log: '', body: { action: 'continue' } });
    assert.notEqual(stale.status, 409, 'stale id must not 409');
    assert.ok(stale.status < 500, 'stale id ' + stale.status);
    const started = await coldFetch('/api/engine/lifecycle/start', { cookie: mei, body: { text: 'Singapore summit for CISOs, 12 Nov 2026, zero trust, SGD 220,000' } });
    assert.equal(started.status, 200, JSON.stringify(started.body).slice(0, 400));
    assert.equal(started.body.fields.campaign_type, 'Summit');
    assert.equal(started.body.fields.currency, 'SGD');
    assert.ok(started.body.budget.usd > 150000, String(started.body.budget && started.body.budget.usd));
    assert.equal(started.body.fields.owner, 'Mei Tan');
    const services = (started.body.trace || []).map(s => s.service);
    assert.ok(services.includes('FX'), services.join(','));
    assert.ok(!(JSON.stringify(started.body.trace || []).includes('LIMIT_USD')));
    assert.ok(!(JSON.stringify(started.body.trace || []).includes('hash-chained')));
    const id = started.body.id;
    const sub = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'submit-budget' } });
    assert.equal(sub.status, 200, JSON.stringify(sub.body).slice(0, 300));
    assert.equal(sub.body.budget.status, 'pending_approval', sub.body.error);
    const led = (sub.body.trace || []).find(s => s.service === 'Budget ledger' && s.response && s.response.written === true);
    assert.ok(led, JSON.stringify((sub.body.trace || []).map(s => s.service + ':' + s.name)));
    assert.ok((sub.body.trace || []).some(s => s.service === 'FX' && s.response && s.response.pinned === true));
    const ap = await coldFetch('/api/engine/lifecycle/' + id, { cookie: chrisCookie, body: { action: 'approve-budget' } });
    assert.equal(ap.status, 200, JSON.stringify(ap.body).slice(0, 240));
    assert.equal(ap.body.budget.status, 'approved');
    assert.equal(ap.body.budget.approver, 'Chris M.');
    const sow = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'continue' } });
    assert.equal(sow.status, 200, JSON.stringify(sow.body).slice(0, 300));
    assert.equal(sow.body.step, 'sow', sow.body.error || sow.body.step);
    const answers = {};
    for (const q of (sow.body.sow && sow.body.sow.questions) || []) answers[q.key] = q.key === 'venue' ? 'Marina Bay' : q.key === 'cost_center' ? 'CC-4408' : q.key === 'client_pm' ? 'Mei Tan' : 'Bright Harbour Events';
    const saved = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'save-sow', patch: { answers } } });
    assert.equal(saved.status, 200, saved.body && saved.body.error);
    const signed = await coldFetch('/api/engine/lifecycle/' + id, { cookie: chrisCookie, body: { action: 'sign-sow' } });
    assert.equal(signed.body.sow && signed.body.sow.signedBy, 'Chris M.', signed.body.error);
    const codes = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'continue' } });
    assert.equal(codes.status, 200, JSON.stringify(codes.body).slice(0, 300));
    assert.equal(codes.body.step, 'codes', codes.body.error);
    assert.match(codes.body.codes.ban_id, /^BAN-/);
    assert.ok(codes.body.codes.sfdc_campaign_id, 'sfdc id');
    assert.ok((codes.body.trace || []).some(s => s.service === 'BAN registry'));
    assert.ok((codes.body.trace || []).some(s => s.service === 'SFDC sync' && s.response && s.response.simulated === true));
    const preview = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'preview-upload', patch: { name: 'sample-list.csv', csv: sample } } });
    assert.equal(preview.status, 200, preview.body && preview.body.error);
    assert.ok(preview.body.jobs && preview.body.jobs.upload && preview.body.jobs.upload.report.input >= 2, preview.body.error);
    const confirmed = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'confirm-upload', patch: {} } });
    assert.equal(confirmed.status, 200, confirmed.body && confirmed.body.error);
    assert.equal(confirmed.body.setup.mapping.confirmed, true);
    const setup = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'continue' } });
    assert.equal(setup.body.step, 'setup', setup.body.error);
    const live = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei, body: { action: 'launch' } });
    assert.equal(live.status, 200, JSON.stringify(live.body).slice(0, 300));
    assert.ok(live.body.step === 'run' || live.body.step === 'report', live.body.error || live.body.step);
    const explorer = await coldFetch('/api/engine/explorer', { cookie: mei });
    assert.equal(explorer.status, 200);
    assert.ok((explorer.body.tables || []).some(t => t.id === 'sow' && t.count >= 1));
    assert.ok((explorer.body.tables || []).some(t => t.id === 'ban_registry' && t.count >= 1));
    assert.ok((explorer.body.tables || []).some(t => t.id === 'budget_ledger' && t.count >= 1));
    const again = await coldFetch('/api/engine/lifecycle/' + id, { cookie: mei });
    assert.equal(again.body.step, live.body.step);
    assert.equal(again.body.codes.ban_id, codes.body.codes.ban_id);
  }
});
