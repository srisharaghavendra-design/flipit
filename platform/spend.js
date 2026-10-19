'use strict';

const crypto = require('crypto');
const { current } = require('./db');
const { append } = require('./log');
const { now } = require('./clock');
const { quarterOf } = require('./seed');
const { LIMIT_USD, toUSD, format } = require('../backend/money');
const { agencyOf, taxOf, milestonesOf } = require('../backend/jobs');

const OPEN = [
  { key: 'our_pm', label: 'Our project manager' },
  { key: 'po_number', label: 'Purchase order' },
  { key: 'venue_contact', label: 'Day-of venue contact' }
];

function db() { return current(); }
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }

async function findCampaign(q, { campaignId, name }) {
  if (campaignId) return q.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return q.get('SELECT * FROM campaigns WHERE lower(name) = ? OR lower(name) LIKE ? ORDER BY id LIMIT 1', [needle, '%' + needle + '%']);
}

async function mint(q, campaign) {
  let code = await q.get("SELECT value FROM codes WHERE campaign_id = ? AND kind = 'campaign'", [campaign.id]);
  if (!code) {
    const { campaignCode } = require('./seed');
    const serial = campaign.id === 'CAMP-CHI' ? 1 : Number(String(campaign.id).replace(/\D/g, '')) || 1;
    const value = campaignCode(campaign.region, campaign.program, serial, campaign.start_date);
    await q.run('INSERT INTO codes(id, campaign_id, kind, value) VALUES(?,?,?,?)', ['COD-' + campaign.id + '-C', campaign.id, 'campaign', value]);
    code = { value };
  }
  let ban = await q.get("SELECT value FROM codes WHERE campaign_id = ? AND kind = 'ban'", [campaign.id]);
  if (!ban) {
    const n = (await q.get("SELECT COUNT(*) AS n FROM codes WHERE kind = 'ban'")).n + 1;
    const value = `BAN-${quarterOf(campaign.start_date)}-4100-${String(n).padStart(4, '0')}`;
    await q.run('INSERT INTO codes(id, campaign_id, kind, value) VALUES(?,?,?,?)', ['COD-' + campaign.id + '-BAN', campaign.id, 'ban', value]);
    await append(q, { entity: 'codes', entityId: 'COD-' + campaign.id + '-BAN', op: 'insert', actor: 'Plan', channel: 'App', sourceMessage: '', why: `Minted ${value} for ${campaign.name}.`, after: { value } });
    ban = { value };
  }
  return { campaignCode: code.value, ban: ban.value };
}

function draftSow(campaign, budget, codes, answers) {
  const agency = agencyOf({ country: campaign.country });
  const tax = taxOf(campaign.country, budget.amount, budget.currency);
  const miles = milestonesOf(budget.amount, campaign.country);
  const filled = {
    agency: agency.legal,
    agency_pm: agency.pm,
    agency_email: agency.email,
    venue: budget.venue || '',
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    amount: format(budget.amount, budget.currency),
    currency: budget.currency,
    tax: tax.note,
    payment: miles.map(m => `${m.pct}% ${m.name}`).join(', '),
    cost_center: 'CC-4100',
    campaign_code: codes.campaignCode,
    ban: codes.ban,
    our_pm: answers.our_pm || '',
    po_number: answers.po_number || '',
    venue_contact: answers.venue_contact || ''
  };
  const open = OPEN.filter(f => !String(filled[f.key] || '').trim());
  return { agency: agency.legal, fields: filled, open, status: open.length ? 'needs 3 answers' : 'ready' };
}

async function file({ campaignId, name, amount, currency = 'USD', actor, channel, sourceMessage, idempotencyKey, answers }) {
  const d = db();
  const usd = toUSD(amount, currency);
  if (usd == null || usd <= 0) fail(400, 'Amount has to be a number greater than zero.');
  const key = idempotencyKey || `budget:${campaignId || name}:${amount}:${currency}`;
  const prev = await d.get('SELECT * FROM plan_packets WHERE idempotency_key = ?', [key]);
  if (prev) return present(prev, true);
  let packet;
  await d.tx(async (q) => {
    const campaign = await findCampaign(q, { campaignId, name });
    if (!campaign) fail(404, 'No campaign matches that request.');
    const pin = process.env.PLATFORM_REGION || '';
    if (pin && campaign.region !== pin && campaign.region !== 'Global') fail(400, `This deployment holds ${pin} only.`);
    const sow = await q.get('SELECT venue, vendor FROM sows WHERE campaign_id = ?', [campaign.id]);
    const existing = await q.get('SELECT * FROM budgets WHERE campaign_id = ?', [campaign.id]);
    const over = usd > LIMIT_USD;
    let status; let approver;
    if (existing && existing.amount_usd === usd && existing.status === 'approved') {
      status = 'approved';
      approver = existing.approver || (over ? 'Chris M.' : null);
    } else if (over) {
      status = 'pending';
      approver = 'Chris M.';
    } else {
      status = 'approved';
      approver = null;
    }
    const codes = await mint(q, campaign);
    const draft = draftSow(campaign, { amount, currency, venue: sow && sow.venue }, codes, answers || {});
    const id = 'PKT-' + crypto.randomBytes(3).toString('hex');
    const at = now();
    await q.run(`INSERT INTO plan_packets(id, campaign_id, idempotency_key, amount, currency, amount_usd, status, approver, ban, campaign_code, sow_json, open_json, actor, channel, source_message, at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, campaign.id, key, amount, currency, usd, status, approver, codes.ban, codes.campaignCode, JSON.stringify(draft), JSON.stringify(draft.open), actor || 'Maria Alvarez', channel || 'App', sourceMessage || '', at]);
    const why = over
      ? `Filed ${format(amount, currency)} for ${campaign.name}. That is about ${money(usd)}, over $150,000, so Chris M. has to approve.`
      : `Filed ${format(amount, currency)} for ${campaign.name}. That is about ${money(usd)}, at or under $150,000, so it auto-approves.`;
    await append(q, { entity: 'plan_packets', entityId: id, op: 'insert', actor, channel, sourceMessage, why, after: { status, approver, ban: codes.ban, code: codes.campaignCode, usd } });
    packet = await q.get('SELECT * FROM plan_packets WHERE id = ?', [id]);
  });
  return present(packet, false);
}

function present(row, idempotent) {
  const sow = JSON.parse(row.sow_json);
  const open = JSON.parse(row.open_json);
  return {
    id: row.id, campaignId: row.campaign_id, amount: row.amount, currency: row.currency, amountUsd: row.amount_usd,
    status: row.status, approver: row.approver || null, ban: row.ban, campaignCode: row.campaign_code,
    sow, open, idempotent: !!idempotent, threshold: LIMIT_USD, actor: row.actor, channel: row.channel
  };
}

async function answer({ campaignId = 'CAMP-CHI', answers = {}, actor, channel, sourceMessage }) {
  const d = db();
  const row = await d.get('SELECT * FROM plan_packets WHERE campaign_id = ? ORDER BY at DESC LIMIT 1', [campaignId]);
  if (!row) fail(404, 'File the budget before filling the SOW.');
  const sow = JSON.parse(row.sow_json);
  for (const field of OPEN) if (String(answers[field.key] || '').trim()) sow.fields[field.key] = String(answers[field.key]).trim();
  sow.open = OPEN.filter(f => !String(sow.fields[f.key] || '').trim());
  sow.status = sow.open.length ? 'needs 3 answers' : 'ready';
  await d.tx(async (q) => {
    await q.run('UPDATE plan_packets SET sow_json = ?, open_json = ? WHERE id = ?', [JSON.stringify(sow), JSON.stringify(sow.open), row.id]);
    await append(q, { entity: 'plan_packets', entityId: row.id, op: 'update', actor, channel, sourceMessage, why: sow.open.length ? `Saved SOW answers. ${sow.open.length} still open.` : 'Saved the three SOW answers a person had to supply.', after: { open: sow.open.map(f => f.key) } });
  });
  const next = await d.get('SELECT * FROM plan_packets WHERE id = ?', [row.id]);
  return present(next, false);
}

async function packets() {
  const rows = await db().all('SELECT * FROM plan_packets ORDER BY at DESC LIMIT 20');
  return rows.map(r => present(r, false));
}

async function actuals() {
  const rows = await db().all(`SELECT c.id, c.name, c.region, c.program, b.amount_usd AS budget, COALESCE(a.amount_usd, 0) AS actual
    FROM campaigns c JOIN budgets b ON b.campaign_id = c.id
    LEFT JOIN actuals a ON a.campaign_id = c.id
    ORDER BY CASE WHEN c.id = 'CAMP-CHI' THEN 0 ELSE 1 END, c.region, c.id`);
  return rows.map(r => ({ ...r, variance: r.budget - r.actual }));
}

async function remaining(region = 'Americas') {
  const env = await db().get('SELECT amount_usd AS n FROM envelopes WHERE region = ?', [region]);
  if (!env) fail(404, 'Unknown region');
  const spent = await db().get('SELECT COALESCE(SUM(b.amount_usd), 0) AS n FROM budgets b JOIN campaigns c ON c.id = b.campaign_id WHERE c.region = ?', [region]);
  const actual = await db().get('SELECT COALESCE(SUM(a.amount_usd), 0) AS n FROM actuals a JOIN campaigns c ON c.id = a.campaign_id WHERE c.region = ?', [region]);
  return { region, envelope: env.n, committed: spent.n, actual: actual.n, left: env.n - spent.n };
}

async function codes({ campaignId = 'CAMP-CHI', actor, channel, sourceMessage } = {}) {
  let out;
  await db().tx(async (q) => {
    const campaign = await q.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
    if (!campaign) fail(404, 'Unknown campaign');
    out = await mint(q, campaign);
    await append(q, { entity: 'codes', entityId: campaignId, op: 'read', actor, channel, sourceMessage, why: `The code for ${campaign.name} is ${out.campaignCode}. The BAN is ${out.ban}. A second mint returns the same ids.`, after: out });
  });
  return out;
}

async function chicagoPacket() {
  const row = await db().get("SELECT * FROM plan_packets WHERE campaign_id = 'CAMP-CHI' ORDER BY at DESC LIMIT 1");
  return row ? present(row, false) : null;
}

module.exports = { file, answer, packets, actuals, remaining, codes, chicagoPacket, OPEN, LIMIT_USD, money, present };
