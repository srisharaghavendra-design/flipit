'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-platform-'));
process.env.MOPS_DATA_DIR = dir;
process.env.MOPS_AUTOPILOT = '0';
process.env.PLATFORM_DB = 'sqlite';
delete process.env.PLATFORM_REGION;
const test = require('node:test');
const assert = require('node:assert/strict');

test('data core and engage finish the marketer asks', { timeout: 120000 }, async () => {
  const { ensure } = require('../../platform');
  const { current } = require('../../platform/db');
  const data = require('../../platform/data');
  const engage = require('../../platform/engage');
  const brain = require('../../platform/brain');
  const { planDriver, adapt, toPg } = require('../../platform/sql');
  const { CODE_RE } = require('../../platform/seed');
  const mail = require('../mail');
  await ensure();
  const db = current();

  const counts = await data.counts();
  assert.equal(counts.contacts, 5000);
  assert.equal(counts.accounts, 300);
  assert.equal(counts.campaigns, 40);
  assert.deepEqual(counts.regions.sort(), ['APJ', 'Americas', 'EMEA', 'Global']);
  assert.equal(counts.dialect, 'sqlite');
  assert.ok(counts.log > 5000, 'every seeded write should be in the event log');
  const cols = (await db.all('PRAGMA table_info(contacts)')).map(r => r.name);
  for (const name of ['email', 'title', 'state', 'fit', 'score', 'stage']) assert.ok(cols.includes(name));
  const consent = await db.get('SELECT source, at, country, status FROM consent WHERE current = 1 LIMIT 1');
  assert.ok(consent.source && consent.at && consent.country && consent.status);
  const codes = await db.all("SELECT value FROM codes WHERE kind = 'campaign'");
  assert.equal(codes.length, 40);
  for (const row of codes) assert.match(row.value, CODE_RE);
  const chicago = await data.campaign('CAMP-CHI');
  assert.equal(chicago.campaign.owner, 'Rosa Diaz');
  assert.equal(chicago.campaign.start_date, '2026-03-19');
  assert.equal(chicago.sow.venue, 'River North Club, Salon B');
  assert.equal(chicago.codes.find(c => c.kind === 'campaign').value, 'FY26Q3-USA-EVT-0101');
  const why = await data.log({ q: 'venue', limit: 10 });
  const moved = why.rows.filter(r => /Moved the Chicago security roundtable/.test(r.why));
  assert.equal(moved.length, 1);
  assert.match(moved[0].why, /Jordan Hale's email on 14 Oct/);
  assert.equal(moved[0].channel, 'Email');
  assert.equal(moved[0].source_message, 'EM-JH-1014');
  const chicagoFeed = await data.log({ q: 'Chicago', limit: 20 });
  assert.equal(chicagoFeed.rows.filter(r => /Moved the Chicago security roundtable/.test(r.why)).length, 1);
  const confusing = await data.log({ q: 'does not own', limit: 5 });
  assert.equal(confusing.rows.length, 0);
  const lastTpl = await db.get("SELECT subject, html FROM templates WHERE id = 'TPL-N2'");
  assert.equal(lastTpl.subject, 'Last call for the Chicago security roundtable');
  assert.doesNotMatch(lastTpl.subject + lastTpl.html, /\{\{campaign\}\}/);
  const dupNames = await db.all('SELECT name FROM campaigns GROUP BY name HAVING COUNT(*) > 1');
  assert.deepEqual(dupNames, []);
  const names = await db.all('SELECT name FROM campaigns');
  assert.equal(names.find(r => / abm\b/.test(r.name)), undefined);

  const illinois = await data.emailable({ state: 'Illinois', country: 'United States' });
  assert.equal(illinois.count, 36);
  const rules = { all: [
    { field: 'contact.title', op: 'eq', value: 'CIO' },
    { field: 'contact.state', op: 'eq', value: 'Illinois' },
    { field: 'activity.open', op: 'within_days', value: 30 },
    { field: 'consent.status', op: 'eq', value: 'opted_in' }
  ] };
  assert.equal((await engage.preview(rules)).count, 30);

  const wide = await engage.saveSegment({
    name: 'All Illinois CIOs', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test',
    rules: { all: [{ field: 'contact.title', op: 'eq', value: 'CIO' }, { field: 'contact.state', op: 'eq', value: 'Illinois' }] }
  });
  const gated = await engage.send({ segmentId: wide.id, templateId: 'TPL-CHI', campaignId: 'CAMP-CHI', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test', idempotencyKey: 'test:wide' });
  assert.equal(gated.sent, 30);
  assert.equal(gated.held, 8);
  const leaked = mail.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE html LIKE '%{{%' OR subject LIKE '%{{%'").get().n;
  assert.equal(leaked, 0);
  const sample = mail.db.prepare('SELECT html, subject FROM messages ORDER BY id DESC LIMIT 1').get();
  assert.match(sample.subject, /Chicago security roundtable/);
  assert.match(sample.html, /Hi /);
  assert.match(sample.html, /\/platform\/t\/o\//);

  const timed = async (fn) => {
    const t = process.hrtime.bigint();
    const value = await fn();
    return { value, ms: Number(process.hrtime.bigint() - t) / 1e6 };
  };
  await data.counts();
  for (const run of [() => data.counts(), () => data.browse('contacts', { limit: 20 }), () => data.log({ limit: 20 }), () => engage.preview(rules)]) {
    const hit = await timed(run);
    assert.ok(hit.ms < 300, 'read took ' + hit.ms.toFixed(1) + 'ms');
  }

  const who = await brain.ask({ text: '@mops who can I email in Illinois', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(who.ok, true);
  assert.equal(who.askId, 'illinois-email');
  assert.match(who.reply, /36 opted-in/);
  assert.ok(who.ms < 300, 'illinois ask ' + who.ms + 'ms');
  const send = await brain.ask({ text: '@mops send the Chicago invite to CIOs in Illinois who opened last month', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(send.ok, true);
  assert.equal(send.result.sent, 30);
  assert.equal(send.result.held, 0);
  assert.ok(send.calls.some(c => c.api === 'POST /api/platform/engage/sends'));
  assert.ok(send.ms < 300, 'send ask ' + send.ms + 'ms');
  const again = await brain.ask({ text: '@mops send the Chicago invite to CIOs in Illinois who opened last month', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(again.result.idempotent, true);
  assert.match(again.reply, /No second copy/);

  const segId = send.result.segment_id || (await db.get("SELECT id FROM segments WHERE name = ?", ['CIOs in Illinois who opened last month'])).id;
  const before = await engage.scores({ segmentId: segId });
  assert.equal(before.mqls, 0);
  const sim = await engage.simulate(send.result.id, { opens: true, clicks: true });
  assert.equal(sim.opened, 14);
  assert.equal(sim.clicked, 4);
  assert.equal(sim.opens, 14);
  assert.equal(sim.clicks, 4);
  assert.ok(sim.openRate > 0.4 && sim.openRate < 0.5, 'open rate ' + sim.openRate);
  assert.ok(sim.clickRate > 0.1 && sim.clickRate < 0.16, 'click rate ' + sim.clickRate);
  const after = await engage.scores({ segmentId: segId });
  assert.equal(after.mqls, 4);
  assert.ok(after.top.some(p => p.stage === 'mql' && p.state === 'Illinois'));
  assert.ok(after.top.some(p => p.stage === 'lead' && p.state === 'Illinois' && p.score < 70));
  const rates = await engage.getSend(send.result.id);
  assert.equal(rates.opens, 14);
  assert.equal(rates.clicks, 4);
  const token = (await db.get('SELECT token FROM send_recipients WHERE send_id = ? AND opened = 1 LIMIT 1', [send.result.id])).token;
  const dup = await engage.mark(token, 'open', 'Recorded an open from the tracking pixel.');
  assert.equal(dup.duplicate, true);
  const againSim = await engage.simulate(send.result.id, { opens: true, clicks: true });
  assert.equal(againSim.opened, 0);
  assert.equal(againSim.clicked, 0);
  assert.equal(againSim.opens, 14);
  assert.equal(againSim.idempotent, true);

  const mql = await brain.ask({ text: '@mops who is an MQL on the Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(mql.reply, /4 of 30/);
  const nurture = await brain.ask({ text: '@mops enroll clickers who have not registered into the Chicago nurture', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(nurture.result.enrolled, 4);
  assert.equal(nurture.result.sent, 4);
  assert.match(nurture.reply, /48 hours/);
  const second = await engage.tickJourney('J-CHI', { actor: 'Maria Alvarez' });
  assert.equal(second.sent, 0);
  const rate = await brain.ask({ text: '@mops what is the open rate on the Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(rate.reply, /Open rate 47%/);
  assert.match(rate.reply, /14 of 30/);
  const draft = await brain.ask({ text: '@mops draft a Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(draft.reply, /Draft only/);
  assert.doesNotMatch(draft.reply, /\{\{/);
  const venue = await brain.ask({ text: '@mops why did the Chicago venue change', channel: 'Email', actor: 'Maria Alvarez' });
  assert.match(venue.reply, /Jordan Hale's email on 14 Oct/);
  assert.match(venue.reply, /Source Jordan Hale's email, 14 Oct/);
  assert.doesNotMatch(venue.reply, /EM-JH-1014/);
  assert.match(venue.reply, /River North Club, Salon B/);
  assert.match(venue.reply, /19 Mar/);
  assert.equal(venue.channel, 'Email');
  const held = await brain.ask({ text: '@mops hold the German contacts who have no consent', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.match(held.reply, /Held \d+ German/);
  assert.ok(held.result.count >= 15);
  const record = await brain.ask({ text: '@mops show me the Chicago campaign', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(record.reply, /Rosa Diaz/);
  assert.match(record.reply, /FY26Q3-USA-EVT-0101/);
  const later = await brain.ask({ text: '@mops weekly report for Americas', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(later.matched, true);
  assert.equal(later.askId, 'weekly-americas');
  assert.match(later.reply, /Weekly report for Americas/);
  assert.equal(later.downloads[0].label, 'Download PowerPoint');
  assert.equal(later.downloads[1].label, 'Download PDF');
  assert.match(later.downloads[0].href, /weekly\.pptx/);
  assert.doesNotMatch(later.reply, /\/api\//);
  assert.notEqual(later.result.goal, later.result.pipeline);
  assert.ok(later.ms < 300, 'weekly ask ' + later.ms + 'ms');
  assert.equal(later.channel, 'Email');

  const vp = await db.get("SELECT email FROM contacts WHERE title = 'VP Infrastructure' AND state = 'Illinois' LIMIT 1");
  const reg = await engage.register('chicago', { name: 'Guest One', email: vp.email, company: 'Northline', country: 'United States', consent: 'yes' });
  assert.match(reg.html, /You are registered/);
  const regRow = await db.get("SELECT id FROM activities WHERE contact_id = (SELECT id FROM contacts WHERE email = ?) AND kind = 'registration'", [vp.email]);
  assert.ok(regRow);

  const arch = fs.readFileSync(path.join(__dirname, '../../platform/ARCHITECTURE.md'), 'utf8');
  for (const phrase of ['Snowflake', 'Eloqua', 'SSO via OIDC', 'RBAC', 'Encryption at rest', 'Regional data residency', 'Audit', '@mops send the Chicago invite to CIOs in Illinois who opened last month', '@mops upload this attendee file', '@mops weekly report for Americas']) assert.match(arch, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(adapt('CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT)', 'postgres'), /BIGSERIAL PRIMARY KEY/);
  assert.equal(toPg('SELECT * FROM t WHERE a=? AND b=?'), 'SELECT * FROM t WHERE a=$1 AND b=$2');
  assert.equal(planDriver({}).dialect, 'sqlite');
  assert.ok(planDriver({ PLATFORM_DB: 'postgres' }).error);
});

test('crm, plan, and insights finish the marketer asks', { timeout: 120000 }, async () => {
  const { ensure } = require('../../platform');
  const { current } = require('../../platform/db');
  const brain = require('../../platform/brain');
  const crm = require('../../platform/crm');
  const spend = require('../../platform/spend');
  const insights = require('../../platform/insights');
  const data = require('../../platform/data');
  await ensure();
  const db = current();

  const il = await data.emailable({ state: 'Illinois', country: 'United States' });
  const ilNames = il.sample.map(p => p.first_name + ' ' + p.last_name);
  assert.equal(new Set(ilNames).size, ilNames.length);
  const everyIl = await db.all("SELECT first_name || ' ' || last_name AS name FROM contacts WHERE state = 'Illinois'");
  const everyName = everyIl.map(r => r.name);
  assert.equal(new Set(everyName).size, everyName.length);
  assert.ok(everyName.filter(n => n === 'Sofia Almeida').length <= 1);
  const states = await db.all("SELECT state, first_name || ' ' || last_name AS name FROM contacts WHERE state IN ('Illinois','Texas')");
  const byState = { Illinois: new Set(), Texas: new Set() };
  for (const row of states) byState[row.state].add(row.name);
  for (const name of byState.Texas) assert.equal(byState.Illinois.has(name), false, name);
  const dupId = await db.get('SELECT id FROM contacts GROUP BY id HAVING COUNT(DISTINCT state) > 1');
  assert.equal(dupId, undefined);

  const upload = await brain.ask({ text: '@mops upload this attendee file to SFDC for the Chicago roundtable', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(upload.ok, true);
  assert.equal(upload.askId, 'upload-chicago');
  assert.equal(upload.result.accepted, 3);
  assert.equal(upload.result.quarantined, 3);
  assert.equal(upload.result.duplicates, 1);
  assert.equal(upload.result.retried, 1);
  assert.ok(upload.ms < 300, 'upload ' + upload.ms + 'ms');
  assert.match(upload.reply, /no consent/);
  assert.match(upload.reply, /missing email/);
  assert.match(upload.reply, /duplicate/);
  assert.match(upload.reply, /Jake Moss \(AE\): 8 Chicago accounts, 1 campaign member/);
  assert.match(upload.reply, /Rosa Diaz \(SDR\): 0 Chicago accounts, 2 campaign members/);
  assert.match(upload.reply, /Salesforce was busy, retried automatically/);
  assert.equal(upload.result.held.some(r => r.email === 'nina.vale@badgenorth.example' && r.reason === 'duplicate'), true);
  for (const row of upload.result.held) {
    if (!String(row.email || '').includes('@')) continue;
    assert.equal(await db.get('SELECT id FROM crm_objects WHERE lower(email) = ?', [row.email]), undefined, row.email);
  }
  const again = await brain.ask({ text: '@mops upload this attendee file to SFDC for the Chicago roundtable', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(again.result.idempotent, true);
  assert.match(again.reply, /Already uploaded/);
  const leads = await db.all("SELECT owner_name, title FROM crm_objects WHERE type = 'Lead' ORDER BY email");
  assert.equal(leads.length, 3);
  assert.equal(leads.filter(r => r.owner_name === 'Jake Moss').length, 1);
  assert.equal(leads.filter(r => r.owner_name === 'Rosa Diaz').length, 2);
  const campaigns = await db.all("SELECT id FROM crm_objects WHERE type = 'Campaign' AND external_id = 'CAMP-CHI'");
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].id, '7010000000CHIAA');
  const queue = await crm.listQueue();
  const campaignJob = queue.find(j => j.kind === 'Campaign');
  assert.equal(campaignJob.status, 'done');
  assert.equal(campaignJob.attempts, 2);
  assert.match(campaignJob.last_error, /Salesforce was busy, retried automatically/);
  const owners = await brain.ask({ text: '@mops who owns the Chicago accounts', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(owners.reply, /Jake Moss \(AE\): 8 Chicago accounts, 1 campaign member/);
  assert.match(owners.reply, /Rosa Diaz \(SDR\): 0 Chicago accounts, 2 campaign members/);
  const uploadWhy = await data.log({ q: 'chicago-attendees', limit: 3 });
  assert.match(uploadWhy.rows.map(r => r.why).join('\n'), /3 campaign members/);
  assert.match(uploadWhy.rows.map(r => r.why).join('\n'), /Held 4/);
  assert.match(uploadWhy.rows.map(r => r.why).join('\n'), /1 campaign member/);
  const fails = await brain.ask({ text: '@mops show the sync failures', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(fails.reply, /No open failures/);
  assert.equal(fails.result.open.length, 0);

  const budget = await brain.ask({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(budget.ok, true);
  assert.equal(budget.result.amountUsd, 180000);
  assert.equal(budget.result.status, 'pending');
  assert.equal(budget.result.label, 'Waiting on Chris');
  assert.equal(budget.result.approver, 'Chris M.');
  assert.equal(budget.result.ban, null);
  assert.equal(budget.result.campaignCode, null);
  assert.equal(budget.result.open.length, 3);
  assert.match(budget.reply, /Waiting on Chris/);
  assert.match(budget.reply, /\$180,000/);
  assert.doesNotMatch(budget.reply, /No second request/);
  assert.doesNotMatch(budget.reply, /BAN-/);
  assert.match(budget.reply, /Harbor North/);
  assert.match(budget.reply, /Waiting on you: PM, PO, venue contact/);
  assert.doesNotMatch(budget.reply, /\$42,000/);
  assert.ok(budget.ms < 300, 'budget ' + budget.ms + 'ms');
  const denied = await brain.ask({ text: '@mops approve Chicago', channel: 'App', actor: 'Maria Alvarez', role: 'marketer' });
  assert.match(denied.reply, /Only Chris M/);
  assert.match(denied.reply, /Waiting on Chris/);
  const approved = await brain.ask({ text: '@mops approve Chicago', channel: 'App', actor: 'Chris M.', role: 'approver' });
  assert.equal(approved.result.status, 'approved');
  assert.equal(approved.result.ban, 'BAN-FY26Q3-4100-0001');
  assert.equal(approved.result.campaignCode, 'FY26Q3-USA-EVT-0101');
  assert.match(approved.reply, /BAN-FY26Q3-4100-0001/);
  const budgetAgain = await brain.ask({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(budgetAgain.result.idempotent, true);
  assert.match(budgetAgain.reply, /already approved/);
  assert.match(budgetAgain.reply, /\$0 of \$180,000/);
  assert.doesNotMatch(budgetAgain.reply, /\$42,000/);
  assert.match(budgetAgain.reply, /Waiting on you: PM, PO, venue contact/);
  const auto = await spend.file({ campaignId: 'CP-03', amount: 150000, currency: 'USD', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test', idempotencyKey: 'test:150000' });
  assert.equal(auto.status, 'approved');
  assert.equal(auto.approver, null);
  const pending = await spend.file({ campaignId: 'CP-04', amount: 150001, currency: 'USD', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test', idempotencyKey: 'test:150001' });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.label, 'Waiting on Chris');
  assert.equal(pending.approver, 'Chris M.');
  assert.equal(pending.ban, null);
  const minted = await brain.ask({ text: '@mops mint the campaign code', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(minted.reply, /FY26Q3-USA-EVT-0101/);
  assert.match(minted.reply, /BAN-FY26Q3-4100-0001/);
  const sow = await brain.ask({ text: '@mops draft the SOW', channel: 'Email', actor: 'Maria Alvarez' });
  assert.match(sow.reply, /Harbor North Events/);
  assert.match(sow.reply, /Waiting on you: PM, PO, venue contact/);
  assert.equal(sow.result.open.length, 3);
  const left = await brain.ask({ text: '@mops what is left in the Americas budget', channel: 'App', actor: 'Maria Alvarez' });
  const book = await spend.remaining('Americas');
  assert.match(left.reply, new RegExp(book.left.toLocaleString('en-US').replace(/,/g, ',')));
  assert.ok(left.ms < 300, 'left ' + left.ms + 'ms');

  const dash = await insights.dashboard('Americas');
  const t0 = process.hrtime.bigint();
  await insights.dashboard('Americas');
  const dashMs = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(dashMs < 300, 'dashboard ' + dashMs.toFixed(1) + 'ms');
  assert.ok(dash.regions.find(r => r.region === 'Americas'));
  assert.ok(dash.programs.length);
  const cpl = await brain.ask({ text: '@mops what is the cost per lead for Chicago', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(cpl.reply, /\$0/);
  assert.match(cpl.reply, /actual/);
  assert.doesNotMatch(cpl.reply, /\$42,000/);
  const pipe = await brain.ask({ text: '@mops how much pipeline did Chicago source', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.match(pipe.reply, /\$640,000/);
  assert.match(pipe.reply, /\$800,000/);
  const monthly = await brain.ask({ text: '@mops monthly report for the portfolio', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(monthly.askId, 'monthly-portfolio');
  assert.match(monthly.reply, /Monthly report for the portfolio/);
  assert.ok(monthly.ms < 300, 'monthly ' + monthly.ms + 'ms');
  const file = await insights.build('weekly', 'Americas');
  assert.equal(file.pptx.slice(0, 2).toString(), 'PK');
  assert.equal(file.pdf.slice(0, 5).toString(), '%PDF-');
  assert.ok(file.pptx.length > 1000 && file.pdf.length > 500);
  assert.notEqual(file.facts.goal, file.facts.pipeline);
  assert.match(file.pdf.toString('utf8'), /Target pipeline/);
  assert.ok(file.facts.goal > file.facts.pipeline);
  assert.equal(new Set(file.facts.names).size, file.facts.names.length);
  assert.ok(file.facts.names.every(n => !n.includes(' abm')));
  const pdfText = file.pdf.toString('latin1');
  assert.match(pdfText, /On track/);
  assert.doesNotMatch(pdfText, /Fixed/);

  const { reset } = require('../../platform/seed');
  await reset(db);
  const freshSend = await brain.ask({ text: '@mops send the Chicago invite to CIOs in Illinois who opened last month', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(freshSend.reply, /^Sent the Chicago invite/);
  assert.doesNotMatch(freshSend.reply, /Already/);
  const freshBudget = await brain.ask({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(freshBudget.reply, /Waiting on Chris/);
  assert.doesNotMatch(freshBudget.reply, /No second/);
  const names = await db.all("SELECT first_name || ' ' || last_name AS name FROM contacts WHERE state = 'Illinois'");
  assert.equal(new Set(names.map(r => r.name)).size, names.length);
});

test('platform consoles in the browser', { timeout: 240000 }, async () => {
  const { chromium } = require('playwright');
  const { start } = require('../stack');
  const shot = '/opt/cursor/artifacts/screenshots';
  fs.mkdirSync(shot, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-platform-ui-'));
  const env = {
    MOPS_PORT: '9877', ENGINE_PORT: '9881', CRM_PORT: '9882', MAIL_PORT: '9883', SMTP_PORT: '3588', WH_PORT: '9884',
    MOPS_PUBLIC: 'http://127.0.0.1:9877', MOPS_DATA_DIR: dataDir, MOPS_RUNS_DIR: path.join(dataDir, 'runs'),
    MOPS_AUTOPILOT: '0', PLATFORM_DB: 'sqlite', ELT_MS: '0'
  };
  const stack = await start(env, { quiet: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const failures = [];
  page.on('response', (res) => { if (res.status() >= 500) failures.push(res.status() + ' ' + res.url()); });
  page.on('pageerror', (err) => failures.push(String(err)));
  const H = 'http://127.0.0.1:9877';
  try {
    await page.goto(H + '/');
    await page.locator('button[value="maria"]').click();
    await page.goto(H + '/platform');
    await page.locator('h2', { hasText: 'What @mops did today' }).waitFor();
    await page.locator('#saved .stat').getByText('195 min', { exact: true }).waitFor();
    assert.ok(await page.locator('#saved').getByText('<1 sec').count() >= 6);
    await page.locator('#today').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#today').getByText('Moved the Chicago security roundtable to 19 Mar').count(), 1);
    assert.equal(await page.locator('#today').getByText('does not own').count(), 0);
    assert.equal(await page.locator('body').getByText('not measured yet').count(), 0);
    await page.locator('[data-module="data"][data-status="built"]').waitFor();
    await page.locator('[data-module="engage"][data-status="built"]').waitFor();
    await page.locator('[data-module="crm"][data-status="built"]').waitFor();
    await page.locator('[data-module="plan"][data-status="built"]').waitFor();
    await page.locator('[data-module="insights"][data-status="built"]').waitFor();
    await page.locator('[data-module="brain"][data-status="built"]').waitFor();
    assert.equal(await page.locator('[data-status="built"]').count(), 6);
    assert.equal(await page.locator('[data-status="next"]').count(), 0);
    await page.locator('#who').getByText('Maria Alvarez').waitFor();
    await page.screenshot({ path: path.join(shot, 'platform-home.png'), fullPage: true });

    await page.goto(H + '/platform/data');
    await page.locator('#rows').getByText('@').first().waitFor();
    await page.locator('#log').getByText("Jordan Hale's email, 14 Oct").first().waitFor();
    assert.equal(await page.locator('#log').getByText('EM-JH-1014').count(), 0);
    const beforeRuns = await page.locator('#table option[value="ask_runs"]').innerText();
    await page.locator('[data-proof]').click();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 6 screens \/ 11 fields \/ 20 minutes · @mops: 1 ask \/ <1 sec/).waitFor();
    const dataBanner = await page.locator('#elon').innerText();
    assert.equal(dataBanner.match(/Old tool vs @mops/g).length, 1);
    assert.doesNotMatch(dataBanner, /0\.00\d seconds/);
    await page.locator('#answer .from').getByText('App').waitFor();
    await page.locator('#answer .reply').getByText(/36 opted-in/).waitFor();
    await page.waitForFunction((start) => {
      const opt = document.querySelector('#table option[value="ask_runs"]');
      return opt && opt.textContent !== start;
    }, beforeRuns);
    const tables = await (await page.request.get(H + '/api/platform/data/tables')).json();
    const contacts = tables.tables.find(t => t.name === 'contacts');
    assert.equal(await page.locator('#table option[value="contacts"]').innerText(), 'contacts (' + contacts.rows.toLocaleString('en-US') + ')');
    assert.equal(await page.locator('#answer details').getAttribute('open'), null);
    await page.screenshot({ path: path.join(shot, 'platform-data.png'), fullPage: true });

    await page.goto(H + '/platform/ask');
    assert.equal(await page.locator('#ask').inputValue(), '');
    await page.locator('#channel').selectOption('Webex');
    await page.goto(H + '/platform/data');
    await page.goto(H + '/platform/ask');
    assert.equal(await page.locator('#channel').inputValue(), 'Webex');
    await page.locator('#ask').fill('@mops send the Chicago invite to CIOs in Illinois who opened last month');
    await page.locator('#run').click();
    await page.locator('#answer .from').getByText('Webex').waitFor();
    await page.locator('#answer .reply').getByText(/Sent the Chicago invite to 30/).waitFor();
    assert.equal(await page.locator('#answer details').getAttribute('open'), null);
    await page.screenshot({ path: path.join(shot, 'platform-ask.png'), fullPage: true });
    const pixel = await page.request.get(H + '/platform/p/chicago');
    assert.equal(pixel.status(), 200);

    const engageRes = await page.goto(H + '/platform/engage');
    const engageHtml = await engageRes.text();
    assert.match(engageHtml, /data-mql-count>\d+</);
    assert.doesNotMatch(engageHtml, /data-mql-count>…/);
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 9 screens \/ 16 fields \/ 35 minutes · @mops: 1 ask \/ <1 sec/).waitFor();
    await page.locator('text=an MQL is a score of 70 or higher').waitFor();
    await page.locator('#templates').getByText('Last call for the Chicago security roundtable').waitFor();
    assert.equal(await page.locator('#templates').getByText('{{campaign}}').count(), 0);
    await page.locator('#sends').getByText('Chicago security roundtable').waitFor();
    assert.equal(await page.locator('#sends').getByText('CAMP-CHI').count(), 0);
    assert.equal(await page.locator('#sends').getByText('CP-02').count(), 0);
    await page.locator('#segments').getByText('CIOs in Illinois who opened last month').waitFor();
    await page.waitForFunction(() => Number.isFinite(Number(document.querySelector('[data-mql-count]').textContent)));
    const before = Number(await page.locator('[data-mql-count]').innerText());
    const sim = page.waitForResponse(r => r.url().includes('/simulate') && r.request().method() === 'POST');
    await page.locator('[data-simulate]').click();
    const simRes = await sim;
    assert.equal(simRes.status(), 200, await page.locator('#err').innerText());
    await page.waitForFunction((start) => Number(document.querySelector('[data-mql-count]').textContent) > start, before);
    await page.locator('#sends').getByText('47%').first().waitFor();
    await page.locator('#sends').getByText('13%').first().waitFor();
    const smallSends = await page.evaluate(() => [...document.querySelectorAll('#sends tr[data-recipients]')].map(n => Number(n.getAttribute('data-recipients'))).filter(n => n < 2));
    assert.deepEqual(smallSends, []);
    const repeated = await page.evaluate(() => {
      const names = [...document.querySelectorAll('#board-il tr[data-contact] td:first-child')].map(n => n.textContent.trim());
      return names.filter((n, i) => names.indexOf(n) !== i);
    });
    assert.deepEqual(repeated, []);
    await page.locator('#board-il').getByText('mql').first().waitFor();
    const shared = await page.evaluate(() => {
      const ids = (sel) => [...document.querySelectorAll(sel)].map(n => n.getAttribute('data-contact'));
      const il = new Set(ids('#board-il tr[data-contact]'));
      return ids('#board-tx tr[data-contact]').filter(id => il.has(id));
    });
    assert.deepEqual(shared, []);
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-engage.png'), fullPage: true });

    await page.goto(H + '/platform/crm');
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').getByText(/3 campaign members/).waitFor();
    await page.locator('#answer .reply').getByText(/Salesforce was busy, retried automatically/).waitFor();
    await page.locator('#answer .reply').getByText(/no consent/).waitFor();
    await page.locator('#tally').getByText('3 campaign members loaded. Held 4.').waitFor();
    await page.locator('#held').getByText('missing email').waitFor();
    await page.locator('#held').getByText('Nina Vale').waitFor();
    await page.locator('#held').getByText('duplicate').waitFor();
    assert.equal(await page.locator('#objects').getByText('Nina Vale').count(), 0);
    await page.locator('#owners').getByText('8 Chicago accounts, 1 campaign member').waitFor();
    await page.locator('#owners').getByText('0 Chicago accounts, 2 campaign members').waitFor();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 8 screens \/ 14 fields \/ 25 minutes/).waitFor();
    await page.locator('#objects').getByText('Jake Moss').first().waitFor();
    await page.locator('#queue').getByText('Salesforce was busy, retried automatically').first().waitFor();
    const queueText = await page.locator('#queue').innerText();
    assert.doesNotMatch(queueText, /T\d{2}:\d{2}:\d{2}/);
    assert.match(queueText, /Oct/);
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-crm.png'), fullPage: true });

    await page.goto(H + '/platform/spend');
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').getByText('Waiting on Chris').waitFor();
    await page.locator('#answer .reply').getByText('Waiting on you: PM, PO, venue contact').waitFor();
    assert.equal(await page.locator('#answer .reply').getByText('$42,000').count(), 0);
    assert.equal(await page.locator('#answer .reply').getByText('BAN-').count(), 0);
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 7 screens \/ 18 fields \/ 40 minutes/).waitFor();
    await page.locator('#sow').getByText('Waiting on you: PM, PO, venue contact').waitFor();
    assert.equal(await page.locator('#actuals').getByText('$42,000').count(), 0);
    await page.locator('#packets').getByText('Waiting on Chris').waitFor();
    await page.locator('#our_pm').fill('Maria Alvarez');
    await page.locator('#po_number').fill('PO-2044');
    await page.locator('#venue_contact').fill('Jordan Hale');
    await page.locator('#save').click();
    await page.locator('#sow').getByText('Saved, SOW ready for review').waitFor();
    assert.equal(await page.locator('#our_pm').inputValue(), 'Maria Alvarez');
    assert.equal(await page.locator('#po_number').inputValue(), 'PO-2044');
    assert.equal(await page.locator('#venue_contact').inputValue(), 'Jordan Hale');
    await page.screenshot({ path: path.join(shot, 'platform-spend.png'), fullPage: true });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#switch').selectOption('chris')
    ]);
    await page.locator('#who').getByText('Chris M.').waitFor();
    await page.locator('#sow').getByText('Saved, SOW ready for review').waitFor();
    assert.equal(await page.locator('#our_pm').inputValue(), 'Maria Alvarez');
    assert.equal(await page.locator('#po_number').inputValue(), 'PO-2044');
    assert.equal(await page.locator('#venue_contact').inputValue(), 'Jordan Hale');
    await page.locator('#approve').click();
    await page.locator('#packets').getByText('BAN-FY26Q3-4100-0001').waitFor();
    await page.locator('#answer .reply').getByText(/FY26Q3-USA-EVT-0101/).waitFor();
    await page.locator('#actuals').getByText('Chicago security roundtable').waitFor();
    const chicagoActual = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#actuals tr')].find(tr => /Chicago security roundtable/.test(tr.textContent));
      return row ? row.textContent : '';
    });
    assert.match(chicagoActual, /\$0/);
    assert.doesNotMatch(chicagoActual, /\$42,000/);
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-spend.png'), fullPage: true });

    await page.goto(H + '/platform/insights');
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').getByText(/Weekly report for Americas/).waitFor();
    await page.locator('#answer').getByRole('link', { name: 'Download PowerPoint' }).waitFor();
    await page.locator('#answer').getByRole('link', { name: 'Download PDF' }).waitFor();
    assert.equal(await page.locator('#answer .reply').getByText('/api/platform').count(), 0);
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 5 screens \/ 9 fields \/ 30 minutes/).waitFor();
    await page.locator('#regions').getByText('Americas').waitFor();
    await page.locator('#regions').getByText('Cost per lead').waitFor();
    await page.locator('#regions').getByText('MQLs').waitFor();
    await page.locator('#regions').getByText('Pipeline').waitFor();
    const pptx = await page.request.get(H + '/api/platform/insights/reports/weekly.pptx?region=Americas');
    const pdf = await page.request.get(H + '/api/platform/insights/reports/weekly.pdf?region=Americas');
    assert.equal(pptx.status(), 200);
    assert.equal(pdf.status(), 200);
    assert.equal((await pptx.body()).slice(0, 2).toString(), 'PK');
    assert.equal((await pdf.body()).slice(0, 5).toString(), '%PDF-');
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-insights.png'), fullPage: true });

    await page.goto(H + '/platform/brain');
    await page.locator('#policy').getByText('Waiting on Chris').waitFor();
    await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#why').getByText('does not own').count(), 0);
    assert.equal(await page.locator('#why').getByText('covers the Chicago accounts').count(), 0);
    assert.equal(await page.locator('#why').getByText('not measured yet').count(), 0);
    const perPerson = await page.evaluate(() => [...document.querySelectorAll('#why td')].map(n => n.textContent).filter(t => /Sent “.+” to .+ at /.test(t)));
    assert.deepEqual(perPerson, []);
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').waitFor();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 11 screens \/ 22 fields \/ 45 minutes/).waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-brain.png'), fullPage: true });

    await page.goto(H + '/platform/architecture');
    const archText = await page.locator('.arch').innerText();
    assert.equal(archText.includes('`'), false);
    assert.match(archText, /SSO via OIDC/);
    assert.match(archText, /Old tool vs @mops/);
    await page.screenshot({ path: path.join(shot, 'platform-architecture.png'), fullPage: true });
    page.once('dialog', d => d.accept());
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#reset').click()
    ]);
    await page.goto(H + '/platform');
    await page.locator('#today').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#today').getByText('Moved the Chicago security roundtable to 19 Mar').count(), 1);
    assert.equal(await page.locator('#today').getByText('does not own').count(), 0);
    assert.equal(await page.locator('#today').getByText('Sent the Chicago invite').count(), 0);
    await page.goto(H + '/platform/brain');
    await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#why').getByText('does not own').count(), 0);
    assert.equal(await page.locator('#why').getByText('Sent the Chicago invite').count(), 0);
    await page.goto(H + '/platform/ask');
    await page.locator('#ask').fill('@mops send the Chicago invite to CIOs in Illinois who opened last month');
    await page.locator('#run').click();
    await page.locator('#answer .reply').getByText(/^Sent the Chicago invite to 30/).waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    stack.stop();
  }
});

test('marketer home runs the demo without the consoles', { timeout: 300000 }, async () => {
  const { chromium } = require('playwright');
  const { start } = require('../stack');
  const shot = '/opt/cursor/artifacts/screenshots';
  fs.mkdirSync(shot, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-home-ui-'));
  const env = {
    MOPS_PORT: '9890', ENGINE_PORT: '9891', CRM_PORT: '9892', MAIL_PORT: '9893', SMTP_PORT: '3590', WH_PORT: '9894',
    MOPS_PUBLIC: 'http://127.0.0.1:9890', MOPS_DATA_DIR: dataDir, MOPS_RUNS_DIR: path.join(dataDir, 'runs'),
    MOPS_AUTOPILOT: '0', PLATFORM_DB: 'sqlite', ELT_MS: '0'
  };
  const stack = await start(env, { quiet: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const failures = [];
  page.on('response', (res) => { if (res.status() >= 500) failures.push(res.status() + ' ' + res.url()); });
  page.on('pageerror', (err) => failures.push(String(err)));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && /\/platform(\/|$)/.test(new URL(frame.url()).pathname)) failures.push('visited ' + frame.url());
  });
  const H = 'http://127.0.0.1:9890';
  async function noOverflow() {
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(extra <= 1, 'horizontal overflow ' + extra);
  }
  try {
    await page.goto(H + '/');
    await page.locator('button[value="maria"]').click();
    await page.locator('h1', { hasText: 'Hey Maria' }).waitFor();
    const helloPlace = await page.evaluate(() => {
      const hello = document.querySelector('#hello').getBoundingClientRect();
      const box = document.querySelector('#composer').getBoundingClientRect();
      return { helloBottom: hello.bottom, boxTop: box.top, align: getComputedStyle(document.querySelector('#hello-wrap')).textAlign };
    });
    assert.ok(helloPlace.helloBottom <= helloPlace.boxTop + 1, 'Hey Maria sits above the ask box');
    assert.equal(helloPlace.align, 'center');
    assert.equal(await page.locator('#ask').inputValue(), '');
    assert.equal(await page.locator('#ask').getAttribute('placeholder'), 'Tag @mops…');
    assert.match(await page.locator('#saved').innerText(), /Saved today: 0m vs old tools/);
    await page.locator('#campaigns .card').nth(2).waitFor();
    assert.equal(await page.locator('#chips button').count(), 4);
    assert.equal(await page.locator('[data-act="approve"]').count(), 0);
    assert.equal(await page.locator('#campaigns .card').count(), 3);
    assert.equal(await page.locator('.strip').count(), 0);
    await page.locator('#campaigns').getByText(/\d+ of 6 steps done/).first().waitFor();
    await page.locator('summary', { hasText: 'All campaigns' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(shot, 'home-maria.png'), fullPage: true });

    await page.locator('#channel-toggle').click();
    await page.locator('#channel-menu').getByRole('button', { name: 'Webex', exact: true }).click();
    assert.equal(await page.locator('#channel').inputValue(), 'Webex');
    assert.match(await page.locator('#channel-toggle').innerText(), /Asked from: Webex/);
    await page.reload();
    await page.locator('h1', { hasText: 'Hey Maria' }).waitFor();
    assert.equal(await page.locator('#channel').inputValue(), 'Webex');
    assert.match(await page.locator('#channel-toggle').innerText(), /Asked from: Webex/);

    await page.locator('#chips').getByRole('button', { name: 'Who can I email in Illinois' }).click();
    await page.locator('#answer .headline').getByText('36 people you can email').waitFor();
    await page.locator('#answer .subline').getByText('30 of them are CIOs who opened last month').waitFor();
    await page.locator('#bump').getByText('+20 min').waitFor();
    assert.match(await page.locator('#saved').innerText(), /Saved today: 20m vs old tools/);
    await page.locator('#answer summary', { hasText: 'More' }).click();
    await page.locator('#answer .reply').getByText('36 opted-in').waitFor();
    await page.locator('#answer .from').getByText('Webex').waitFor();
    await page.locator('#answer').getByRole('button', { name: 'Behind the scenes' }).click();
    await page.locator('#drawer .kicker').getByText('Data', { exact: true }).waitFor();
    await page.locator('#drawer').getByText('Checked consent in the data core').waitFor();
    await page.locator('#drawer summary', { hasText: 'Raw payload' }).click();
    await page.locator('#drawer').getByText('/api/platform/data/emailable').waitFor();
    await page.screenshot({ path: path.join(shot, 'home-drawer.png') });
    await page.locator('#drawer-close').click();
    await page.locator('#drawer').waitFor({ state: 'hidden' });

    await page.locator('#chips').getByRole('button', { name: 'Send the Chicago invite' }).click();
    await page.locator('#preview').getByText('Send to 30 CIOs?').waitFor();
    await page.locator('#preview').getByText('Preview email').waitFor();
    await page.locator('#cancel-send').click();
    await page.locator('#preview').waitFor({ state: 'hidden' });
    await page.locator('#chips').getByRole('button', { name: 'Send the Chicago invite' }).click();
    await page.locator('#confirm-send').click();
    await page.locator('#undo').waitFor();
    await page.locator('#answer .headline').getByText('Invite sent to 30 CIOs').waitFor();
    await page.locator('#bump').getByText('+35 min').waitFor();
    assert.match(await page.locator('#saved').innerText(), /Saved today: 55m vs old tools/);
    await page.locator('#answer summary', { hasText: 'More' }).click();
    await page.locator('#answer .reply').getByText(/^Sent the Chicago invite to 30/).waitFor();
    await page.locator('#campaigns').getByRole('link', { name: /Chicago security roundtable/ }).click();
    await page.locator('#flight').waitFor();
    await page.locator('h1', { hasText: 'Chicago security roundtable' }).waitFor();
    assert.equal(await page.locator('#hello-wrap').isHidden(), true);
    await page.locator('#camp-chips').getByRole('button', { name: 'Upload file' }).waitFor();
    await page.locator('#camp-chips').getByRole('button', { name: 'Weekly report' }).waitFor();
    await page.locator('#camp-chips').getByRole('button', { name: 'Why did this change' }).waitFor();
    await page.locator('#your-turn').getByText('Upload the attendee file').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow();
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.locator('#mqls').innerText(), '0');
    await page.locator('#numbers').getByText('Sales-ready leads').waitFor();
    await page.locator('#simulate').click();
    await page.locator('#numbers').getByText('14 of 30 opened').waitFor();
    await page.locator('#numbers').getByText('47%', { exact: true }).waitFor();
    await page.locator('#numbers').getByText('4 of 30 clicked').waitFor();
    await page.locator('#numbers').getByText('13%', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('#mqls').textContent.trim() === '4');

    assert.equal(await page.locator('#upload').innerText(), 'Use sample file');
    await page.locator('#file').setInputFiles(path.join(__dirname, '../../platform/samples/chicago-attendees.xlsx'));
    await page.locator('#answer .headline').getByText('3 people added').waitFor();
    await page.locator('#answer summary', { hasText: 'More' }).click();
    await page.locator('#answer .reply').getByText('3 campaign members').waitFor();
    const uploaded = await page.locator('#answer .reply').innerText();
    assert.match(uploaded, /Held 4/);
    assert.match(uploaded, /Nina Vale/);
    assert.match(uploaded, /Jake Moss, Account owner: 8 Chicago accounts, 1 campaign member/);
    assert.match(uploaded, /Rosa Diaz, Follow-up rep: 0 Chicago accounts, 2 campaign members/);
    assert.match(uploaded, /Salesforce was busy, retried automatically/);

    await page.locator('a.logo').click();
    await page.locator('h1', { hasText: 'Hey Maria' }).waitFor();
    await page.locator('#chips').getByRole('button', { name: 'File the Chicago budget' }).click();
    await page.locator('#answer .headline').getByText('Waiting on Chris').waitFor();
    await page.locator('#answer summary', { hasText: 'More' }).click();
    await page.locator('#answer .reply').getByText('Waiting on Chris').waitFor();
    await page.locator('#needs h2').getByText('Fill 3 SOW details').waitFor();
    assert.equal(await page.locator('#nudge').count(), 0);
    assert.equal(await page.locator('body').getByText('$42,000').count(), 0);
    assert.equal(await page.locator('#answer .reply').getByText('BAN-').count(), 0);
    await page.locator('#needs [data-act="fill"]').click();
    await page.locator('#our_pm').waitFor();
    await page.locator('#sow-note').getByText('Waiting on you: PM, PO, venue contact').waitFor();
    await page.locator('#our_pm').fill('Maria Alvarez');
    await page.locator('#po_number').fill('PO-2044');
    await page.locator('#venue_contact').fill('Jordan Hale');
    await page.locator('#save').click();
    await page.locator('#toast').getByText('Saved', { exact: true }).waitFor();
    await page.locator('#sow-note').getByText('Saved, SOW ready for review').waitFor();
    assert.equal(await page.locator('#our_pm').inputValue(), 'Maria Alvarez');
    assert.equal(await page.locator('#po_number').inputValue(), 'PO-2044');
    assert.equal(await page.locator('#venue_contact').inputValue(), 'Jordan Hale');
    const sowInk = await page.locator('#our_pm').evaluate((el) => {
      const style = getComputedStyle(el);
      return style.color + ' ' + style.opacity;
    });
    assert.match(sowInk, /rgb\(28,\s*27,\s*25\) 1/);
    await page.locator('#nudge').waitFor();
    await page.locator('#your-turn h2').getByText('Waiting on Chris · nudge').waitFor();
    await page.locator('#view').getByText('Maria Alvarez · PO-2044 · Jordan Hale').waitFor();
    await page.locator('[data-edit="sow"]').waitFor();

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#who').selectOption('chris')
    ]);
    await page.locator('#sow-note').getByText('Saved, SOW ready for review').waitFor();
    assert.equal(await page.locator('#who').inputValue(), 'chris');
    assert.equal(await page.locator('#our_pm').inputValue(), 'Maria Alvarez');
    assert.equal(await page.locator('#po_number').inputValue(), 'PO-2044');
    assert.equal(await page.locator('#venue_contact').inputValue(), 'Jordan Hale');
    await page.locator('#your-turn').getByText('Approve $180,000 for Chicago roundtable').waitFor();
    await page.locator('#your-turn').getByRole('button', { name: 'Reject' }).waitFor();
    await page.locator('[data-act="approve"]').click();
    await page.locator('#answer .headline').getByText('Budget approved · code ready').waitFor();
    const copy = await page.locator('#answer [data-copy]').getAttribute('data-copy');
    assert.match(copy, /BAN-FY26Q3-4100-0001/);
    assert.match(copy, /FY26Q3-USA-EVT-0101/);
    assert.equal(await page.locator('#answer').getByText('BAN-FY26Q3-4100-0001').count(), 0);
    assert.equal(await page.locator('#answer').getByText('FY26Q3-USA-EVT-0101').count(), 0);
    await page.locator('#numbers article', { hasText: 'Spent so far' }).getByText('$0', { exact: true }).waitFor();
    assert.equal(await page.locator('body').getByText('$42,000').count(), 0);
    await page.locator('#numbers article', { hasText: 'Pipeline' }).getByText('$640,000', { exact: true }).waitFor();
    await page.locator('#numbers article', { hasText: 'Budget left' }).getByText('$180,000', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(shot, 'home-chicago.png'), fullPage: true });

    await page.locator('#report').click();
    await page.locator('#downloads').getByRole('link', { name: 'Download PowerPoint' }).waitFor();
    await page.locator('#downloads').getByRole('link', { name: 'Download PDF' }).waitFor();
    const weeklyPpt = await page.request.get(H + '/api/platform/insights/reports/weekly.pptx?region=Americas');
    const weeklyPdf = await page.request.get(H + '/api/platform/insights/reports/weekly.pdf?region=Americas');
    assert.equal(weeklyPpt.status(), 200);
    assert.equal(weeklyPdf.status(), 200);
    assert.equal((await weeklyPpt.body()).slice(0, 2).toString(), 'PK');
    assert.equal((await weeklyPdf.body()).slice(0, 5).toString(), '%PDF-');
    assert.match((await weeklyPdf.body()).toString('latin1'), /On track/);
    await page.locator('#schedule').getByRole('button', { name: 'Monthly' }).click();
    assert.equal(await page.locator('#report').innerText(), 'Monthly report');
    await page.locator('#report').click();
    await page.locator('#downloads a[href*="monthly.pptx"]').waitFor();
    await page.locator('#downloads a[href*="monthly.pdf"]').waitFor();

    await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').count(), 1);
    await page.locator('#why').getByText("Jordan Hale's email, 14 Oct").waitFor();
    const venueWhy = await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').innerText();
    assert.equal(venueWhy, "Jordan Hale · Moved the Chicago security roundtable to 19 Mar · Jordan Hale's email, 14 Oct");
    assert.equal(await page.locator('#why').getByText('Minted and').count(), 0);
    assert.match(await page.locator('#why').innerText(), /Chris M\. · Approved \$180,000 · code ready/);
    assert.equal(await page.locator('#why').getByText('does not own').count(), 0);
    assert.equal(await page.locator('#why').getByText('EM-JH-1014').count(), 0);
    assert.equal(await page.locator('#view').getByText('EM-JH-1014').count(), 0);
    assert.equal(await page.locator('#view').getByText('CAMP-CHI').count(), 0);
    assert.doesNotMatch(await page.locator('#saved').innerText(), /Saved today: 0m/);

    page.once('dialog', d => d.accept());
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.locator('#reset').click()
    ]);
    await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').waitFor();
    assert.equal(await page.locator('#why').getByText('Moved the Chicago security roundtable to 19 Mar').count(), 1);
    assert.equal(await page.locator('#why').getByText('does not own').count(), 0);
    assert.equal(await page.locator('#why').getByText('Sent the Chicago invite').count(), 0);
    assert.match(await page.locator('#saved').innerText(), /Saved today: 0m vs old tools/);
    await page.locator('#ask').fill('@mops send the Chicago invite to CIOs in Illinois who opened last month');
    await page.locator('#send').click();
    await page.locator('#preview').getByText('Send to 30 CIOs?').waitFor();
    await page.locator('#confirm-send').click();
    await page.locator('#undo').waitFor();
    await page.locator('#answer summary', { hasText: 'More' }).click();
    await page.locator('#answer .reply').getByText(/^Sent the Chicago invite to 30/).waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    stack.stop();
  }
});
