'use strict';

const { fitOf, behaviorOf, stageOf } = require('./score');
const { pack, INSERT } = require('./log');
const { demoDay } = require('./clock');

const CODE_RE = /^FY\d{2}Q[1-4]-(IND|JPN|ANZ|ASN|EMA|USA|GLB)-(ABM|DIG|PTR|LGN|EVT|GEN)-\d{4}$/;
const LOAD_AT = '2026-10-18T16:00:00.000Z';
const REGIONS = ['Americas', 'EMEA', 'APJ', 'Global'];
const PROGRAMS = ['ABM', 'Digital', 'Events', 'Partner', 'Lead gen'];
const PROG = { ABM: 'ABM', Digital: 'DIG', Events: 'EVT', Partner: 'PTR', 'Lead gen': 'LGN' };
const LEFT = ['Northline', 'Bright', 'Harbor', 'Silver', 'Cedar', 'Kinetic', 'Lumen', 'Paper', 'Quiet', 'Summit', 'Field', 'Glass', 'Copper', 'Orbit', 'Prairie', 'Kindred', 'Vector', 'Maple', 'Nimbus', 'Alto'];
const RIGHT = ['Metals', 'Signal', 'Circuit', 'Foods', 'Health', 'Freight', 'Labs', 'Works', 'Grid', 'Studio', 'Energy', 'Transit', 'Retail', 'Systems', 'Media', 'Logic', 'Foundry', 'Mills', 'Partners', 'Exchange'];
const INDUSTRY = ['Security', 'Manufacturing', 'Health', 'Finance', 'Energy', 'Retail', 'Transit', 'Public sector'];
const FIRST = ['Nina', 'Ava', 'Noah', 'Mia', 'Leo', 'Sofia', 'Owen', 'Hana', 'Omar', 'Priya', 'Jon', 'Ruth', 'Chloe', 'Hugo', 'Lars', 'Ana', 'Kenji', 'Nora', 'Samir', 'Leah', 'Theo', 'Amira', 'Jules', 'Idris'];
const LAST = ['Vale', 'Klein', 'Okonkwo', 'Berg', 'Sato', 'Almeida', 'Cohen', 'Petrov', 'Rahman', 'Duarte', 'Singh', 'Rossi', 'Novak', 'Costa', 'Hart', 'Nguyen', 'Ibarra', 'Vogel', 'Diallo', 'Cho', 'Moreau', 'Silva', 'Abbas', 'Keller'];
const TITLES = ['CIO', 'CISO', 'CTO', 'VP Infrastructure', 'VP Security', 'Director', 'IT Director', 'Network Manager', 'Procurement Manager'];
const PLACES = {
  Americas: [
    { country: 'United States', state: 'California', city: 'San Jose' },
    { country: 'United States', state: 'Colorado', city: 'Denver' },
    { country: 'United States', state: 'New York', city: 'New York' },
    { country: 'United States', state: 'Georgia', city: 'Atlanta' },
    { country: 'Canada', state: 'Ontario', city: 'Toronto' },
    { country: 'Mexico', state: 'CDMX', city: 'Mexico City' }
  ],
  EMEA: [
    { country: 'Germany', state: 'Bavaria', city: 'Munich' },
    { country: 'France', state: 'Ile-de-France', city: 'Paris' },
    { country: 'United Kingdom', state: 'England', city: 'London' },
    { country: 'Netherlands', state: 'North Holland', city: 'Amsterdam' },
    { country: 'United Arab Emirates', state: 'Dubai', city: 'Dubai' }
  ],
  APJ: [
    { country: 'Singapore', state: 'Singapore', city: 'Singapore' },
    { country: 'India', state: 'Karnataka', city: 'Bengaluru' },
    { country: 'Japan', state: 'Tokyo', city: 'Tokyo' },
    { country: 'Australia', state: 'New South Wales', city: 'Sydney' }
  ],
  Global: [{ country: 'United States', state: 'California', city: 'San Jose' }]
};
const OWNERS = { Americas: 'Maria Alvarez', EMEA: 'Lukas Berger', APJ: 'Mei Tan', Global: 'Srisha R.' };
const CITIES = {
  Americas: ['Austin', 'Denver', 'Toronto', 'Atlanta'],
  EMEA: ['London', 'Munich', 'Paris', 'Amsterdam'],
  APJ: ['Singapore', 'Sydney', 'Tokyo', 'Bengaluru'],
  Global: ['San Jose']
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pad(n, w) { return String(n).padStart(w, '0'); }
function slug(s) { return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function quarterOf(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  const fy = (m >= 8 ? y + 1 : y) % 100;
  const q = Math.floor(((m - 8 + 12) % 12) / 3) + 1;
  return `FY${pad(fy, 2)}Q${q}`;
}
function regionOfAccount(i) {
  if (i < 120) return 'Americas';
  if (i < 200) return 'EMEA';
  if (i < 280) return 'APJ';
  return 'Global';
}
function campaignCode(region, program, n, start) {
  const geo = region === 'Americas' ? 'USA' : region === 'EMEA' ? 'EMA' : region === 'Global' ? 'GLB' : ['IND', 'JPN', 'ANZ', 'ASN'][n % 4];
  const code = `${quarterOf(start)}-${geo}-${PROG[program]}-${pad(100 + n, 4)}`;
  if (!CODE_RE.test(code)) throw new Error('Bad campaign code ' + code);
  return code;
}

function build() {
  const rng = mulberry32(20261019);
  const accounts = [];
  const contacts = [];
  const consent = [];
  const campaigns = [];
  const events = [];
  const activities = [];
  const budgets = [];
  const sows = [];
  const codes = [];
  const logs = [];
  const note = (row) => logs.push(pack(row, row.at || LOAD_AT));

  for (let i = 0; i < 300; i++) {
    const region = regionOfAccount(i);
    let place = PLACES[region][i % PLACES[region].length];
    let employees = 200 + ((i * 137) % 4800);
    let tier = employees >= 5000 ? 1 : employees >= 1000 ? 2 : 3;
    let industry = INDUSTRY[i % INDUSTRY.length];
    if (i < 8) {
      place = { country: 'United States', state: 'Illinois', city: ['Chicago', 'Naperville', 'Aurora', 'Springfield', 'Peoria', 'Rockford', 'Joliet', 'Evanston'][i] };
      employees = 8000; tier = 1; industry = 'Security';
    } else if (i < 18) {
      place = { country: 'United States', state: 'Texas', city: 'Austin' };
      employees = 8000; tier = 1; industry = 'Security';
    }
    const name = `${LEFT[i % 20]} ${RIGHT[Math.floor(i / 20)]}`;
    const row = { id: `AC-${pad(i + 1, 3)}`, name, domain: `${slug(name)}.example`, region, industry, employees, tier, country: place.country, city: place.city, state: place.state };
    accounts.push(row);
    note({ at: LOAD_AT, entity: 'accounts', entityId: row.id, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Loaded the fictional Northwind book.', after: { name, region } });
  }

  function personName(n) {
    const first = FIRST[(n - 1) % FIRST.length];
    const lastIndex = Math.floor((n - 1) / FIRST.length) % LAST.length;
    const generation = Math.floor((n - 1) / (FIRST.length * LAST.length));
    const last = generation ? `${LAST[lastIndex]} ${generation + 1}` : LAST[lastIndex];
    return { first, last };
  }
  function addContact(n, spec) {
    const account = accounts[spec.account];
    const id = `CT-${pad(n, 5)}`;
    const named = personName(n);
    const first = spec.first || named.first;
    const last = spec.last || named.last;
    const title = spec.title;
    const email = `${slug(first)}.${slug(last)}.${n}@${account.domain}`;
    const fit = fitOf(title, account.employees, account.tier);
    const row = {
      id, account_id: account.id, email, first_name: first, last_name: last, title,
      country: spec.country || account.country, state: spec.state || account.state, city: spec.city || account.city,
      fit, behavior: 0, score: fit, stage: 'lead'
    };
    contacts.push(row);
    const status = spec.consent;
    const source = spec.source;
    const at = spec.consentAt;
    consent.push({ id: `CN-${pad(n, 5)}`, contact_id: id, country: row.country, purpose: 'email', status, source, at });
    note({ at: LOAD_AT, entity: 'contacts', entityId: id, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Loaded the fictional Northwind book.', after: { email, title, country: row.country } });
    note({ at, entity: 'consent', entityId: `CN-${pad(n, 5)}`, op: 'insert', actor: 'Seed', channel: spec.channel || 'system', sourceMessage: source, why: `Recorded ${status} consent for ${row.country} from ${source}.`, after: { status, country: row.country, source, at } });
    return row;
  }

  let n = 1;
  for (let i = 0; i < 30; i++, n++) addContact(n, { account: i % 8, title: 'CIO', consent: 'opted_in', source: 'Event form', consentAt: '2026-09-02T15:00:00.000Z', channel: 'App' });
  for (let i = 0; i < 8; i++, n++) addContact(n, { account: i % 8, title: 'CIO', consent: 'opted_out', source: 'Preference center', consentAt: '2026-08-01T15:00:00.000Z' });
  for (let i = 0; i < 6; i++, n++) addContact(n, { account: i % 8, title: 'VP Infrastructure', consent: 'opted_in', source: 'Event form', consentAt: '2026-09-02T15:00:00.000Z' });
  for (let i = 0; i < 15; i++, n++) addContact(n, { account: 120 + (i % 5), title: 'Director', country: 'Germany', state: 'Berlin', city: 'Berlin', consent: 'unknown', source: 'Imported from the field list', consentAt: '2026-06-01T15:00:00.000Z' });
  for (let i = 0; i < 10; i++, n++) addContact(n, { account: 8 + i, title: 'CIO', consent: 'opted_in', source: 'Event form', consentAt: '2026-09-02T15:00:00.000Z' });
  const historyStart = n;
  for (let i = 0; i < 20; i++, n++) addContact(n, { account: 18 + i, title: 'Network Manager', consent: 'opted_in', source: 'Preference center', consentAt: '2026-07-15T15:00:00.000Z' });
  while (n <= 5000) {
    const account = 40 + ((n * 17) % 260);
    addContact(n, {
      account, title: TITLES[n % TITLES.length],
      consent: rng() > 0.92 ? 'opted_out' : rng() > 0.8 ? 'unknown' : 'opted_in',
      source: 'Preference center', consentAt: '2026-06-15T15:00:00.000Z'
    });
    n++;
  }
  if (contacts.length !== 5000) throw new Error('Expected 5000 contacts, got ' + contacts.length);

  const dates = ['2026-08-15', '2026-11-12', '2026-03-19'];
  const usedNames = new Set(['chicago security roundtable']);
  function campaignTitle(city, program, start) {
    const base = `${city} ${program}`;
    if (!usedNames.has(base.toLowerCase())) { usedNames.add(base.toLowerCase()); return base; }
    const quarter = `${base} ${quarterOf(start)}`;
    if (!usedNames.has(quarter.toLowerCase())) { usedNames.add(quarter.toLowerCase()); return quarter; }
    let n = 2;
    while (usedNames.has(`${base} ${n}`.toLowerCase())) n += 1;
    const next = `${base} ${n}`;
    usedNames.add(next.toLowerCase());
    return next;
  }
  campaigns.push({ id: 'CAMP-CHI', name: 'Chicago security roundtable', region: 'Americas', program: 'Events', status: 'Live', owner: 'Maria Alvarez', city: 'Chicago', country: 'United States', start_date: '2026-03-18', end_date: '2026-03-19' });
  const cityN = {};
  for (let i = 2; i <= 40; i++) {
    const region = REGIONS[(i - 2) % 4];
    const program = PROGRAMS[(i - 2) % 5];
    const start = dates[(i - 2) % 3];
    const cities = CITIES[region];
    const n = cityN[region] || 0;
    cityN[region] = n + 1;
    const city = cities[n % cities.length];
    campaigns.push({ id: `CP-${pad(i, 2)}`, name: campaignTitle(city, program, start), region, program, status: i % 5 === 0 ? 'Planned' : 'Live', owner: OWNERS[region], city, country: region === 'EMEA' ? 'Germany' : region === 'APJ' ? 'Singapore' : 'United States', start_date: start, end_date: start });
  }

  let act = 1;
  const addAct = (contactId, campaignId, kind, at) => {
    const id = `ACT-${pad(act++, 6)}`;
    activities.push({ id, contact_id: contactId, campaign_id: campaignId, event_id: null, kind, at, ref: 'seed' });
    const campaignName = (campaigns.find(c => c.id === campaignId) || {}).name || campaignId;
    note({ at, entity: 'activities', entityId: id, op: 'insert', actor: 'Seed', channel: 'Email', sourceMessage: 'seed', why: `Recorded a ${kind} on ${campaignName}.`, after: { kind, campaignId, campaign: campaignName } });
  };
  for (let i = 0; i < 30; i++) addAct(contacts[i].id, 'CP-02', 'open', '2026-10-02T15:00:00.000Z');
  for (let i = 38; i < 44; i++) addAct(contacts[i].id, 'CP-02', 'open', '2026-10-02T15:00:00.000Z');
  for (let i = 59; i < 69; i++) addAct(contacts[i].id, 'CP-02', 'click', '2026-09-20T15:00:00.000Z');
  for (let i = 89; i < 99; i++) addAct(contacts[i].id, 'CP-03', 'open', '2026-07-01T15:00:00.000Z');

  const byKind = new Map();
  for (const a of activities) {
    if (!byKind.has(a.contact_id)) byKind.set(a.contact_id, []);
    byKind.get(a.contact_id).push(a.kind);
  }
  const scoreUpdates = [];
  for (const c of contacts) {
    const b = behaviorOf(byKind.get(c.id) || []);
    const score = c.fit + b;
    const stage = stageOf(score);
    c.behavior = b; c.score = score; c.stage = stage;
    if (b > 0) {
      scoreUpdates.push([b, score, stage, c.id]);
      note({ at: LOAD_AT, entity: 'contacts', entityId: c.id, op: 'update', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Scored from title, account size, and activity already on the book.', before: { score: c.fit, stage: 'lead' }, after: { score, stage } });
    }
  }

  for (const c of campaigns) {
    const finalStart = c.id === 'CAMP-CHI' ? '2026-03-19' : c.start_date;
    const code = c.id === 'CAMP-CHI' ? campaignCode('Americas', 'Events', 1, '2026-03-19') : campaignCode(c.region, c.program, Number(c.id.slice(3)), finalStart);
    codes.push({ id: `COD-${c.id}-C`, campaign_id: c.id, kind: 'campaign', value: code });
    const amount = c.id === 'CAMP-CHI' ? 180000 : 25000 + (campaigns.indexOf(c) * 1000);
    budgets.push({ id: c.id === 'CAMP-CHI' ? 'BDG-CHI' : `BDG-${c.id}`, campaign_id: c.id, amount_usd: amount, currency: 'USD', status: c.id === 'CAMP-CHI' ? 'approved' : 'recorded', requester: c.owner, approver: c.id === 'CAMP-CHI' ? 'Chris M.' : '' });
    sows.push({ id: c.id === 'CAMP-CHI' ? 'SOW-CHI' : `SOW-${c.id}`, campaign_id: c.id, vendor: c.region === 'Americas' ? 'Harbor North' : c.region === 'APJ' ? 'Bright Harbour' : 'Field and Co', venue: c.id === 'CAMP-CHI' ? 'River North Club' : 'To be confirmed', status: 'draft', summary: `${c.name} with ${c.owner}.` });
    if (c.program === 'Events') {
      const eventSlug = c.id === 'CAMP-CHI' ? 'chicago' : 'event-' + slug(c.id);
      events.push({ id: c.id === 'CAMP-CHI' ? 'EV-CHI' : `EV-${c.id}`, campaign_id: c.id, name: c.name, slug: eventSlug, city: c.city, capacity: c.id === 'CAMP-CHI' ? 40 : 80, starts_at: `${finalStart}T15:00:00.000Z` });
    }
    note({ at: LOAD_AT, entity: 'campaigns', entityId: c.id, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Loaded the fictional Northwind book.', after: { name: c.name, region: c.region } });
    note({ at: LOAD_AT, entity: 'codes', entityId: `COD-${c.id}-C`, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Minted the campaign code from the region, program, and quarter.', after: { value: code } });
    const budgetWhy = c.id === 'CAMP-CHI' ? 'Approved $180,000 because Chris M. approved it in the app.' : 'Loaded the fictional Northwind book.';
    note({ at: LOAD_AT, entity: 'budgets', entityId: c.id === 'CAMP-CHI' ? 'BDG-CHI' : `BDG-${c.id}`, op: 'insert', actor: c.id === 'CAMP-CHI' ? 'Chris M.' : 'Seed', channel: c.id === 'CAMP-CHI' ? 'App' : 'system', sourceMessage: c.id === 'CAMP-CHI' ? 'APP-CHRIS-BUDGET' : 'seed', why: budgetWhy, after: { amount_usd: amount, status: c.id === 'CAMP-CHI' ? 'approved' : 'recorded' } });
    note({ at: LOAD_AT, entity: 'sows', entityId: c.id === 'CAMP-CHI' ? 'SOW-CHI' : `SOW-${c.id}`, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Loaded the fictional Northwind book.', after: { vendor: c.region === 'Americas' ? 'Harbor North' : 'Field and Co' } });
  }
  codes.push(
    { id: 'COD-CHI-BAN', campaign_id: 'CAMP-CHI', kind: 'ban', value: 'BAN-FY26Q3-4100-0001' },
    { id: 'COD-CHI-SFDC', campaign_id: 'CAMP-CHI', kind: 'sfdc', value: '7010000000CHIAA' },
    { id: 'COD-CHI-EV', campaign_id: 'CAMP-CHI', kind: 'event', value: 'EV-CHI-001' }
  );
  for (const row of codes.slice(-3)) note({ at: LOAD_AT, entity: 'codes', entityId: row.id, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed', why: 'Loaded the fictional Northwind book.', after: { kind: row.kind, value: row.value } });

  const history = contacts.slice(historyStart - 1, historyStart - 1 + 20);
  const recipients = history.map((c, i) => ({ token: `tok-${c.id}`, contact_id: c.id, email: c.email, opened: i < 8 ? 1 : 0, clicked: i < 3 ? 1 : 0 }));
  for (let i = 0; i < recipients.length; i++) {
    addAct(recipients[i].contact_id, 'CP-02', 'send', '2026-10-05T14:00:00.000Z');
    if (recipients[i].opened) addAct(recipients[i].contact_id, 'CP-02', 'open', '2026-10-05T15:00:00.000Z');
    if (recipients[i].clicked) addAct(recipients[i].contact_id, 'CP-02', 'click', '2026-10-05T16:00:00.000Z');
  }
  // History activities were added after the first score pass. Recompute those contacts.
  for (const c of history) {
    const kinds = activities.filter(a => a.contact_id === c.id).map(a => a.kind);
    const b = behaviorOf(kinds);
    const score = c.fit + b;
    const stage = stageOf(score);
    c.behavior = b; c.score = score; c.stage = stage;
    const existing = scoreUpdates.find(u => u[3] === c.id);
    if (existing) { existing[0] = b; existing[1] = score; existing[2] = stage; }
    else scoreUpdates.push([b, score, stage, c.id]);
  }

  const illinoisReady = contacts.filter(c => c.state === 'Illinois' && c.title === 'CIO' && c.score === 58);
  if (illinoisReady.length !== 30) throw new Error('Illinois CIO cohort is ' + illinoisReady.length);
  const texasMql = contacts.filter(c => c.state === 'Texas' && c.title === 'CIO' && c.stage === 'mql');
  if (texasMql.length !== 10) throw new Error('Texas MQL cohort is ' + texasMql.length);
  const full = contacts.map(c => c.first_name + ' ' + c.last_name);
  if (new Set(full).size !== full.length) throw new Error('A contact name is used twice');
  const illinoisNames = new Set(contacts.filter(c => c.state === 'Illinois').map(c => c.first_name + ' ' + c.last_name));
  for (const c of contacts) if (c.state === 'Texas' && illinoisNames.has(c.first_name + ' ' + c.last_name)) throw new Error(c.first_name + ' ' + c.last_name + ' is in two states');
  return { accounts, contacts, consent, campaigns, events, activities, budgets, sows, codes, logs, scoreUpdates, recipients, historyStart };
}

const SQL = {
  account: 'INSERT INTO accounts(id, name, domain, region, industry, employees, tier, country, city) VALUES(?,?,?,?,?,?,?,?,?)',
  contact: 'INSERT INTO contacts(id, account_id, email, first_name, last_name, title, country, state, city, fit, behavior, score, stage) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  consent: 'INSERT INTO consent(id, contact_id, country, purpose, status, source, at, current) VALUES(?,?,?,?,?,?,?,1)',
  campaign: 'INSERT INTO campaigns(id, name, region, program, status, owner, city, country, start_date, end_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
  event: 'INSERT INTO events(id, campaign_id, name, slug, city, capacity, starts_at) VALUES(?,?,?,?,?,?,?)',
  activity: 'INSERT INTO activities(id, contact_id, campaign_id, event_id, kind, at, ref) VALUES(?,?,?,?,?,?,?)',
  budget: 'INSERT INTO budgets(id, campaign_id, amount_usd, currency, status, requester, approver) VALUES(?,?,?,?,?,?,?)',
  sow: 'INSERT INTO sows(id, campaign_id, vendor, venue, status, summary) VALUES(?,?,?,?,?,?)',
  code: 'INSERT INTO codes(id, campaign_id, kind, value) VALUES(?,?,?,?)',
  score: 'UPDATE contacts SET behavior=?, score=?, stage=? WHERE id=?'
};

const SEED_VERSION = 5;
const ENVELOPES = [['Americas', 2400000], ['EMEA', 1800000], ['APJ', 1600000], ['Global', 900000]];

function rows(list, cols) { return list.map(r => cols.map(k => r[k])); }

function targetFor(campaignId, pipeline) {
  if (campaignId === 'CAMP-CHI') return 800000;
  return Math.round((pipeline || 0) * 1.25) || 100000;
}

async function wipe(database) {
  if (database.dialect === 'postgres') return;
  await database.exec('PRAGMA foreign_keys = OFF');
  const tables = await database.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'");
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/i.test(table.name)) continue;
    await database.run('DELETE FROM ' + table.name);
  }
  await database.exec('PRAGMA foreign_keys = ON');
}

async function backfillActuals(database) {
  const n = await database.get('SELECT COUNT(*) AS n FROM actuals');
  if (n && n.n) return;
  const budgetRows = await database.all('SELECT campaign_id, amount_usd FROM budgets');
  const regionRows = await database.all('SELECT id, region FROM campaigns');
  const regionOf = new Map(regionRows.map(r => [r.id, r.region]));
  await database.tx(async (q) => {
    for (const b of budgetRows) {
      const actual = b.campaign_id === 'CAMP-CHI' ? 42000 : Math.round(b.amount_usd * 0.4);
      const pipe = b.campaign_id === 'CAMP-CHI' ? 640000 : (regionOf.get(b.campaign_id) === 'Americas' ? 120000 : 80000);
      await q.run('INSERT INTO actuals(id, campaign_id, amount_usd, note) VALUES(?,?,?,?)', ['ACTL-' + b.campaign_id, b.campaign_id, actual, 'Seeded from the fictional book']);
      await q.run('UPDATE campaigns SET pipeline_usd = ?, pipeline_target_usd = ? WHERE id = ?', [pipe, targetFor(b.campaign_id, pipe), b.campaign_id]);
    }
  });
}

async function run(database) {
  const existing = await database.get("SELECT v FROM platform_meta WHERE k='seeded'");
  if (existing) {
    let stats = {};
    try { stats = JSON.parse(existing.v); } catch (e) { stats = {}; }
    if (stats.version === SEED_VERSION) {
      await backfillActuals(database);
      await backfillTargets(database);
      return stats;
    }
    await wipe(database);
  }
  const t0 = Date.now();
  const book = build();
  const stats = await database.tx(async (q) => {
    await q.insertMany(SQL.account, rows(book.accounts, ['id', 'name', 'domain', 'region', 'industry', 'employees', 'tier', 'country', 'city']));
    await q.insertMany(SQL.contact, rows(book.contacts, ['id', 'account_id', 'email', 'first_name', 'last_name', 'title', 'country', 'state', 'city', 'fit', 'behavior', 'score', 'stage']));
    await q.insertMany(SQL.consent, rows(book.consent, ['id', 'contact_id', 'country', 'purpose', 'status', 'source', 'at']));
    await q.insertMany(SQL.campaign, rows(book.campaigns, ['id', 'name', 'region', 'program', 'status', 'owner', 'city', 'country', 'start_date', 'end_date']));
    await q.insertMany(SQL.event, rows(book.events, ['id', 'campaign_id', 'name', 'slug', 'city', 'capacity', 'starts_at']));
    await q.insertMany(SQL.activity, rows(book.activities, ['id', 'contact_id', 'campaign_id', 'event_id', 'kind', 'at', 'ref']));
    await q.insertMany(SQL.budget, rows(book.budgets, ['id', 'campaign_id', 'amount_usd', 'currency', 'status', 'requester', 'approver']));
    await q.insertMany(SQL.sow, rows(book.sows, ['id', 'campaign_id', 'vendor', 'venue', 'status', 'summary']));
    await q.insertMany(SQL.code, rows(book.codes, ['id', 'campaign_id', 'kind', 'value']));
    await q.insertMany(INSERT, book.logs);
    const budgetRows = await q.all('SELECT campaign_id, amount_usd FROM budgets');
    const regionRows = await q.all('SELECT id, region FROM campaigns');
    const regionOf = new Map(regionRows.map(r => [r.id, r.region]));
    for (const b of budgetRows) {
      const actual = b.campaign_id === 'CAMP-CHI' ? 42000 : Math.round(b.amount_usd * 0.4);
      const pipe = b.campaign_id === 'CAMP-CHI' ? 640000 : (regionOf.get(b.campaign_id) === 'Americas' ? 120000 : 80000);
      await q.run('INSERT INTO actuals(id, campaign_id, amount_usd, note) VALUES(?,?,?,?)', ['ACTL-' + b.campaign_id, b.campaign_id, actual, 'Seeded from the fictional book']);
      await q.run('UPDATE campaigns SET pipeline_usd = ?, pipeline_target_usd = ? WHERE id = ?', [pipe, targetFor(b.campaign_id, pipe), b.campaign_id]);
      await q.run(INSERT, pack({
        at: LOAD_AT, entity: 'actuals', entityId: 'ACTL-' + b.campaign_id, op: 'insert', actor: 'Seed', channel: 'system', sourceMessage: 'seed',
        why: `Recorded $${actual.toLocaleString('en-US')} of actuals against the budget.`,
        after: { amount_usd: actual, pipeline_usd: pipe }
      }));
    }
    if (book.scoreUpdates.length) await q.insertMany(SQL.score, book.scoreUpdates);

    await q.run('UPDATE campaigns SET start_date=? WHERE id=?', ['2026-03-19', 'CAMP-CHI']);
    await q.run(INSERT, pack({
      at: '2026-10-18T16:05:00.000Z', entity: 'campaigns', entityId: 'CAMP-CHI', op: 'update',
      actor: 'Jordan Hale', channel: 'Email', sourceMessage: 'EM-JH-1014',
      why: "Moved the event to 19 Mar because Jordan Hale's email on 14 Oct said the venue changed.",
      before: { start_date: '2026-03-18', venue: 'River North Club' },
      after: { start_date: '2026-03-19', venue: 'River North Club, Salon B' }
    }));
    await q.run('UPDATE sows SET venue=? WHERE id=?', ['River North Club, Salon B', 'SOW-CHI']);
    await q.run(INSERT, pack({
      at: '2026-10-18T16:05:01.000Z', entity: 'sows', entityId: 'SOW-CHI', op: 'update',
      actor: 'Jordan Hale', channel: 'Email', sourceMessage: 'EM-JH-1014',
      why: "Moved the event to 19 Mar because Jordan Hale's email on 14 Oct said the venue changed.",
      before: { venue: 'River North Club' }, after: { venue: 'River North Club, Salon B' }
    }));
    await q.run('UPDATE campaigns SET owner=? WHERE id=?', ['Rosa Diaz', 'CAMP-CHI']);
    await q.run(INSERT, pack({
      at: '2026-10-18T16:06:00.000Z', entity: 'campaigns', entityId: 'CAMP-CHI', op: 'update',
      actor: 'Maria Alvarez', channel: 'Webex', sourceMessage: 'WX-CHI-ROSA',
      why: 'Set the campaign owner to Rosa Diaz, assigned by the SDR rule. She does not own the Chicago accounts.',
      before: { owner: 'Maria Alvarez' }, after: { owner: 'Rosa Diaz' }
    }));

    const created = '2026-10-18T16:07:00.000Z';
    await q.run('INSERT INTO templates(id, name, subject, html, created_at) VALUES(?,?,?,?,?)', ['TPL-CHI', 'Chicago invite', 'You are invited: Chicago security roundtable', '<p>Hi {{first}},</p><p>{{company}} is invited to {{campaign}} in {{city}}.</p><p><a href="{{link}}">Reserve a seat</a></p>', created]);
    await q.run('INSERT INTO templates(id, name, subject, html, created_at) VALUES(?,?,?,?,?)', ['TPL-N1', 'Chicago reminder', 'Still open: Chicago security roundtable', '<p>Hi {{first}},</p><p>You looked at {{campaign}}. The room in {{city}} is still open.</p><p><a href="{{link}}">Reserve a seat</a></p>', created]);
    await q.run('INSERT INTO templates(id, name, subject, html, created_at) VALUES(?,?,?,?,?)', ['TPL-N2', 'Chicago last call', 'Last call for the Chicago security roundtable', '<p>Hi {{first}},</p><p>Last call for {{company}}. The Chicago security roundtable is in {{city}} on 19 March.</p>', created]);
    await q.run('INSERT INTO pages(id, slug, campaign_id, event_id, title) VALUES(?,?,?,?,?)', ['PG-CHI', 'chicago', 'CAMP-CHI', 'EV-CHI', 'Chicago security roundtable']);
    await q.run('INSERT INTO journeys(id, name, campaign_id, steps_json) VALUES(?,?,?,?)', ['J-CHI', 'Chicago nurture', 'CAMP-CHI', JSON.stringify([
      { type: 'send', templateId: 'TPL-N1', delayHours: 0 },
      { type: 'wait', hours: 48 },
      { type: 'send', templateId: 'TPL-N2', delayHours: 0, if: 'not_registered' }
    ])]);
    const apjRules = { all: [{ field: 'account.region', op: 'eq', value: 'APJ' }, { field: 'contact.title', op: 'contains', value: 'Director' }, { field: 'consent.status', op: 'eq', value: 'opted_in' }] };
    await q.run('INSERT INTO segments(id, name, rules_json, created_at) VALUES(?,?,?,?)', ['SEG-APJ-DIR', 'APJ directors who opted in', JSON.stringify(apjRules), created]);
    await q.run('INSERT INTO segments(id, name, rules_json, created_at) VALUES(?,?,?,?)', ['SEG-SEP', 'September brief list', JSON.stringify({ all: [{ field: 'contact.title', op: 'eq', value: 'Network Manager' }] }), created]);
    await q.run('INSERT INTO sends(id, segment_id, template_id, campaign_id, idempotency_key, actor, channel, source_message, sent, held, at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ['SND-SEP', 'SEG-SEP', 'TPL-CHI', 'CP-02', 'seed:september-brief', 'Mei Tan', 'App', 'September product brief', book.recipients.length, 0, '2026-10-05T14:00:00.000Z']);
    await q.insertMany('INSERT INTO send_recipients(token, send_id, contact_id, email, opened, clicked, mail_id) VALUES(?,?,?,?,?,?,NULL)',
      book.recipients.map(r => [r.token, 'SND-SEP', r.contact_id, r.email, r.opened, r.clicked]));

    for (const [region, amount] of ENVELOPES) {
      await q.run('INSERT INTO envelopes(region, amount_usd) VALUES(?,?) ON CONFLICT(region) DO NOTHING', [region, amount]);
    }
    const stats = { version: SEED_VERSION, accounts: book.accounts.length, contacts: book.contacts.length, campaigns: book.campaigns.length, regions: REGIONS, demoDay: demoDay(), ms: Date.now() - t0 };
    await q.run('INSERT INTO platform_meta(k, v) VALUES(?,?)', ['seeded', JSON.stringify(stats)]);
    return stats;
  });
  stats.ms = Date.now() - t0;
  console.log(`platform seed ${stats.ms}ms · ${stats.contacts} contacts · ${stats.accounts} accounts · ${stats.campaigns} campaigns`);
  return stats;
}

async function backfillTargets(database) {
  const n = await database.get('SELECT COUNT(*) AS n FROM campaigns WHERE pipeline_target_usd > 0');
  if (n && n.n) return;
  const rows = await database.all('SELECT id, pipeline_usd FROM campaigns');
  await database.tx(async (q) => {
    for (const row of rows) await q.run('UPDATE campaigns SET pipeline_target_usd = ? WHERE id = ?', [targetFor(row.id, row.pipeline_usd), row.id]);
  });
}

async function reset(database) {
  await wipe(database);
  return run(database);
}

module.exports = { run, reset, CODE_RE, quarterOf, REGIONS, campaignCode, SEED_VERSION };
