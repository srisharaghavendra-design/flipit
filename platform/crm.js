'use strict';

const crypto = require('crypto');
const { current } = require('./db');
const { append } = require('./log');
const { now } = require('./clock');
const { readFile } = require('../backend/mapper');
const sample = require('./sample');

const STRICT = new Set(['Germany', 'France', 'United Kingdom', 'Netherlands', 'India', 'Singapore', 'Australia', 'Switzerland', 'United Arab Emirates']);
const EXEC = /\b(CIO|CTO|CISO|CMO|VP|Chief|Director|Head|President)\b/i;
const FORMULA = /^[=+\-@\t\r]/;
const TERRITORIES = [
  ['United States', 'Americas', '005US0AE1', 'Jake Moss', '005US0SDR', 'Rosa Diaz'],
  ['Canada', 'Americas', '005US0AE1', 'Jake Moss', '005US0SDR', 'Rosa Diaz'],
  ['Germany', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['France', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['United Kingdom', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['Netherlands', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['Switzerland', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['United Arab Emirates', 'EMEA', '005EM0AE1', 'Sara Klein', '005EM0SDR', 'Luca Ferri'],
  ['Singapore', 'APJ', '005AS0AE1', 'Arjun Bose', '005AS0SDR', 'Mei Lin'],
  ['India', 'APJ', '005IN0AE1', 'Dev Rao', '005IN0SDR', 'Anika Shah'],
  ['Japan', 'APJ', '005JP0AE1', 'Kenji Mori', '005JP0SDR', 'Yui Sato'],
  ['Australia', 'APJ', '005AN0AE1', 'Lena Ward', '005AN0SDR', 'Tom Reid']
];
const SYN = {
  FullName: ['attendee', 'full name', 'attendee name', 'contact name', 'delegate name', 'contact'],
  Email: ['e mail address', 'email address', 'e mail', 'email', 'work email', 'mail'],
  Company: ['org', 'company', 'organisation', 'organization', 'account name', 'company name', 'account'],
  Title: ['job title', 'title', 'designation', 'position', 'role'],
  Phone: ['mobile', 'phone', 'telephone', 'cell', 'phone number'],
  Country: ['location (city, country)', 'location', 'country', 'where'],
  Status: ['attended?', 'attended', 'attendance', 'status'],
  Consent: ['consent', 'opt in', 'permission', 'gdpr']
};
const CITIES = { chicago: 'United States', toronto: 'Canada', berlin: 'Germany', munich: 'Germany', london: 'United Kingdom', singapore: 'Singapore', sydney: 'Australia' };
const COUNTRIES = [...new Set(TERRITORIES.map(t => t[0]))];

function db() { return current(); }
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function norm(s) { return String(s ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v).trim()); }

function score(h) {
  const n = norm(h);
  if (!n || /\bnickname\b/.test(n) || /\bbadge\b/.test(n)) return [null, 0];
  let best = [null, 0];
  for (const [key, list] of Object.entries(SYN)) {
    for (const s of list) {
      let sc = 0;
      if (n === s) sc = 1;
      else if (s.includes(' ') && n.includes(s)) sc = 0.9;
      else if (!s.includes(' ') && n.split(' ').includes(s) && s.length > 2) sc = 0.75;
      if (sc > best[1]) best = [key, sc];
    }
  }
  return best;
}

function countryOf(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const parts = s.split(/[,/|-]/).map(x => x.trim()).filter(Boolean);
  for (const p of parts.reverse()) {
    const hit = COUNTRIES.find(c => c.toLowerCase() === p.toLowerCase());
    if (hit) return hit;
  }
  for (const [city, country] of Object.entries(CITIES)) if (s.toLowerCase().includes(city)) return country;
  return '';
}

function splitName(full) {
  let s = String(full || '').trim();
  if (s.includes(',')) { const [a, b] = s.split(','); s = (b || '').trim() + ' ' + a.trim(); }
  const p = s.split(/\s+/).filter(Boolean);
  return { first: p.slice(0, -1).join(' ') || p[0] || '', last: p.length > 1 ? p[p.length - 1] : '' };
}

function mapRows(grid) {
  let headerAt = 0; let best = -1;
  grid.slice(0, 15).forEach((r, i) => {
    const s = r.reduce((a, c) => a + (score(c)[1] > 0 ? 1 : 0), 0);
    if (s > best) { best = s; headerAt = i; }
  });
  const header = grid[headerAt] || [];
  const mapping = header.map((h, i) => { const [target, confidence] = score(h); return { column: String(h || ''), index: i, target, confidence }; });
  const used = new Set();
  for (const m of [...mapping].sort((a, b) => b.confidence - a.confidence)) {
    if (!m.target) continue;
    if (used.has(m.target)) { m.target = null; m.confidence = 0; continue; }
    used.add(m.target);
  }
  const col = (t) => mapping.find(m => m.target === t);
  const get = (r, t) => { const m = col(t); return m ? String(r[m.index] ?? '').trim() : ''; };
  const accepted = []; const quarantined = []; const duplicatesHeld = [];
  const body = grid.slice(headerAt + 1).filter(r => r.some(c => String(c).trim()));
  for (const r of body) {
    const named = splitName(get(r, 'FullName'));
    const label = `${named.first} ${named.last}`.trim() || 'This row';
    if (r.some(c => { const s = String(c ?? '').trim(); return FORMULA.test(s) && !/^\+\d[\d\s().-]{6,}$/.test(s); })) {
      quarantined.push({ name: label, email: get(r, 'Email'), reason: 'formula in a cell' });
      continue;
    }
    const email = get(r, 'Email').toLowerCase();
    if (!isEmail(email)) { quarantined.push({ name: label, email, reason: 'missing email' }); continue; }
    const country = countryOf(get(r, 'Country'));
    const consent = get(r, 'Consent').trim().toLowerCase();
    const yes = /^(y|yes|true|1|opted[ _-]?in|granted|express)$/.test(consent);
    if (STRICT.has(country) && !yes) { quarantined.push({ name: label, email, reason: 'no consent' }); continue; }
    const status = /^(y|yes|true|1|attended|checked in|present)$/.test(norm(get(r, 'Status'))) ? 'Attended' : 'Registered';
    accepted.push({ first: named.first, last: named.last, email, company: get(r, 'Company'), title: get(r, 'Title'), phone: get(r, 'Phone'), country, status, consent: yes ? 'yes' : consent || 'unknown' });
  }
  const seen = new Set(); let duplicates = 0;
  const rows = [];
  for (const row of accepted) {
    if (seen.has(row.email)) {
      duplicates++;
      duplicatesHeld.push({ name: `${row.first} ${row.last}`.trim(), email: row.email, reason: 'duplicate' });
      continue;
    }
    seen.add(row.email);
    rows.push(row);
  }
  const held = quarantined.concat(duplicatesHeld);
  return { headerRow: headerAt + 1, mapping: mapping.filter(m => m.column), rows, quarantined, duplicates, held };
}

function sfid(type, externalId) {
  if (type === 'Campaign' && externalId === 'CAMP-CHI') return '7010000000CHIAA';
  const pfx = { Campaign: '701', Lead: '00Q', CampaignMember: '00v' }[type] || '001';
  return pfx + crypto.createHash('sha1').update(type + ':' + externalId).digest('hex').slice(0, 12).toUpperCase();
}

async function ensureOrg(q) {
  const n = await q.get('SELECT COUNT(*) AS n FROM territories');
  if (n.n) return;
  for (const [country, region, aeId, aeName, sdrId, sdrName] of TERRITORIES) {
    await q.run('INSERT INTO territories(country, region, ae_id, ae_name, sdr_id, sdr_name) VALUES(?,?,?,?,?,?)', [country, region, aeId, aeName, sdrId, sdrName]);
  }
}

async function ownerFor(q, row) {
  const domain = (row.email || '').split('@')[1] || '';
  const acct = domain || row.company
    ? await q.get('SELECT id, name, tier, country FROM accounts WHERE domain = ? OR lower(name) = lower(?)', [domain, row.company || ''])
    : null;
  const terr = row.country ? await q.get('SELECT * FROM territories WHERE lower(country) = lower(?)', [row.country]) : null;
  if (acct && acct.tier === 1 && terr) return { ownerId: terr.ae_id, ownerName: terr.ae_name, role: 'AE', reason: `named account ${acct.name} → ${terr.ae_name}` };
  if (!terr) return { ownerId: '', ownerName: '', role: '', unknown: true, reason: 'unknown country — flagged for a person to assign' };
  if (EXEC.test(row.title || '')) return { ownerId: terr.ae_id, ownerName: terr.ae_name, role: 'AE', reason: `territory ${terr.country} (${terr.region}) · AE` };
  return { ownerId: terr.sdr_id, ownerName: terr.sdr_name, role: 'SDR', reason: `territory ${terr.country} (${terr.region}) · SDR` };
}

const UPSERT = `INSERT INTO crm_objects(id, type, external_id, name, email, company, title, country, status, owner_id, owner_name, campaign_ext, at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(external_id) DO UPDATE SET name=excluded.name, email=excluded.email, company=excluded.company, title=excluded.title,
    country=excluded.country, status=excluded.status, owner_id=excluded.owner_id, owner_name=excluded.owner_name, campaign_ext=excluded.campaign_ext, at=excluded.at`;

async function enqueue(q, job) {
  const info = await q.run(
    'INSERT INTO crm_queue(idempotency_key, kind, external_id, payload_json, status, attempts, last_error, at) VALUES(?,?,?,?,\'pending\',0,NULL,?) ON CONFLICT(idempotency_key) DO NOTHING',
    [job.key, job.kind, job.externalId, JSON.stringify(job.payload), now()]
  );
  return info.changes ? 1 : 0;
}

async function drain(q) {
  const jobs = await q.all("SELECT * FROM crm_queue WHERE status = 'pending' ORDER BY id");
  let retried = 0;
  for (const job of jobs) {
    const payload = JSON.parse(job.payload_json);
    let attempts = job.attempts;
    if (attempts === 0 && payload.failOnce) {
      attempts = 1;
      retried++;
      await q.run('UPDATE crm_queue SET attempts = 1, last_error = ? WHERE id = ?', ['503 SERVER_UNAVAILABLE (simulated). Retrying.', job.id]);
    }
    await q.run(UPSERT, [payload.id, payload.type, job.external_id, payload.name || '', payload.email || '', payload.company || '', payload.title || '', payload.country || '', payload.status || '', payload.ownerId || '', payload.ownerName || '', payload.campaignExt || '', now()]);
    await q.run("UPDATE crm_queue SET status = 'done', attempts = ? WHERE id = ?", [attempts + 1, job.id]);
  }
  return { processed: jobs.length, retried };
}

async function upload({ filename, buffer, campaignId = 'CAMP-CHI', actor, channel, sourceMessage, idempotencyKey }) {
  const d = db();
  const key = idempotencyKey || `upload:${filename || sample.filename}:${campaignId}`;
  const prev = await d.get('SELECT * FROM crm_uploads WHERE idempotency_key = ?', [key]);
  if (prev) {
    const objects = await listObjects(prev.campaign_id || campaignId);
    let held = [];
    try { held = JSON.parse(prev.held_json || '[]'); } catch (e) { held = []; }
    return { id: prev.id, filename: prev.filename, campaignId: prev.campaign_id, accepted: prev.accepted, quarantined: prev.quarantined, duplicates: prev.duplicates, held, retried: 0, idempotent: true, objects: objects.length, owners: (await ownership(prev.campaign_id)).owners };
  }
  const campaign = await d.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) fail(404, 'Unknown campaign');
  const pin = process.env.PLATFORM_REGION || '';
  if (pin && campaign.region !== pin && campaign.region !== 'Global') fail(400, `This deployment holds ${pin} only.`);
  const buf = buffer || sample.buffer();
  const grid = readFile(filename || sample.filename, buf);
  const mapped = mapRows(grid);
  const held = mapped.rows.filter(r => r.unknown);
  let result;
  await d.tx(async (q) => {
    await ensureOrg(q);
    const owned = [];
    for (const row of mapped.rows) {
      const who = await ownerFor(q, row);
      if (who.unknown) { mapped.quarantined.push({ email: row.email, reason: who.reason }); continue; }
      owned.push({ ...row, ...who });
    }
    const id = 'UPL-' + crypto.randomBytes(3).toString('hex');
    await q.run('INSERT INTO crm_uploads(id, filename, campaign_id, idempotency_key, accepted, quarantined, duplicates, held_json, at) VALUES(?,?,?,?,?,?,?,?,?)',
      [id, filename || sample.filename, campaignId, key, owned.length, mapped.quarantined.length, mapped.duplicates, JSON.stringify(mapped.held), now()]);
    const code = await q.get("SELECT value FROM codes WHERE campaign_id = ? AND kind = 'sfdc'", [campaignId]);
    const campaignExt = campaignId;
    const campaignSf = code && code.value ? code.value : sfid('Campaign', campaignExt);
    await enqueue(q, {
      key: `crm:campaign:${campaignExt}`, kind: 'Campaign', externalId: campaignExt,
      payload: { id: campaignSf, type: 'Campaign', name: campaign.name, status: 'Planned', country: campaign.country, campaignExt, failOnce: true }
    });
    for (const row of owned) {
      const leadExt = `lead:${row.email}`;
      const memberExt = `member:${row.email}:${campaignExt}`;
      await enqueue(q, {
        key: `crm:lead:${row.email}`, kind: 'Lead', externalId: leadExt,
        payload: { id: sfid('Lead', leadExt), type: 'Lead', name: `${row.first} ${row.last}`.trim(), email: row.email, company: row.company, title: row.title, country: row.country, status: row.status, ownerId: row.ownerId, ownerName: row.ownerName, campaignExt }
      });
      await enqueue(q, {
        key: `crm:member:${row.email}:${campaignExt}`, kind: 'CampaignMember', externalId: memberExt,
        payload: { id: sfid('CampaignMember', memberExt), type: 'CampaignMember', name: `${row.first} ${row.last}`.trim(), email: row.email, company: row.company, title: row.title, country: row.country, status: row.status, ownerId: row.ownerId, ownerName: row.ownerName, campaignExt }
      });
    }
    const drained = await drain(q);
    await append(q, {
      entity: 'crm_uploads', entityId: id, op: 'insert', actor, channel, sourceMessage,
      why: `Uploaded ${filename || sample.filename} for ${campaign.name}. ${owned.length} campaign members synced. Held ${mapped.quarantined.length}.`,
      after: { accepted: owned.length, quarantined: mapped.quarantined.length, duplicates: mapped.duplicates, retried: drained.retried }
    });
    result = { id, filename: filename || sample.filename, campaignId, accepted: owned.length, quarantined: mapped.quarantined.length, duplicates: mapped.duplicates, held: mapped.held, rows: owned, retried: drained.retried, idempotent: false, skippedUnknown: held.length };
  });
  result.owners = (await ownership(campaignId)).owners;
  return result;
}

async function listObjects(campaignId) {
  const args = [];
  let where = '';
  if (campaignId) { where = ' WHERE campaign_ext = ? OR external_id = ?'; args.push(campaignId, campaignId); }
  return db().all(`SELECT id, type, external_id, name, email, company, title, country, status, owner_id, owner_name, campaign_ext FROM crm_objects${where} ORDER BY type, email, external_id`, args);
}

async function listQueue() {
  return db().all('SELECT id, idempotency_key, kind, external_id, status, attempts, last_error, at FROM crm_queue ORDER BY id');
}

async function ownerSummary(campaignId) {
  const rows = await db().all("SELECT owner_name, COUNT(*) AS n FROM crm_objects WHERE type = 'Lead' AND campaign_ext = ? GROUP BY owner_name ORDER BY owner_name", [campaignId || 'CAMP-CHI']);
  return rows;
}

async function ownership(campaignId = 'CAMP-CHI') {
  await db().tx(async (q) => { await ensureOrg(q); });
  const accounts = await db().all(`SELECT id, name, city, country, tier FROM accounts
    WHERE country = 'United States' AND city IN ('Chicago','Naperville','Aurora','Springfield','Peoria','Rockford','Joliet','Evanston')
    ORDER BY id`);
  const terr = await db().get("SELECT * FROM territories WHERE country = 'United States'");
  const members = await db().all("SELECT owner_name, COUNT(*) AS n FROM crm_objects WHERE type = 'Lead' AND campaign_ext = ? GROUP BY owner_name", [campaignId]);
  const memberOf = Object.fromEntries(members.map(r => [r.owner_name, r.n]));
  const ae = terr ? terr.ae_name : '';
  const sdr = terr ? terr.sdr_name : '';
  const owners = terr ? [
    { name: ae, role: 'AE', accounts: accounts.length, members: memberOf[ae] || 0 },
    { name: sdr, role: 'SDR', accounts: 0, members: memberOf[sdr] || 0 }
  ] : [];
  return {
    count: accounts.length,
    owners,
    owner: terr ? { id: terr.ae_id, name: ae, role: 'AE' } : null,
    sdr: terr ? { id: terr.sdr_id, name: sdr, role: 'SDR' } : null,
    accounts
  };
}

async function chicagoAccounts() { return ownership('CAMP-CHI'); }

function ownerLine(owners) {
  return (owners || []).map(o => `${o.name} (${o.role}): ${o.accounts} Chicago accounts, ${o.members} campaign members`).join('. ');
}

async function listUploads(campaignId = 'CAMP-CHI') {
  const rows = await db().all('SELECT * FROM crm_uploads WHERE campaign_id = ? ORDER BY at DESC', [campaignId]);
  return rows.map(row => {
    let held = [];
    try { held = JSON.parse(row.held_json || '[]'); } catch (e) { held = []; }
    return { id: row.id, filename: row.filename, accepted: row.accepted, quarantined: row.quarantined, duplicates: row.duplicates, held };
  });
}

async function syncCampaign({ campaignId = 'CAMP-CHI', actor, channel, sourceMessage }) {
  const d = db();
  const campaign = await d.get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) fail(404, 'Unknown campaign');
  let retried = 0; let created = 0;
  await d.tx(async (q) => {
    await ensureOrg(q);
    const code = await q.get("SELECT value FROM codes WHERE campaign_id = ? AND kind = 'sfdc'", [campaignId]);
    const id = code && code.value ? code.value : sfid('Campaign', campaignId);
    created = await enqueue(q, {
      key: `crm:campaign:${campaignId}`, kind: 'Campaign', externalId: campaignId,
      payload: { id, type: 'Campaign', name: campaign.name, status: campaign.status, country: campaign.country, campaignExt: campaignId, failOnce: true }
    });
    const drained = await drain(q);
    retried = drained.retried;
    await append(q, { entity: 'crm_objects', entityId: id, op: created ? 'insert' : 'update', actor, channel, sourceMessage, why: `Synced ${campaign.name} to Salesforce as ${id}.`, after: { id, created } });
  });
  const row = await d.get('SELECT * FROM crm_objects WHERE external_id = ?', [campaignId]);
  return { id: row.id, name: row.name, created: !!created, retried, idempotent: !created };
}

async function failures() {
  const jobs = await listQueue();
  const open = jobs.filter(j => j.status !== 'done');
  const retried = jobs.filter(j => j.status === 'done' && j.last_error);
  return { open, retried, jobs };
}

module.exports = { upload, listObjects, listQueue, listUploads, chicagoAccounts, ownership, ownerLine, syncCampaign, failures, mapRows, sample };
