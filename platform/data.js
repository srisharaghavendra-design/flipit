'use strict';

const { current } = require('./db');
const { append } = require('./log');

const SCHEMA = [
  { name: 'accounts', columns: ['id', 'name', 'domain', 'region', 'industry', 'employees', 'tier', 'country', 'city'], links: 'contacts' },
  { name: 'contacts', columns: ['id', 'account_id', 'email', 'first_name', 'last_name', 'title', 'country', 'state', 'city', 'fit', 'behavior', 'score', 'stage'], links: 'consent, activities' },
  { name: 'consent', columns: ['id', 'contact_id', 'country', 'purpose', 'status', 'source', 'at', 'current'], links: 'contacts' },
  { name: 'campaigns', columns: ['id', 'name', 'region', 'program', 'status', 'owner', 'city', 'country', 'start_date', 'end_date'], links: 'events, budgets, sows, codes' },
  { name: 'events', columns: ['id', 'campaign_id', 'name', 'slug', 'city', 'capacity', 'starts_at'], links: 'campaigns' },
  { name: 'activities', columns: ['id', 'contact_id', 'campaign_id', 'event_id', 'kind', 'at', 'ref'], links: 'contacts, campaigns' },
  { name: 'budgets', columns: ['id', 'campaign_id', 'amount_usd', 'currency', 'status', 'requester', 'approver'], links: 'campaigns' },
  { name: 'sows', columns: ['id', 'campaign_id', 'vendor', 'venue', 'status', 'summary'], links: 'campaigns' },
  { name: 'codes', columns: ['id', 'campaign_id', 'kind', 'value'], links: 'campaigns' },
  { name: 'event_log', columns: ['id', 'at', 'entity', 'entity_id', 'op', 'actor', 'channel', 'source_message', 'why', 'before_json', 'after_json'], links: 'every write' }
];

const BROWSER = {
  accounts: 'name', contacts: 'email', consent: 'country', campaigns: 'name', events: 'name',
  activities: 'kind', budgets: 'status', sows: 'vendor', codes: 'value', event_log: 'why',
  segments: 'name', templates: 'name', sends: 'campaign_id', send_recipients: 'email',
  pages: 'slug', journeys: 'name', journey_members: 'status', ask_runs: 'ask_id'
};

function db() { return current(); }

async function counts() {
  const d = db();
  const pin = process.env.PLATFORM_REGION || '';
  const one = async (sql, args = []) => (await d.get(sql, args)).n;
  const regionSql = pin ? ' WHERE region = ?' : '';
  const args = pin ? [pin] : [];
  const regions = await d.all(`SELECT region, COUNT(*) AS n FROM accounts${regionSql} GROUP BY region ORDER BY region`, args);
  return {
    dialect: d.dialect,
    region: pin || 'all',
    accounts: await one(`SELECT COUNT(*) AS n FROM accounts${regionSql}`, args),
    contacts: await one(pin ? 'SELECT COUNT(*) AS n FROM contacts c JOIN accounts a ON a.id = c.account_id WHERE a.region = ?' : 'SELECT COUNT(*) AS n FROM contacts', args),
    campaigns: await one(`SELECT COUNT(*) AS n FROM campaigns${regionSql}`, args),
    events: await one('SELECT COUNT(*) AS n FROM events'),
    activities: await one('SELECT COUNT(*) AS n FROM activities'),
    consent: await one('SELECT COUNT(*) AS n FROM consent WHERE current = 1'),
    budgets: await one('SELECT COUNT(*) AS n FROM budgets'),
    sows: await one('SELECT COUNT(*) AS n FROM sows'),
    codes: await one('SELECT COUNT(*) AS n FROM codes'),
    log: await one('SELECT COUNT(*) AS n FROM event_log'),
    regions: regions.map(r => r.region)
  };
}

function schema() {
  return { tables: SCHEMA, note: 'SQLite locally. PLATFORM_DB=postgres runs these tables through the same migrations.' };
}

async function tables() {
  const d = db();
  const out = [];
  for (const name of Object.keys(BROWSER)) {
    const row = await d.get(`SELECT COUNT(*) AS n FROM ${name}`);
    out.push({ name, rows: row.n });
  }
  return out;
}

async function browse(name, { limit = 40, offset = 0, q = '' } = {}) {
  const column = BROWSER[name];
  if (!column) { const e = new Error('Unknown table'); e.status = 404; throw e; }
  const d = db();
  const cap = Math.min(100, Math.max(1, Number(limit) || 40));
  const skip = Math.max(0, Number(offset) || 0);
  const args = [];
  let where = '';
  if (q) { where = ` WHERE ${column} LIKE ?`; args.push('%' + q + '%'); }
  const total = await d.get(`SELECT COUNT(*) AS n FROM ${name}${where}`, args);
  const rows = await d.all(`SELECT * FROM ${name}${where} ORDER BY ${column} LIMIT ? OFFSET ?`, [...args, cap, skip]);
  return { name, column, total: total.n, rows };
}

async function log({ limit = 40, q = '' } = {}) {
  const d = db();
  const cap = Math.min(100, Math.max(1, Number(limit) || 40));
  const args = [];
  let where = '';
  if (q) {
    where = ' WHERE why LIKE ? OR actor LIKE ? OR channel LIKE ? OR source_message LIKE ? OR entity_id LIKE ?';
    const like = '%' + q + '%';
    args.push(like, like, like, like, like);
  }
  const total = await d.get(`SELECT COUNT(*) AS n FROM event_log${where}`, args);
  const rows = await d.all(`SELECT id, at, entity, entity_id, op, actor, channel, source_message, why, before_json, after_json FROM event_log${where} ORDER BY id DESC LIMIT ?`, [...args, cap]);
  return { total: total.n, rows };
}

async function campaign(id) {
  const d = db();
  const row = await d.get('SELECT * FROM campaigns WHERE id = ?', [id]);
  if (!row) { const e = new Error('Unknown campaign'); e.status = 404; throw e; }
  const [codes, budget, sow, event, why] = await Promise.all([
    d.all('SELECT kind, value FROM codes WHERE campaign_id = ? ORDER BY kind', [id]),
    d.get('SELECT * FROM budgets WHERE campaign_id = ?', [id]),
    d.get('SELECT * FROM sows WHERE campaign_id = ?', [id]),
    d.get('SELECT * FROM events WHERE campaign_id = ?', [id]),
    d.all("SELECT at, actor, channel, source_message, why, before_json, after_json FROM event_log WHERE entity_id = ? OR entity_id LIKE ? ORDER BY id DESC LIMIT 20", [id, '%CHI%'])
  ]);
  return { campaign: row, codes, budget, sow, event, why };
}

const PERSON = `SELECT c.id, c.email, c.first_name, c.last_name, c.title, c.country, c.state, c.city, c.score, c.stage,
  a.name AS account_name, a.region, k.status AS consent_status, k.source AS consent_source, k.at AS consent_at
  FROM contacts c
  JOIN accounts a ON a.id = c.account_id
  JOIN consent k ON k.contact_id = c.id AND k.purpose = 'email' AND k.current = 1`;

async function emailable({ state = 'Illinois', country = 'United States' } = {}) {
  const rows = await db().all(`${PERSON} WHERE c.state = ? AND c.country = ? AND k.status = 'opted_in' ORDER BY c.last_name, c.id`, [state, country]);
  return { state, country, count: rows.length, sample: rows.slice(0, 12) };
}

async function consentByRegion() {
  const rows = await db().all(`SELECT a.region, k.status, COUNT(*) AS n
    FROM contacts c JOIN accounts a ON a.id = c.account_id
    JOIN consent k ON k.contact_id = c.id AND k.purpose = 'email' AND k.current = 1
    GROUP BY a.region, k.status ORDER BY a.region, k.status`);
  return { rows };
}

async function held({ country = 'Germany', actor = 'Maria Alvarez', channel = 'App', sourceMessage = '' } = {}) {
  const rows = await db().all(`${PERSON} WHERE c.country = ? AND k.status <> 'opted_in' ORDER BY c.email`, [country]);
  await db().tx(async (q) => {
    await append(q, {
      entity: 'consent', entityId: 'hold-' + country, op: 'read', actor, channel, sourceMessage,
      why: `Held ${rows.length} ${country} contacts because they have no opted-in consent.`,
      after: { country, held: rows.length }
    });
  });
  return { country, count: rows.length, sample: rows.slice(0, 12).map(r => ({ email: r.email, status: r.consent_status, source: r.consent_source, at: r.consent_at })) };
}

module.exports = { SCHEMA, counts, schema, tables, browse, log, campaign, emailable, consentByRegion, held };
