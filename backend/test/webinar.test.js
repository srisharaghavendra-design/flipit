const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-webinar-'));
process.env.MOPS_DATA_DIR = dir;
process.env.MOPS_RUNS_DIR = path.join(dir, 'runs');
process.env.VERCEL = '1';
process.env.MOPS_AUTOPILOT = '0';
process.env.ELT_MS = '0';
process.env.PULL_MS = '999999';
process.env.CRM_FAIL_RATE = '0';
delete process.env.DEMO_PASSCODE;
delete process.env.MOPS_API_KEY;

const engine = require('../../webinar/engine');
const chat = require('../../webinar/chat');
const { handleRequest } = require('../../server');
const root = path.join(__dirname, '..', '..');

function request(method, url, { headers = {}, body = '', ip = '203.0.113.40' } = {}) {
  const waiters = [];
  let ended = false;
  const req = {
    method, url, headers, socket: { remoteAddress: ip },
    on(ev, fn) {
      if (ev !== 'data' && ev !== 'end' && ev !== 'error') return;
      if (ended) { if (ev === 'data' && body) fn(body); if (ev === 'end') fn(); return; }
      waiters.push([ev, fn]);
    },
    flush() {
      if (ended) return;
      ended = true;
      for (const [ev, fn] of waiters) { if (ev === 'data' && body) fn(body); if (ev === 'end') fn(); }
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
        resolve({ status, headers: rh, body: Buffer.concat(chunks) });
      }
    };
    Promise.resolve(handleRequest(req, res)).then(() => {
      if (!res.writableEnded) reject(new Error('handler did not end ' + url));
    }).catch(reject);
    req.flush();
  });
}

function json(res) { return JSON.parse(res.body.toString('utf8')); }

function zipXml(buf) {
  const zlib = require('zlib');
  let out = '';
  let i = 0;
  while (i + 30 < buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extra;
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString();
    const data = buf.subarray(start, start + comp);
    if (name.endsWith('.xml')) out += (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i = start + comp;
  }
  return out;
}

test('the hunt, the badge file, and replay stay deterministic', () => {
  engine.reset();
  const hunt = engine.hunt(engine.ASK);
  assert.equal(hunt.accounts.length, 20);
  assert.equal(hunt.mode, 'rules');
  assert.equal(hunt.aiReady, false);
  assert.equal(hunt.accounts[0].name, 'Kestrel Forge');
  assert.equal(hunt.accounts[0].fit, 96);
  assert.ok(hunt.accounts.every((a, i, arr) => i === 0 || arr[i - 1].fit > a.fit));
  hunt.accounts.forEach(a => {
    assert.ok(a.signal);
    assert.ok(a.source);
    assert.ok(a.why);
  });
  assert.equal(hunt.trace.length <= 6, true);
  const brief = engine.brief('ACC-01');
  assert.match(brief.angle, /plant network/);
  assert.equal(brief.committee.length, 3);
  assert.ok(brief.decisions.every(d => d.why && d.source));

  const sample = engine.analyze(engine.sampleText());
  assert.equal(sample.read, 25);
  assert.equal(sample.dropped, 5);
  assert.equal(sample.merged, 5);
  assert.equal(sample.leads.length, 15);
  assert.deepEqual(sample.bands, { hot: 9, warm: 5, cold: 1 });
  assert.equal(sample.leads.filter(l => l.name === 'Priya Sharma').length, 1);
  assert.equal(sample.leads.find(l => l.name === 'Priya Sharma').scans, 3);
  assert.equal(sample.leads.find(l => l.name === 'Arun Desai').email, 'arun.desai@driftwoodmotors.example');
  assert.equal(sample.leads.find(l => l.name === 'Lila Chen').title, 'Operations Manager');
  assert.equal(sample.leads.find(l => l.company === 'Unknown Widgets').band, 'cold');
  assert.equal(sample.leads.some(l => /test scan|badge printer|walk-in/i.test(l.name)), false);
  sample.leads.forEach(l => { assert.ok(l.reason); assert.ok(l.source); });

  const first = engine.badges('');
  assert.equal(first.before, 0);
  assert.equal(first.after, 15);
  assert.ok(first.trace.length <= 8);
  assert.match(first.trace.map(t => t.line).join('\n'), /Synced 15 people/);
  assert.equal(first.trace.some(t => /@/.test(t.line)), false);
  const second = engine.badges('');
  assert.equal(second.before, 15);
  assert.equal(second.after, 15);

  const drafts = engine.followup();
  assert.equal(drafts.drafts.length, 9);
  assert.equal(drafts.drafts.some(d => /somchai|olivia/i.test(d.to)), false);
  drafts.drafts.forEach(d => {
    assert.ok(d.slot);
    assert.match(d.body, /demo catcher/);
    assert.equal(new RegExp(['cis', 'co'].join(''), 'i').test(d.body + d.subject), false);
  });

  const disk = JSON.parse(fs.readFileSync(engine.REPLAY_PATH, 'utf8'));
  const live = engine.replay();
  assert.deepEqual(disk.hunt.accounts.map(a => a.name), live.hunt.accounts.map(a => a.name));
  assert.equal(disk.badges.after, live.badges.after);
  assert.equal(disk.summary.realSent, 0);
  assert.deepEqual(live.hunt.accounts.map(a => [a.name, a.fit]), hunt.accounts.map(a => [a.name, a.fit]));
});

test('approved notes stay in the catcher', () => {
  engine.reset();
  engine.badges('');
  const approved = engine.approve();
  assert.equal(approved.caught, 9);
  assert.equal(approved.realSent, 0);
  assert.equal(approved.deliveredToProvider, 0);
  assert.ok(approved.messages.every(m => m.stored && m.deliveredToProvider === 0));
  assert.ok(approved.trace.length <= 4);
  const again = engine.approve();
  assert.equal(again.caught, 0);
  assert.equal(again.realSent, 0);
  const prev = process.env.MOPS_API_KEY;
  process.env.MOPS_API_KEY = 'present-for-the-flag-only';
  try {
    const hunt = engine.hunt(engine.ASK);
    assert.equal(hunt.mode, 'rules');
    assert.equal(hunt.aiReady, true);
    assert.equal(hunt.accounts[0].name, 'Kestrel Forge');
  } finally {
    if (prev == null) delete process.env.MOPS_API_KEY;
    else process.env.MOPS_API_KEY = prev;
  }
});

test('typed asks route to the stage steps and the files are real', () => {
  chat.reset();
  engine.reset();
  const cases = [
    ['@mops create the SOW for the Dec webinar', 'sow'],
    ['please write a statement of work', 'sow'],
    ['december webinar scope', 'sow'],
    ['pdf of the sow', 'sow'],
    ['@mops build the registration form', 'registration'],
    ['signup form fields', 'registration'],
    ['@mops create the campaign code', 'code'],
    ['need a BAN and an SFDC record', 'code'],
    ['@mops set up invites', 'invites'],
    ['draft the invite emails', 'invites'],
    ['@mops upload this list', 'upload'],
    ['clean this messy badge file', 'upload'],
    ['@mops what needs fixing?', 'fix'],
    ['what needs fixing', 'fix'],
    ['@mops give me the report', 'report'],
    ['send the pptx deck', 'report'],
    [engine.ASK, 'hunt'],
    ['brief on kestrel', 'intel']
  ];
  cases.forEach(([text, intent]) => assert.equal(chat.intent(text), intent, text));

  const sow = chat.ask('@mops create the SOW for the Dec webinar');
  assert.equal(sow.intent, 'sow');
  assert.match(sow.you, /^You did:/);
  assert.ok(sow.srisha);
  assert.ok(sow.working.length >= 2);
  assert.equal(sow.approve, true);
  assert.equal(sow.card.id, 'SOW-DEC-APAC-01');
  assert.equal(sow.card.total, '$48,000');
  const docx = chat.sowDocx();
  const sowPdf = chat.sowPdf();
  assert.equal(docx.slice(0, 2).toString(), 'PK');
  assert.match(docx.toString('utf8'), /December APAC/);
  assert.equal(sowPdf.slice(0, 5).toString(), '%PDF-');
  assert.match(sowPdf.toString('latin1'), /December APAC/);
  const approved = chat.approveSow();
  assert.equal(approved.card.status, 'Approved by Srisha on screen');
  assert.match(chat.sowDocx().toString('utf8'), /Approved by Srisha on screen/);

  const reg = chat.ask('build the registration data');
  assert.ok(reg.card.fields.includes('Work email'));
  assert.ok(reg.card.fields.includes('Consent'));
  assert.equal(reg.card.rows.filter(row => row.consent).length, 4);
  assert.equal(reg.card.rows.some(row => row.consent === false && row.name === 'Guest Badge'), true);

  const code = chat.ask('make the campaign code');
  assert.equal(code.card.ban, 'BAN-FY26Q4-APAC-1204');
  assert.equal(code.card.code, 'FY26Q4-APJ-EVT-1204');
  assert.equal(code.card.ccId, 'CC-DEC-APAC-01');
  assert.equal(code.card.sfdcId, '7010000000DECWA');
  assert.equal(code.card.owner, 'Srisha R.');

  const mail = require('../mail');
  const before = mail.db.prepare('select count(*) n from messages').get().n;
  const recordedInvites = chat.ask('@mops set up invites', '', { replay: true });
  assert.equal(recordedInvites.card.realSent, 0);
  assert.equal(recordedInvites.card.caught, 4);
  assert.equal(mail.db.prepare('select count(*) n from messages').get().n, before);
  const invites = chat.ask('@mops set up invites');
  assert.equal(invites.card.realSent, 0);
  assert.equal(invites.card.caught, 4);
  assert.ok(invites.card.drafts.every(row => row.stored === true && row.deliveredToProvider === 0));
  assert.match(invites.card.drafts[0].body, /demo catcher/);
  assert.match(invites.card.drafts[0].subject, /December APAC plant webinar/);
  assert.equal(mail.db.prepare('select count(*) n from messages').get().n, before + 4);
  const again = chat.ask('draft the invite emails');
  assert.equal(again.card.caught, 0);
  assert.equal(again.card.realSent, 0);
  assert.equal(mail.db.prepare('select count(*) n from messages').get().n, before + 4);

  const upload = chat.ask('@mops upload this list');
  assert.equal(upload.card.read, 25);
  assert.equal(upload.card.dropped, 5);
  assert.equal(upload.card.merged, 5);
  assert.equal(upload.card.before, 0);
  assert.equal(upload.card.after, 15);
  assert.deepEqual(upload.card.bands, { hot: 9, warm: 5, cold: 1 });

  const fixes = chat.ask('@mops what needs fixing?');
  assert.equal(fixes.card.items.length, 4);
  fixes.card.items.forEach(item => {
    assert.equal(item.applied, true);
    assert.ok(item.why);
    assert.ok(item.source);
  });

  const report = chat.ask('@mops give me the report');
  assert.equal(report.card.top, 'Kestrel Forge');
  assert.equal(report.card.realSent, 0);
  assert.ok(report.downloads.some(d => d.href === '/api/webinar/report.pptx'));
  assert.ok(report.downloads.some(d => d.href === '/api/webinar/report.pdf'));

  const banned = new RegExp(['cis', 'co'].join(''), 'i');
  assert.equal(banned.test(JSON.stringify(sow) + JSON.stringify(code) + JSON.stringify(invites) + JSON.stringify(fixes) + docx.toString('utf8') + sowPdf.toString('latin1')), false);
  chat.reset();
  engine.reset();
});

test('the webinar route, the home button, and the downloads', async () => {
  const files = ['webinar/engine.js', 'webinar/chat.js', 'webinar/sample-badges.csv', 'webinar/replay.json', 'ui/webinar.html'];
  const banned = new RegExp(['cis', 'co'].join(''), 'i');
  for (const file of files) assert.equal(banned.test(fs.readFileSync(path.join(root, file), 'utf8')), false, file);
  const homeSrc = fs.readFileSync(path.join(root, 'ui/home.html'), 'utf8');
  assert.match(homeSrc, /id="webinar-link"[^>]*href="\/webinar"/);
  const narrow = homeSrc.slice(homeSrc.indexOf('@media (max-width: 800px)'), homeSrc.indexOf('@media (max-width: 800px)') + 500);
  assert.doesNotMatch(narrow, /#webinar-link/);
  assert.doesNotMatch(homeSrc, /passcode/i);

  const locked = await request('GET', '/webinar');
  assert.equal(locked.status, 401);
  const login = await request('POST', '/api/login', { headers: { 'content-type': 'application/json' }, body: '{"user":"maria"}' });
  assert.equal(login.status, 200);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const H = { cookie, 'content-type': 'application/json' };

  const page = await request('GET', '/webinar', { headers: { cookie } });
  assert.equal(page.status, 200);
  const html = page.body.toString('utf8');
  assert.match(html, /You did/);
  assert.match(html, /Agent did/);
  assert.match(html, /Srisha provided/);
  assert.match(html, /Replay/);
  assert.match(html, /id="ask"/);
  assert.match(html, /create the SOW/);
  assert.match(html, /Backend trace/);
  assert.doesNotMatch(html, />Next</);
  assert.doesNotMatch(html, /passcode/i);
  assert.doesNotMatch(html, /__BRAND__/);

  const home = await request('GET', '/', { headers: { cookie } });
  assert.match(home.body.toString('utf8'), /id="webinar-link"/);
  assert.doesNotMatch(home.body.toString('utf8'), /passcode/i);

  await request('POST', '/api/webinar/reset', { headers: H, body: '{}' });
  const t0 = Date.now();
  const hunt = json(await request('POST', '/api/webinar/hunt', { headers: H, body: JSON.stringify({ ask: engine.ASK }) }));
  assert.ok(Date.now() - t0 < 20000);
  assert.equal(hunt.accounts.length, 20);
  const card = json(await request('GET', '/api/webinar/account/ACC-01', { headers: { cookie } }));
  assert.equal(card.name, 'Kestrel Forge');
  assert.ok(card.talkingPoints.length >= 3);
  const badges = json(await request('POST', '/api/webinar/badges', { headers: H, body: '{}' }));
  assert.equal(badges.read, 25);
  assert.equal(badges.before, 0);
  assert.equal(badges.after, 15);
  assert.deepEqual(badges.bands, { hot: 9, warm: 5, cold: 1 });
  const follow = json(await request('POST', '/api/webinar/followup', { headers: H, body: '{}' }));
  assert.equal(follow.drafts.length, 9);
  const approved = json(await request('POST', '/api/webinar/approve', { headers: H, body: '{}' }));
  assert.equal(approved.realSent, 0);
  assert.equal(approved.caught, 9);
  const pdf = await request('GET', '/api/webinar/report.pdf', { headers: { cookie } });
  const pptx = await request('GET', '/api/webinar/report.pptx', { headers: { cookie } });
  assert.equal(pdf.body.slice(0, 5).toString(), '%PDF-');
  assert.equal(pptx.body.slice(0, 2).toString(), 'PK');
  assert.match(pdf.body.toString('latin1'), /Kestrel Forge/);
  assert.match(zipXml(pptx.body), /Kestrel Forge/);
  assert.equal(new RegExp(['cis', 'co'].join(''), 'i').test(pdf.body.toString('latin1') + zipXml(pptx.body)), false);
  const replay = json(await request('GET', '/api/webinar/replay', { headers: { cookie } }));
  assert.deepEqual(replay.hunt.accounts.map(a => a.name), hunt.accounts.map(a => a.name));
  assert.equal(replay.badges.bands.hot, hunt && badges.bands.hot);
  assert.equal(replay.chat.sow.intent, 'sow');
  assert.equal(replay.chat.invites.card.realSent, 0);
  const asked = json(await request('POST', '/api/webinar/ask', { headers: H, body: JSON.stringify({ text: 'write a statement of work for the december webinar' }) }));
  assert.equal(asked.intent, 'sow');
  assert.match(asked.you, /You did/);
  const sowDoc = await request('GET', '/api/webinar/sow.docx', { headers: { cookie } });
  const sowPdf = await request('GET', '/api/webinar/sow.pdf', { headers: { cookie } });
  assert.equal(sowDoc.body.slice(0, 2).toString(), 'PK');
  assert.match(sowDoc.body.toString('utf8'), /December APAC/);
  assert.equal(sowPdf.body.slice(0, 5).toString(), '%PDF-');
  assert.match(sowPdf.body.toString('latin1'), /December APAC/);
  const sowOk = json(await request('POST', '/api/webinar/sow/approve', { headers: H, body: '{}' }));
  assert.equal(sowOk.card.status, 'Approved by Srisha on screen');
  const sample = await request('GET', '/api/webinar/sample.csv', { headers: { cookie } });
  assert.match(sample.body.toString('utf8'), /PRIYA SHARMA/);
  assert.match(sample.body.toString('utf8'), /Badge printer/);
});

test('the screen can be driven from the chat', async () => {
  const { chromium } = require('playwright');
  const port = 8891;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mops-webinar-ui-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      VERCEL: '1',
      MOPS_AUTOPILOT: '0',
      PORT: String(port),
      MOPS_PORT: String(port),
      MOPS_DATA_DIR: data,
      MOPS_RUNS_DIR: path.join(data, 'runs'),
      DEMO_PASSCODE: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let browser;
  try {
    const base = 'http://127.0.0.1:' + port;
    for (let i = 0; i < 50; i++) {
      try {
        const ping = await fetch(base + '/health');
        if (ping.ok) break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(base + '/');
    await page.locator('button[value="maria"]').click();
    await page.goto(base + '/webinar');
    await page.locator('#ask').waitFor();
    await page.locator('#chips .chip', { hasText: 'create the SOW' }).click();
    await page.locator('#sow-docx').waitFor();
    const docxDown = page.waitForEvent('download');
    await page.locator('#sow-docx').click();
    const docxFile = await (await docxDown).path();
    const docx = fs.readFileSync(docxFile);
    assert.equal(docx.slice(0, 2).toString(), 'PK');
    assert.match(docx.toString('utf8'), /December APAC/);
    await page.locator('#sow-approve').click();
    await page.getByText('Approved by Srisha on screen').waitFor();
    await page.locator('#chips .chip', { hasText: 'registration form' }).click();
    await page.locator('.regform').getByText('Work email', { exact: true }).waitFor();
    await page.locator('.row', { hasText: 'Guest Badge' }).waitFor();
    await page.locator('#chips .chip', { hasText: 'campaign code' }).click();
    await page.locator('dd', { hasText: 'BAN-FY26Q4-APAC-1204' }).waitFor();
    await page.locator('#chips .chip', { hasText: 'set up invites' }).click();
    await page.getByText('Sent to real inboxes: 0').waitFor();
    await page.locator('#chips .chip', { hasText: 'upload this list' }).click();
    await page.locator('.counts').waitFor();
    assert.match(await page.locator('.counts').innerText(), /25/);
    assert.match(await page.locator('.counts').innerText(), /0 → 15/);
    await page.locator('#chips .chip', { hasText: 'what needs fixing' }).click();
    await page.locator('.fix').first().waitFor();
    assert.match(await page.locator('.fix').first().innerText(), /Why/);
    assert.match(await page.locator('.fix').first().innerText(), /Source/);
    assert.equal(await page.locator('.fix').count(), 4);
    await page.locator('#chips .chip', { hasText: 'give me the report' }).click();
    await page.locator('#pptx').waitFor();
    const pptxDown = page.waitForEvent('download');
    await page.locator('#pptx').click();
    const pptxFile = await (await pptxDown).path();
    const pdfDown = page.waitForEvent('download');
    await page.locator('#pdf').click();
    const pdfFile = await (await pdfDown).path();
    const pptx = fs.readFileSync(pptxFile);
    const pdf = fs.readFileSync(pdfFile);
    assert.equal(pptx.slice(0, 2).toString(), 'PK');
    assert.equal(pdf.slice(0, 5).toString(), '%PDF-');
    assert.match(pdf.toString('latin1'), /Kestrel Forge/);
    await page.locator('#replay').click();
    await page.locator('.banner').waitFor();
    assert.match(await page.locator('.banner').innerText(), /recorded run/);
    await page.locator('#chips .chip', { hasText: 'create the SOW' }).waitFor();
  } finally {
    if (browser) await browser.close();
    child.kill('SIGTERM');
  }
});
