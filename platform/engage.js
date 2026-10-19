'use strict';

const crypto = require('crypto');
const { current } = require('./db');
const { append } = require('./log');
const { now, daysBeforeDemo } = require('./clock');
const { behaviorOf, stageOf, MQL_THRESHOLD } = require('./score');
const { deliver } = require('../backend/mail');
const { publicBase } = require('../backend/lib');

const SEND_CAP = 250;
const FIELDS = {
  'contact.title': 'c.title', 'contact.state': 'c.state', 'contact.country': 'c.country', 'contact.city': 'c.city',
  'contact.email': 'c.email', 'contact.first': 'c.first_name', 'contact.last': 'c.last_name',
  'account.region': 'a.region', 'account.name': 'a.name', 'account.industry': 'a.industry', 'account.employees': 'a.employees',
  'consent.status': 'k.status', 'consent.country': 'k.country'
};
const KINDS = ['open', 'click', 'send', 'registration', 'attendance'];
const FROM = `FROM contacts c
  JOIN accounts a ON a.id = c.account_id
  JOIN consent k ON k.contact_id = c.id AND k.purpose = 'email' AND k.current = 1`;
const SELECT = `SELECT c.id, c.email, c.first_name, c.last_name, c.title, c.country, c.state, c.city, c.fit, c.behavior, c.score, c.stage,
  a.name AS account_name, a.region, a.industry, a.employees, a.tier, k.status AS consent_status`;

function db() { return current(); }
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }

function rule(r, args) {
  if (r && typeof r.field === 'string' && r.field.startsWith('activity.')) {
    const kind = r.field.slice('activity.'.length);
    if (!KINDS.includes(kind)) fail(400, 'Unknown activity ' + kind);
    if (!['within_days', 'exists', 'missing'].includes(r.op)) fail(400, 'Unknown activity test');
    let sql = 'EXISTS (SELECT 1 FROM activities v WHERE v.contact_id = c.id AND v.kind = ?';
    args.push(kind);
    if (r.op === 'within_days') { sql += ' AND v.at >= ?'; args.push(daysBeforeDemo(Number(r.value) || 30)); }
    if (r.campaignId) { sql += ' AND v.campaign_id = ?'; args.push(r.campaignId); }
    sql += ')';
    return r.op === 'missing' ? 'NOT ' + sql : sql;
  }
  const col = FIELDS[r && r.field];
  if (!col) fail(400, 'Unknown field ' + (r && r.field));
  if (r.op === 'eq') { args.push(String(r.value)); return `${col} = ?`; }
  if (r.op === 'neq') { args.push(String(r.value)); return `${col} <> ?`; }
  if (r.op === 'contains') { args.push('%' + String(r.value) + '%'); return `${col} LIKE ?`; }
  if (r.op === 'gte') { args.push(Number(r.value)); return `${col} >= ?`; }
  if (r.op === 'lte') { args.push(Number(r.value)); return `${col} <= ?`; }
  fail(400, 'Unknown test ' + r.op);
}

function compile(rules) {
  const args = [];
  const walk = (node) => {
    if (!node || (!Array.isArray(node.all) && !Array.isArray(node.any))) fail(400, 'A segment needs all or any');
    const list = node.all || node.any;
    const joiner = node.all ? ' AND ' : ' OR ';
    if (!list.length) return '1 = 1';
    return '(' + list.map(item => (item.all || item.any) ? walk(item) : rule(item, args)).join(joiner) + ')';
  };
  let where = walk(rules);
  if (process.env.PLATFORM_REGION) { where += ' AND a.region = ?'; args.push(process.env.PLATFORM_REGION); }
  return { sql: `${FROM} WHERE ${where}`, args };
}

async function preview(rules, limit = 8) {
  const { sql, args } = compile(rules);
  const count = await db().get(`SELECT COUNT(*) AS n ${sql}`, args);
  const sample = await db().all(`${SELECT} ${sql} ORDER BY c.id LIMIT ?`, [...args, Math.min(50, limit)]);
  return { count: count.n, sample };
}

async function members(rules) {
  const { sql, args } = compile(rules);
  const count = await db().get(`SELECT COUNT(*) AS n ${sql}`, args);
  if (count.n > SEND_CAP) return { count: count.n, rows: [], tooMany: true };
  const rows = await db().all(`${SELECT} ${sql} ORDER BY c.id`, args);
  return { count: count.n, rows };
}

async function listSegments() {
  const segs = await db().all('SELECT * FROM segments ORDER BY created_at, id');
  const out = [];
  for (const s of segs) {
    let count = 0;
    try { count = (await preview(JSON.parse(s.rules_json), 1)).count; } catch (e) { count = 0; }
    out.push({ id: s.id, name: s.name, rules: JSON.parse(s.rules_json), count });
  }
  return out;
}

async function saveSegment({ id, name, rules, actor, channel, sourceMessage }) {
  if (!name) fail(400, 'Segment needs a name');
  const found = await preview(rules, 5);
  const d = db();
  const existing = id
    ? await d.get('SELECT id FROM segments WHERE id = ?', [id])
    : await d.get('SELECT id FROM segments WHERE name = ?', [name]);
  const sid = existing ? existing.id : (id || 'SEG-' + crypto.randomBytes(3).toString('hex'));
  await d.tx(async (q) => {
    if (existing) await q.run('UPDATE segments SET name = ?, rules_json = ? WHERE id = ?', [name, JSON.stringify(rules), sid]);
    else await q.run('INSERT INTO segments(id, name, rules_json, created_at) VALUES(?, ?, ?, ?)', [sid, name, JSON.stringify(rules), now()]);
    await append(q, { entity: 'segments', entityId: sid, op: existing ? 'update' : 'insert', actor, channel, sourceMessage, why: `Saved “${name}”. ${found.count} contacts match.`, after: { count: found.count } });
  });
  return { id: sid, name, count: found.count, sample: found.sample };
}

async function listTemplates() {
  return db().all('SELECT id, name, subject, html, created_at FROM templates ORDER BY id');
}

async function saveTemplate({ id, name, subject, html, actor, channel, sourceMessage }) {
  if (!name || !subject || !html) fail(400, 'Template needs a name, subject, and body');
  const d = db();
  const existing = id ? await d.get('SELECT id FROM templates WHERE id = ?', [id]) : await d.get('SELECT id FROM templates WHERE name = ?', [name]);
  const tid = existing ? existing.id : (id || 'TPL-' + crypto.randomBytes(3).toString('hex'));
  await d.tx(async (q) => {
    if (existing) await q.run('UPDATE templates SET name = ?, subject = ?, html = ? WHERE id = ?', [name, subject, html, tid]);
    else await q.run('INSERT INTO templates(id, name, subject, html, created_at) VALUES(?, ?, ?, ?, ?)', [tid, name, subject, html, now()]);
    await append(q, { entity: 'templates', entityId: tid, op: existing ? 'update' : 'insert', actor, channel, sourceMessage, why: `Saved the “${name}” template.`, after: { subject } });
  });
  return { id: tid, name, subject, html };
}

function merge(tpl, contact, campaign, link) {
  const map = {
    first: contact.first_name || '', last: contact.last_name || '', company: contact.account_name || '',
    title: contact.title || '', city: campaign.city || '', campaign: campaign.name || '', email: contact.email || '', link: link || ''
  };
  return String(tpl == null ? '' : tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => map[key] == null ? '' : String(map[key]));
}

async function rates(sendId) {
  const r = await db().get('SELECT COUNT(*) AS n, COALESCE(SUM(opened), 0) AS opens, COALESCE(SUM(clicked), 0) AS clicks FROM send_recipients WHERE send_id = ?', [sendId]);
  return { recipients: r.n, opens: r.opens, clicks: r.clicks, openRate: r.n ? r.opens / r.n : 0, clickRate: r.n ? r.clicks / r.n : 0 };
}

async function getSend(id) {
  const row = await db().get('SELECT * FROM sends WHERE id = ?', [id]);
  if (!row) fail(404, 'Unknown send');
  const sample = await db().all('SELECT token, email, contact_id, opened, clicked FROM send_recipients WHERE send_id = ? ORDER BY email LIMIT 8', [id]);
  return { ...row, ...(await rates(id)), sample };
}

async function listSends() {
  const rows = await db().all('SELECT * FROM sends ORDER BY at DESC LIMIT 40');
  const out = [];
  for (const row of rows) out.push({ ...row, ...(await rates(row.id)) });
  return out;
}

async function deliverOne(q, { contact, template, campaign, sendId, actor, channel, sourceMessage }) {
  const token = crypto.randomBytes(9).toString('base64url');
  const link = `${publicBase()}/platform/t/c/${token}`;
  const subject = merge(template.subject, contact, campaign, link);
  const body = merge(template.html, contact, campaign, link);
  const html = `${body}<img src="${publicBase()}/platform/t/o/${token}" width="1" height="1" alt="">`;
  if (/\{\{/.test(subject + html)) fail(500, 'A merge field was left in the email');
  const mail = deliver({
    from: 'events@northwind.example', to: contact.email, subject, html, text: body.replace(/<[^>]+>/g, ' '),
    headers: { 'X-Mops-Campaign': campaign.id, 'X-Mops-Send': sendId }
  });
  await q.run('INSERT INTO send_recipients(token, send_id, contact_id, email, opened, clicked, mail_id) VALUES(?, ?, ?, ?, 0, 0, ?)', [token, sendId, contact.id, contact.email, mail.id]);
  const actId = 'ACT-' + crypto.randomBytes(4).toString('hex');
  await q.run('INSERT INTO activities(id, contact_id, campaign_id, event_id, kind, at, ref) VALUES(?, ?, ?, NULL, ?, ?, ?)', [actId, contact.id, campaign.id, 'send', now(), sendId]);
  await append(q, { entity: 'activities', entityId: actId, op: 'insert', actor, channel, sourceMessage, why: `Sent “${subject}” to ${contact.first_name} ${contact.last_name} at ${contact.email}.`, after: { kind: 'send', email: contact.email } });
  return { token, email: contact.email, first_name: contact.first_name, subject };
}

async function send({ segmentId, templateId, campaignId, actor, channel, sourceMessage, idempotencyKey }) {
  const d = db();
  if (idempotencyKey) {
    const prev = await d.get('SELECT id FROM sends WHERE idempotency_key = ?', [idempotencyKey]);
    if (prev) { const body = await getSend(prev.id); body.idempotent = true; return body; }
  }
  const seg = await d.get('SELECT * FROM segments WHERE id = ?', [segmentId]);
  if (!seg) fail(404, 'Unknown segment');
  const template = await d.get('SELECT * FROM templates WHERE id = ?', [templateId]);
  if (!template) fail(404, 'Unknown template');
  const campaign = await d.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) fail(404, 'Unknown campaign');
  const pin = process.env.PLATFORM_REGION || '';
  if (pin && campaign.region !== pin && campaign.region !== 'Global') fail(400, `This deployment holds ${pin} only.`);
  const found = await members(JSON.parse(seg.rules_json));
  if (found.tooMany) fail(400, `Narrow the segment. ${found.count} contacts is too many for one send.`);
  const allowed = found.rows.filter(c => c.consent_status === 'opted_in');
  const held = found.rows.filter(c => c.consent_status !== 'opted_in');
  const sendId = 'SND-' + crypto.randomBytes(4).toString('hex');
  const sample = [];
  await d.tx(async (q) => {
    await q.run('INSERT INTO sends(id, segment_id, template_id, campaign_id, idempotency_key, actor, channel, source_message, sent, held, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [sendId, segmentId, templateId, campaignId, idempotencyKey || null, actor || 'Engage', channel || 'App', sourceMessage || '', allowed.length, held.length, now()]);
    for (const contact of allowed) sample.push(await deliverOne(q, { contact, template, campaign, sendId, actor, channel, sourceMessage }));
    await append(q, { entity: 'sends', entityId: sendId, op: 'insert', actor, channel, sourceMessage, why: `Sent the ${template.name} to ${allowed.length}. Held ${held.length} without opted-in consent.`, after: { sent: allowed.length, held: held.length, campaignId } });
  });
  return { id: sendId, sent: allowed.length, held: held.length, heldSample: held.slice(0, 8).map(h => ({ email: h.email, status: h.consent_status })), sample: sample.slice(0, 5), idempotent: false, ...(await rates(sendId)) };
}

async function rescore(q, contactId, why, actor) {
  const before = await q.get('SELECT fit, score, stage FROM contacts WHERE id = ?', [contactId]);
  const kinds = await q.all('SELECT kind FROM activities WHERE contact_id = ?', [contactId]);
  const behavior = behaviorOf(kinds.map(k => k.kind));
  const score = before.fit + behavior;
  const stage = stageOf(score);
  await q.run('UPDATE contacts SET behavior = ?, score = ?, stage = ? WHERE id = ?', [behavior, score, stage, contactId]);
  await append(q, { entity: 'contacts', entityId: contactId, op: 'update', actor: actor || 'Engage', channel: 'Email', sourceMessage: '', why, before: { score: before.score, stage: before.stage }, after: { score, stage } });
  return { score, stage, behavior };
}

async function mark(token, kind, why) {
  if (kind !== 'open' && kind !== 'click') fail(400, 'Unknown tracking event');
  const column = kind === 'open' ? 'opened' : 'clicked';
  const d = db();
  const rec = await d.get('SELECT * FROM send_recipients WHERE token = ?', [token]);
  if (!rec || rec[column]) return { ok: true, duplicate: true, token };
  const send = await d.get('SELECT campaign_id FROM sends WHERE id = ?', [rec.send_id]);
  let score;
  await d.tx(async (q) => {
    await q.run(`UPDATE send_recipients SET ${column} = 1 WHERE token = ?`, [token]);
    const actId = 'ACT-' + crypto.randomBytes(4).toString('hex');
    await q.run('INSERT INTO activities(id, contact_id, campaign_id, event_id, kind, at, ref) VALUES(?, ?, ?, NULL, ?, ?, ?)', [actId, rec.contact_id, send.campaign_id, kind, now(), rec.send_id]);
    score = await rescore(q, rec.contact_id, why, 'contact');
    await append(q, { entity: 'activities', entityId: actId, op: 'insert', actor: 'contact', channel: 'Email', sourceMessage: token, why, after: { kind, email: rec.email } });
  });
  return { ok: true, duplicate: false, token, ...score };
}

async function simulate(sendId, { opens = true, clicks = false } = {}) {
  const rows = await db().all('SELECT token, opened, clicked FROM send_recipients WHERE send_id = ?', [sendId]);
  if (!rows.length) fail(404, 'Unknown send');
  let opened = 0; let clicked = 0;
  for (const row of rows) {
    if (opens && !row.opened) { await mark(row.token, 'open', 'Recorded an open from the tracking pixel.'); opened++; }
    if (clicks && !row.clicked) { await mark(row.token, 'click', 'Recorded a click from the redirect.'); clicked++; }
  }
  return { opened, clicked, ...(await rates(sendId)) };
}

async function scores({ segmentId } = {}) {
  const d = db();
  const totals = await d.get("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN stage = 'mql' THEN 1 ELSE 0 END), 0) AS mqls FROM contacts");
  if (!segmentId) {
    const top = await d.all(`SELECT c.id, c.first_name, c.last_name, c.title, c.state, c.score, c.fit, c.behavior, c.stage, a.name AS account_name, a.region
      FROM contacts c JOIN accounts a ON a.id = c.account_id ORDER BY c.score DESC, c.id LIMIT 25`);
    return { threshold: MQL_THRESHOLD, total: totals.n, mqls: totals.mqls, top };
  }
  const seg = await d.get('SELECT rules_json FROM segments WHERE id = ?', [segmentId]);
  if (!seg) fail(404, 'Unknown segment');
  const { sql, args } = compile(JSON.parse(seg.rules_json));
  const top = await d.all(`${SELECT} ${sql} ORDER BY c.score DESC, c.id LIMIT 25`, args);
  const m = await d.get(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN c.stage = 'mql' THEN 1 ELSE 0 END), 0) AS mqls ${sql}`, args);
  return { threshold: MQL_THRESHOLD, total: totals.n, mqls: m.mqls, inSegment: m.n, top };
}

async function listJourneys() {
  const rows = await db().all('SELECT * FROM journeys ORDER BY id');
  return rows.map(r => ({ ...r, steps: JSON.parse(r.steps_json) }));
}

async function sendOne(contactId, templateId, campaignId, ctx) {
  const d = db();
  const contact = await d.get(`${SELECT} ${FROM} WHERE c.id = ?`, [contactId]);
  if (!contact) fail(404, 'Unknown contact');
  if (contact.consent_status !== 'opted_in') return { skipped: true, reason: 'no opted-in consent' };
  const template = await d.get('SELECT * FROM templates WHERE id = ?', [templateId]);
  const campaign = await d.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  const sendId = 'SND-' + crypto.randomBytes(3).toString('hex');
  let sample;
  await d.tx(async (q) => {
    await q.run('INSERT INTO sends(id, segment_id, template_id, campaign_id, idempotency_key, actor, channel, source_message, sent, held, at) VALUES(?, ?, ?, ?, NULL, ?, ?, ?, 1, 0, ?)',
      [sendId, 'journey', templateId, campaignId, ctx.actor || 'Engage', ctx.channel || 'App', ctx.sourceMessage || '', now()]);
    sample = await deliverOne(q, { contact, template, campaign, sendId, actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.sourceMessage });
  });
  return { skipped: false, sendId, ...sample };
}

async function tickJourney(id, ctx = {}) {
  const journey = await db().get('SELECT * FROM journeys WHERE id = ?', [id]);
  if (!journey) fail(404, 'Unknown journey');
  const steps = JSON.parse(journey.steps_json);
  const due = await db().all("SELECT * FROM journey_members WHERE journey_id = ? AND status = 'active' AND next_at <= ?", [id, now()]);
  let sent = 0; let waited = 0;
  for (const member of due) {
    const step = steps[member.step];
    if (!step) { await db().run("UPDATE journey_members SET status = 'done' WHERE id = ?", [member.id]); continue; }
    if (step.type === 'wait') {
      const nxt = member.step + 1;
      if (!steps[nxt]) await db().run("UPDATE journey_members SET step = ?, status = 'done' WHERE id = ?", [nxt, member.id]);
      else await db().run("UPDATE journey_members SET step = ?, next_at = ? WHERE id = ?", [nxt, now(), member.id]);
      waited++;
      continue;
    }
    if (step.if === 'not_registered') {
      const reg = await db().get("SELECT id FROM activities WHERE contact_id = ? AND campaign_id = ? AND kind = 'registration'", [member.contact_id, journey.campaign_id]);
      if (reg) { await db().run("UPDATE journey_members SET status = 'done' WHERE id = ?", [member.id]); continue; }
    }
    const result = await sendOne(member.contact_id, step.templateId, journey.campaign_id, ctx);
    if (!result.skipped) sent++;
    const nxt = member.step + 1;
    const following = steps[nxt];
    if (!following) await db().run("UPDATE journey_members SET step = ?, status = 'done' WHERE id = ?", [nxt, member.id]);
    else if (following.type === 'wait') {
      const at = new Date(Date.now() + (following.hours || 0) * 3600 * 1000).toISOString();
      await db().run('UPDATE journey_members SET step = ?, next_at = ? WHERE id = ?', [nxt, at, member.id]);
    } else await db().run('UPDATE journey_members SET step = ?, next_at = ? WHERE id = ?', [nxt, now(), member.id]);
  }
  return { sent, waited, due: due.length };
}

async function enrollClickers({ journeyId = 'J-CHI', campaignId = 'CAMP-CHI', actor, channel, sourceMessage } = {}) {
  const rows = await db().all(`SELECT DISTINCT c.id FROM contacts c
    JOIN activities v ON v.contact_id = c.id AND v.kind = 'click' AND v.campaign_id = ?
    WHERE NOT EXISTS (SELECT 1 FROM activities r WHERE r.contact_id = c.id AND r.kind = 'registration' AND r.campaign_id = ?)`, [campaignId, campaignId]);
  let enrolled = 0;
  const at = now();
  await db().tx(async (q) => {
    for (const row of rows) {
      const info = await q.run("INSERT INTO journey_members(id, journey_id, contact_id, step, next_at, status) VALUES(?, ?, ?, 0, ?, 'active') ON CONFLICT(journey_id, contact_id) DO NOTHING", ['JM-' + journeyId + '-' + row.id, journeyId, row.id, at]);
      if (info.changes) enrolled++;
    }
    await append(q, { entity: 'journeys', entityId: journeyId, op: 'update', actor, channel, sourceMessage, why: `Enrolled ${enrolled} clickers who have not registered.`, after: { enrolled, campaignId } });
  });
  const run = await tickJourney(journeyId, { actor, channel, sourceMessage });
  return { enrolled, ...run };
}

async function page(slug) {
  return db().get('SELECT p.*, e.city, e.starts_at, c.name AS campaign_name FROM pages p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN events e ON e.id = p.event_id WHERE p.slug = ?', [slug]);
}

function pageHtml(p, message) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const note = message ? `<p class="note">${esc(message)}</p>` : '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title>
<style>body{margin:0;background:#f6f5f2;color:#1a1c1f;font:18px/1.45 Georgia,serif}main{max-width:560px;margin:0 auto;padding:48px 20px}h1{font-size:40px;line-height:1.05;margin:0 0 8px}label{display:block;margin:14px 0 4px;font:600 13px/1.2 ui-sans-serif,system-ui}input,select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cfcbc2;border-radius:8px;font:16px ui-sans-serif,system-ui}button{margin-top:18px;background:#1a1c1f;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:600 15px ui-sans-serif,system-ui}.note{background:#e7f6ec;padding:12px 14px;border-radius:10px}</style>
<main><p>Northwind</p><h1>${esc(p.title)}</h1><p>${esc(p.city || '')} · ${esc((p.starts_at || '').slice(0, 10))}</p>${note}
<form method="post"><label>Name</label><input name="name" required><label>Email</label><input name="email" type="email" required><label>Company</label><input name="company"><label>Country</label><input name="country" value="United States"><label><input type="checkbox" name="consent" value="yes" style="width:auto"> Email me about this event</label><button>Register</button></form></main>`;
}

async function register(slug, fields, ctx = {}) {
  const p = await page(slug);
  if (!p) return null;
  const email = String(fields.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail(400, 'Email is required');
  const consented = fields.consent === 'yes' || fields.consent === 'on' || fields.consent === true;
  const country = String(fields.country || 'United States');
  const d = db();
  let contact = await d.get('SELECT * FROM contacts WHERE email = ?', [email]);
  await d.tx(async (q) => {
    if (!contact) {
      const domain = email.split('@')[1];
      let account = await q.get('SELECT * FROM accounts WHERE domain = ?', [domain]);
      if (!account) {
        const id = 'AC-' + crypto.randomBytes(3).toString('hex');
        account = { id, name: fields.company || domain, region: 'Americas', employees: 200, tier: 3 };
        await q.run('INSERT INTO accounts(id, name, domain, region, industry, employees, tier, country, city) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, account.name, domain, 'Americas', 'Unknown', 200, 3, country, '']);
        await append(q, { entity: 'accounts', entityId: id, op: 'insert', actor: fields.name || email, channel: 'App', sourceMessage: slug, why: 'Created an account from a landing-page registration.', after: { name: account.name } });
      }
      const id = 'CT-' + crypto.randomBytes(3).toString('hex');
      const parts = String(fields.name || email).split(/\s+/);
      contact = { id, first_name: parts[0] || 'Guest', fit: 8 };
      await q.run('INSERT INTO contacts(id, account_id, email, first_name, last_name, title, country, state, city, fit, behavior, score, stage) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 8, 0, 8, ?)',
        [id, account.id, email, contact.first_name, parts.slice(1).join(' '), 'Guest', country, '', '', 'lead']);
      await append(q, { entity: 'contacts', entityId: id, op: 'insert', actor: fields.name || email, channel: 'App', sourceMessage: slug, why: 'Added a contact from the registration form.', after: { email } });
    }
    const consentId = 'CN-' + crypto.randomBytes(3).toString('hex');
    await q.run('UPDATE consent SET current = 0 WHERE contact_id = ? AND purpose = ? AND current = 1', [contact.id, 'email']);
    await q.run('INSERT INTO consent(id, contact_id, country, purpose, status, source, at, current) VALUES(?, ?, ?, ?, ?, ?, ?, 1)',
      [consentId, contact.id, country, 'email', consented ? 'opted_in' : 'unknown', 'Landing page ' + slug, now()]);
    await append(q, { entity: 'consent', entityId: consentId, op: 'insert', actor: fields.name || email, channel: 'App', sourceMessage: slug, why: consented ? `Recorded opted-in consent for ${country} from the registration form.` : `Registration did not include email consent for ${country}.`, after: { status: consented ? 'opted_in' : 'unknown', country } });
    const actId = 'ACT-' + crypto.randomBytes(3).toString('hex');
    await q.run('INSERT INTO activities(id, contact_id, campaign_id, event_id, kind, at, ref) VALUES(?, ?, ?, ?, ?, ?, ?)', [actId, contact.id, p.campaign_id, p.event_id, 'registration', now(), slug]);
    await rescore(q, contact.id, 'Recorded a registration from the landing page.', fields.name || email);
    await append(q, { entity: 'activities', entityId: actId, op: 'insert', actor: fields.name || email, channel: 'App', sourceMessage: slug, why: `Registered ${email} for ${p.title}.`, after: { kind: 'registration' } });
  });
  return { ok: true, email, html: pageHtml(p, 'You are registered.') };
}

module.exports = {
  MQL_THRESHOLD, SEND_CAP, compile, preview, members, listSegments, saveSegment, listTemplates, saveTemplate,
  send, getSend, listSends, simulate, mark, scores, listJourneys, enrollClickers, tickJourney, page, pageHtml, register, merge
};
