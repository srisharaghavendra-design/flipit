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
  const beforeScore = before.top[0].score;
  await engage.simulate(send.result.id, { opens: true, clicks: false });
  const mid = await engage.scores({ segmentId: segId });
  assert.equal(mid.mqls, 0);
  assert.ok(mid.top[0].score > beforeScore);
  const token = (await db.get('SELECT token FROM send_recipients WHERE send_id = ? LIMIT 1', [send.result.id])).token;
  const dup = await engage.mark(token, 'open', 'Recorded an open from the tracking pixel.');
  assert.equal(dup.duplicate, true);
  await engage.simulate(send.result.id, { opens: false, clicks: true });
  const after = await engage.scores({ segmentId: segId });
  assert.equal(after.mqls, 30);
  assert.ok(after.top.some(p => p.stage === 'mql' && p.state === 'Illinois'));
  const rates = await engage.getSend(send.result.id);
  assert.equal(rates.opens, 30);
  assert.equal(rates.clicks, 30);

  const mql = await brain.ask({ text: '@mops who is an MQL on the Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(mql.reply, /30 of 30/);
  const nurture = await brain.ask({ text: '@mops enroll clickers who have not registered into the Chicago nurture', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(nurture.result.enrolled, 30);
  assert.equal(nurture.result.sent, 30);
  assert.match(nurture.reply, /48 hours/);
  const second = await engage.tickJourney('J-CHI', { actor: 'Maria Alvarez' });
  assert.equal(second.sent, 0);
  const rate = await brain.ask({ text: '@mops what is the open rate on the Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(rate.reply, /Open rate 100%/);
  const draft = await brain.ask({ text: '@mops draft a Chicago invite', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(draft.reply, /Draft only/);
  assert.doesNotMatch(draft.reply, /\{\{/);
  const venue = await brain.ask({ text: '@mops why did the Chicago venue change', channel: 'Email', actor: 'Maria Alvarez' });
  assert.match(venue.reply, /Jordan Hale's email on 14 Oct/);
  const held = await brain.ask({ text: '@mops hold the German contacts who have no consent', channel: 'Webex', actor: 'Maria Alvarez' });
  assert.match(held.reply, /Held \d+ German/);
  assert.ok(held.result.count >= 15);
  const record = await brain.ask({ text: '@mops show me the Chicago campaign', channel: 'App', actor: 'Maria Alvarez' });
  assert.match(record.reply, /Rosa Diaz/);
  assert.match(record.reply, /FY26Q3-USA-EVT-0101/);
  const later = await brain.ask({ text: '@mops weekly report for Americas', channel: 'Email', actor: 'Maria Alvarez' });
  assert.equal(later.matched, false);
  assert.match(later.reply, /next/i);

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

test('platform consoles in the browser', { timeout: 180000 }, async () => {
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
    assert.equal(await page.locator('[data-status="built"]').count(), 2);
    assert.equal(await page.locator('[data-status="next"]').count(), 4);
    await page.screenshot({ path: path.join(shot, 'platform-home.png'), fullPage: true });

    await page.goto(H + '/platform/data');
    await page.locator('#rows').getByText('@').first().waitFor();
    await page.locator('#log').getByText(/venue|Jordan Hale|River North/i).first().waitFor();
    await page.locator('[data-proof]').click();
    await page.locator('#elon').getByText(/Old tool: 6 screens \/ 11 fields \/ 20 minutes · @mops: 1 ask \/ \d/).waitFor();
    await page.screenshot({ path: path.join(shot, 'platform-data.png'), fullPage: true });

    await page.goto(H + '/platform/ask');
    await page.locator('#channel').selectOption('Webex');
    await page.locator('#run').click();
    await page.locator('#result').getByText(/Sent the Chicago invite to 30/).waitFor();
    await page.screenshot({ path: path.join(shot, 'platform-ask.png'), fullPage: true });
    const pixel = await page.request.get(H + '/platform/p/chicago');
    assert.equal(pixel.status(), 200);

    await page.goto(H + '/platform/engage');
    await page.locator('#elon').getByText(/Old tool: 9 screens \/ 16 fields \/ 35 minutes · @mops: 1 ask \/ \d/).waitFor();
    await page.locator('#segments').getByText('CIOs in Illinois who opened last month').waitFor();
    await page.waitForFunction(() => Number.isFinite(Number(document.querySelector('[data-mql-count]').textContent)));
    const before = Number(await page.locator('[data-mql-count]').innerText());
    const sim = page.waitForResponse(r => r.url().includes('/simulate') && r.request().method() === 'POST');
    await page.locator('[data-simulate]').click();
    const simRes = await sim;
    assert.equal(simRes.status(), 200, await page.locator('#err').innerText());
    await page.waitForFunction((start) => Number(document.querySelector('[data-mql-count]').textContent) > start, before);
    await page.locator('#sends').getByText('100%').first().waitFor();
    await page.locator('#board').getByText('mql').first().waitFor();
    assert.equal((await page.locator('#err').innerText()).trim(), '');
    await page.screenshot({ path: path.join(shot, 'platform-engage.png'), fullPage: true });
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    stack.stop();
  }
});
