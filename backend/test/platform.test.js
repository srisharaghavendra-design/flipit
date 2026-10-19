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
  const why = await data.log({ q: 'venue', limit: 5 });
  assert.match(why.rows.map(r => r.why).join(' '), /Jordan Hale's email on 14 Oct/);
  assert.ok(why.rows.some(r => r.channel === 'Email' && r.source_message === 'EM-JH-1014'));

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
  assert.match(later.reply, /weekly\.pptx/);
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
  const states = await db.all("SELECT state, first_name || ' ' || last_name AS name FROM contacts WHERE state IN ('Illinois','Texas')");
  const byState = { Illinois: new Set(), Texas: new Set() };
  for (const row of states) byState[row.state].add(row.name);
  for (const name of byState.Texas) assert.equal(byState.Illinois.has(name), false, name);
  const dupId = await db.get('SELECT id FROM contacts GROUP BY id HAVING COUNT(DISTINCT state) > 1');
  assert.equal(dupId, undefined);

  const upload = await brain.ask({ text: '@mops upload this attendee file to SFDC for the Chicago roundtable', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(upload.ok, true);
  assert.equal(upload.askId, 'upload-chicago');
  assert.equal(upload.result.accepted, 4);
  assert.equal(upload.result.quarantined, 3);
  assert.equal(upload.result.duplicates, 1);
  assert.equal(upload.result.retried, 1);
  assert.ok(upload.ms < 300, 'upload ' + upload.ms + 'ms');
  const again = await brain.ask({ text: '@mops upload this attendee file to SFDC for the Chicago roundtable', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(again.result.idempotent, true);
  assert.match(again.reply, /No second copy/);
  const leads = await db.all("SELECT owner_name, title FROM crm_objects WHERE type = 'Lead' ORDER BY email");
  assert.equal(leads.length, 4);
  assert.equal(leads.filter(r => r.owner_name === 'Jake Moss').length, 2);
  assert.equal(leads.filter(r => r.owner_name === 'Rosa Diaz').length, 2);
  const campaigns = await db.all("SELECT id FROM crm_objects WHERE type = 'Campaign' AND external_id = 'CAMP-CHI'");
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].id, '7010000000CHIAA');
  const queue = await crm.listQueue();
  const campaignJob = queue.find(j => j.kind === 'Campaign');
  assert.equal(campaignJob.status, 'done');
  assert.equal(campaignJob.attempts, 2);
  assert.match(campaignJob.last_error, /503/);
  const owners = await brain.ask({ text: '@mops who owns the Chicago accounts', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(owners.reply, /Jake Moss/);
  assert.match(owners.reply, /8 Chicago accounts/);
  const fails = await brain.ask({ text: '@mops show the sync failures', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(fails.reply, /No open failures/);
  assert.equal(fails.result.open.length, 0);

  const budget = await brain.ask({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(budget.ok, true);
  assert.equal(budget.result.amountUsd, 180000);
  assert.equal(budget.result.status, 'approved');
  assert.equal(budget.result.approver, 'Chris M.');
  assert.equal(budget.result.ban, 'BAN-FY26Q3-4100-0001');
  assert.equal(budget.result.campaignCode, 'FY26Q3-USA-EVT-0101');
  assert.equal(budget.result.open.length, 3);
  assert.match(budget.reply, /River North Club, Salon B|Harbor North/);
  assert.match(budget.reply, /\$42,000 of \$180,000/);
  assert.ok(budget.ms < 300, 'budget ' + budget.ms + 'ms');
  const budgetAgain = await brain.ask({ text: '@mops new budget: Chicago security roundtable, $180K', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.equal(budgetAgain.result.idempotent, true);
  assert.match(budgetAgain.reply, /No second request/);
  const auto = await spend.file({ campaignId: 'CP-03', amount: 150000, currency: 'USD', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test', idempotencyKey: 'test:150000' });
  assert.equal(auto.status, 'approved');
  assert.equal(auto.approver, null);
  const pending = await spend.file({ campaignId: 'CP-04', amount: 150001, currency: 'USD', actor: 'Maria Alvarez', channel: 'App', sourceMessage: 'test', idempotencyKey: 'test:150001' });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.approver, 'Chris M.');
  const minted = await brain.ask({ text: '@mops mint the campaign code', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(minted.reply, /FY26Q3-USA-EVT-0101/);
  assert.match(minted.reply, /BAN-FY26Q3-4100-0001/);
  const sow = await brain.ask({ text: '@mops draft the SOW', channel: 'Email', actor: 'Maria Alvarez' });
  assert.match(sow.reply, /Harbor North Events/);
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
  assert.match(cpl.reply, /\$42,000/);
  const pipe = await brain.ask({ text: '@mops how much pipeline did Chicago source', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.match(pipe.reply, /\$640,000/);
  const monthly = await brain.ask({ text: '@mops monthly report for the portfolio', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(monthly.askId, 'monthly-portfolio');
  assert.match(monthly.reply, /Monthly report for the portfolio/);
  assert.ok(monthly.ms < 300, 'monthly ' + monthly.ms + 'ms');
  const file = await insights.build('weekly', 'Americas');
  assert.equal(file.pptx.slice(0, 2).toString(), 'PK');
  assert.equal(file.pdf.slice(0, 5).toString(), '%PDF-');
  assert.ok(file.pptx.length > 1000 && file.pdf.length > 500);
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
    await page.locator('[data-module="data"][data-status="built"]').waitFor();
    await page.locator('[data-module="engage"][data-status="built"]').waitFor();
    await page.locator('[data-module="crm"][data-status="built"]').waitFor();
    await page.locator('[data-module="plan"][data-status="built"]').waitFor();
    await page.locator('[data-module="insights"][data-status="built"]').waitFor();
    await page.locator('[data-module="brain"][data-status="next"]').waitFor();
    assert.equal(await page.locator('[data-status="built"]').count(), 5);
    assert.equal(await page.locator('[data-status="next"]').count(), 1);
    await page.screenshot({ path: path.join(shot, 'platform-home.png'), fullPage: true });

    await page.goto(H + '/platform/data');
    await page.locator('#rows').getByText('@').first().waitFor();
    await page.locator('#log').getByText(/venue|Jordan Hale|River North/i).first().waitFor();
    await page.locator('[data-proof]').click();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 6 screens \/ 11 fields \/ 20 minutes · @mops: 1 ask \/ \d/).waitFor();
    await page.locator('#answer .from').getByText('App').waitFor();
    await page.locator('#answer .reply').getByText(/36 opted-in/).waitFor();
    assert.equal(await page.locator('#answer details').getAttribute('open'), null);
    await page.screenshot({ path: path.join(shot, 'platform-data.png'), fullPage: true });

    await page.goto(H + '/platform/ask');
    assert.equal(await page.locator('#ask').inputValue(), '');
    await page.locator('#channel').selectOption('Webex');
    await page.locator('#ask').fill('@mops send the Chicago invite to CIOs in Illinois who opened last month');
    await page.locator('#run').click();
    await page.locator('#answer .from').getByText('Webex').waitFor();
    await page.locator('#answer .reply').getByText(/Sent the Chicago invite to 30/).waitFor();
    assert.equal(await page.locator('#answer details').getAttribute('open'), null);
    await page.screenshot({ path: path.join(shot, 'platform-ask.png'), fullPage: true });
    const pixel = await page.request.get(H + '/platform/p/chicago');
    assert.equal(pixel.status(), 200);

    await page.goto(H + '/platform/engage');
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 9 screens \/ 16 fields \/ 35 minutes · @mops: 1 ask \/ \d/).waitFor();
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
    await page.locator('#answer .reply').getByText(/4 campaign members/).waitFor();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 8 screens \/ 14 fields \/ 25 minutes/).waitFor();
    await page.locator('#objects').getByText('Jake Moss').first().waitFor();
    await page.locator('#queue').getByText('503').first().waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-crm.png'), fullPage: true });

    await page.goto(H + '/platform/spend');
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').getByText(/Chris M\./).waitFor();
    await page.locator('#answer .reply').getByText(/BAN-FY26Q3-4100-0001/).waitFor();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 7 screens \/ 18 fields \/ 40 minutes/).waitFor();
    await page.locator('#actuals').getByText('42000').first().waitFor();
    await page.locator('#our_pm').fill('Maria Alvarez');
    await page.locator('#po_number').fill('PO-2044');
    await page.locator('#venue_contact').fill('Jordan Hale');
    await page.locator('#save').click();
    await page.locator('#sow').getByText('ready').waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-spend.png'), fullPage: true });

    await page.goto(H + '/platform/insights');
    await page.locator('[data-proof]').click();
    await page.locator('#answer .reply').getByText(/Weekly report for Americas/).waitFor();
    await page.locator('#elon').getByText(/Old tool vs @mops: Old tool: 5 screens \/ 9 fields \/ 30 minutes/).waitFor();
    await page.locator('#regions').getByText('Americas').waitFor();
    const pptx = await page.request.get(H + '/api/platform/insights/reports/weekly.pptx?region=Americas');
    const pdf = await page.request.get(H + '/api/platform/insights/reports/weekly.pdf?region=Americas');
    assert.equal(pptx.status(), 200);
    assert.equal(pdf.status(), 200);
    assert.equal((await pptx.body()).slice(0, 2).toString(), 'PK');
    assert.equal((await pdf.body()).slice(0, 5).toString(), '%PDF-');
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-insights.png'), fullPage: true });

    await page.goto(H + '/platform/architecture');
    const archText = await page.locator('.arch').innerText();
    assert.equal(archText.includes('`'), false);
    assert.match(archText, /SSO via OIDC/);
    assert.match(archText, /Old tool vs @mops/);
    await page.screenshot({ path: path.join(shot, 'platform-architecture.png'), fullPage: true });
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    stack.stop();
  }
});
