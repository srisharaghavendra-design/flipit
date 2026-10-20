'use strict';

// Self-serve workspaces. Signup creates an isolated book. The demo book stays "demo".
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const catalog = require('./catalog');
const scope = require('./scope');

let transport = global.fetch ? global.fetch.bind(global) : null;
function setTransport(fn) { transport = fn; }

const CONTACT_FIELDS = [
  ['email', ['email', 'e-mail', 'email address', 'work email']],
  ['first_name', ['first', 'first name', 'firstname', 'given name']],
  ['last_name', ['last', 'last name', 'lastname', 'surname', 'family name']],
  ['title', ['title', 'job title', 'role']],
  ['company', ['company', 'account', 'account name', 'organization', 'organisation']],
  ['country', ['country']],
  ['state', ['state', 'province', 'region']],
  ['city', ['city']],
  ['consent', ['consent', 'opt in', 'opt-in', 'email consent', 'permission']]
];
const CAMPAIGN_FIELDS = [
  ['name', ['name', 'campaign', 'campaign name']],
  ['region', ['region', 'geo', 'theatre', 'theater']],
  ['program', ['program', 'channel', 'type']],
  ['owner', ['owner', 'marketer']],
  ['city', ['city']],
  ['country', ['country']],
  ['start_date', ['start', 'start date', 'starts']],
  ['end_date', ['end', 'end date', 'ends']],
  ['budget', ['budget', 'amount', 'amount usd', 'budget usd']]
];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f<>&"']/g, '').trim().slice(0, max || 80);
}

function emailOf(value) {
  const match = String(value || '').trim().toLowerCase().match(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/);
  return match ? match[0] : '';
}

function colorOf(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : '#0f6e56';
}

function slugify(name) {
  const base = clean(name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return base && base !== 'demo' ? base : 'workspace';
}

function inboundFor(slug) {
  const inbox = String(process.env.AGENTMAIL_INBOX_ID || 'northwind-mops@agentmail.to');
  const at = inbox.indexOf('@');
  const local = (at > 0 ? inbox.slice(0, at) : 'northwind-mops').split('+')[0];
  const domain = at > 0 ? inbox.slice(at + 1) : 'agentmail.to';
  return local + '+' + slug + '@' + domain;
}

function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  while (catalog.slugTaken(slug)) {
    slug = (base + '-' + n).slice(0, 28);
    n += 1;
    if (n > 40) slug = base.slice(0, 12) + '-' + crypto.randomBytes(3).toString('hex');
  }
  return slug;
}

function dirOf(id) {
  if (!/^w[a-f0-9]{16}$/.test(String(id || ''))) fail(400, 'That workspace id is not valid.');
  return path.join(require('../backend/lib').DATA, 'workspaces', id);
}

function cookieHeader(token) {
  const secure = (process.env.VERCEL || process.env.NODE_ENV === 'production') ? '; Secure' : '';
  return 'mops_company=' + encodeURIComponent(token) + '; HttpOnly; Path=/; Max-Age=28800; SameSite=Lax' + secure;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', process.env.MOPS_SESSION_SECRET || '').update(body).digest('base64url');
  return body + '.' + mac;
}

function readCookies(req) {
  const out = {};
  for (const part of String((req && req.headers && req.headers.cookie) || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readToken(token) {
  const raw = String(token || '');
  const cut = raw.lastIndexOf('.');
  if (cut <= 0) return null;
  const body = raw.slice(0, cut);
  const mac = raw.slice(cut + 1);
  const want = crypto.createHmac('sha256', process.env.MOPS_SESSION_SECRET || '').update(body).digest('base64url');
  const a = Buffer.from(want);
  const b = Buffer.from(mac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}

function viewOf(row) {
  if (!row) return null;
  const brainRole = row.role === 'approver' ? 'approver' : 'marketer';
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    role: brainRole,
    catalogRole: row.role,
    regions: ['Americas', 'EMEA', 'APJ'],
    persona: row.company || row.name,
    workspace: true,
    company: row.company,
    color: row.color,
    inbound: row.inbound,
    slug: row.slug,
    onboarded: !!row.onboarded,
    dir: dirOf(row.tenant_id)
  };
}

function sessionUser(req) {
  const data = readToken(readCookies(req).mops_company);
  if (!data || !(data.exp > Date.now()) || !data.tenantId || !data.email) return null;
  const rows = catalog.byEmail(data.email).filter(row => row.tenant_id === data.tenantId);
  return viewOf(rows[0]);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, role: user.role, regions: user.regions, persona: user.persona,
    workspace: true, company: user.company, color: user.color, inbound: user.inbound
  };
}

function bindUser(user, fn) {
  const sandbox = require('../backend/sandbox');
  return sandbox.run(user.dir, () => scope.bind({
    id: user.tenantId, name: user.company, color: user.color, inbound: user.inbound
  }, fn));
}

async function ensureDb(user) {
  fs.mkdirSync(user.dir, { recursive: true });
  return bindUser(user, async () => require('./db').open());
}

function issue(row) {
  return sign({ tenantId: row.tenant_id, email: row.email, exp: Date.now() + 8 * 60 * 60 * 1000 });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > 3_000_000) { reject(Object.assign(new Error('Request is too large'), { status: 413 })); try { req.destroy(); } catch (e) {} return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  const ct = req.headers['content-type'] || '';
  if (ct.includes('json')) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function logoOf(value) {
  const text = String(value || '');
  const match = text.match(/^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=]+)$/i);
  if (!match) return '';
  if (match[2].length > 180000) fail(413, 'The logo is too large. Use a PNG or JPEG under 120 KB.');
  return match[1].toLowerCase() + ';base64,' + match[2];
}

function headerMap(rows, spec) {
  const headers = rows.length ? Object.keys(rows[0]).map(h => String(h).trim().toLowerCase()) : [];
  const mapped = {};
  for (const [field, aliases] of spec) {
    const hit = aliases.find(alias => headers.includes(alias));
    if (hit) mapped[field] = hit;
  }
  return mapped;
}

function cell(row, mapped, field) {
  const header = mapped[field];
  if (!header) return '';
  const found = Object.keys(row).find(key => String(key).trim().toLowerCase() === header);
  return found == null ? '' : String(row[found]).trim();
}

function readTable(input) {
  const XLSX = require('xlsx');
  const book = Buffer.isBuffer(input) ? XLSX.read(input, { type: 'buffer' }) : XLSX.read(String(input || ''), { type: 'string' });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.slice(0, 5000);
}

function tableInput(body, key) {
  if (body[key + 'Base64']) return Buffer.from(String(body[key + 'Base64']), 'base64');
  if (body[key + 'Csv']) return String(body[key + 'Csv']);
  return null;
}

async function importContacts(user, input) {
  const rows = readTable(input);
  const mapped = headerMap(rows, CONTACT_FIELDS);
  if (!mapped.email) fail(400, 'The contacts file needs an email column.');
  let imported = 0;
  let skipped = 0;
  await bindUser(user, async () => {
    const db = require('./db').current();
    for (const row of rows) {
      const email = emailOf(cell(row, mapped, 'email'));
      if (!email) { skipped += 1; continue; }
      const company = clean(cell(row, mapped, 'company') || user.company, 80);
      const accountId = 'A-' + crypto.createHash('sha256').update(company.toLowerCase()).digest('hex').slice(0, 12);
      const contactId = 'C-' + crypto.createHash('sha256').update(user.tenantId + '\n' + email).digest('hex').slice(0, 12);
      const consent = /^(yes|y|true|1|opted_in|opt-in|opt in)$/i.test(cell(row, mapped, 'consent')) ? 'opted_in' : 'unknown';
      try {
        await db.run('INSERT INTO accounts(id, name, domain, region, industry, employees, tier, country, city) VALUES(?,?,?,?,?,?,?,?,?)', [
          accountId, company, company.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.example', 'Americas', 'Fictional', 50, 3,
          clean(cell(row, mapped, 'country') || 'United States', 40), clean(cell(row, mapped, 'city') || '', 40)
        ]);
      } catch (e) { /* the company is already in this workspace */ }
      try {
        await db.run('INSERT INTO contacts(id, account_id, email, first_name, last_name, title, country, state, city, fit, behavior, score, stage) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', [
          contactId, accountId, email,
          clean(cell(row, mapped, 'first_name') || 'Unknown', 40),
          clean(cell(row, mapped, 'last_name') || 'Contact', 40),
          clean(cell(row, mapped, 'title') || 'Contact', 60),
          clean(cell(row, mapped, 'country') || 'United States', 40),
          clean(cell(row, mapped, 'state') || '', 40),
          clean(cell(row, mapped, 'city') || '', 40),
          40, 0, 40, 'lead'
        ]);
        await db.run('INSERT INTO consent(id, contact_id, country, purpose, status, source, at, current) VALUES(?,?,?,?,?,?,?,1)', [
          'K-' + contactId, contactId, clean(cell(row, mapped, 'country') || 'United States', 40), 'email', consent, 'upload', new Date().toISOString()
        ]);
        imported += 1;
      } catch (e) { skipped += 1; }
    }
  });
  return { imported, skipped, mapped };
}

async function importCampaigns(user, input) {
  const rows = readTable(input);
  const mapped = headerMap(rows, CAMPAIGN_FIELDS);
  if (!mapped.name) fail(400, 'The campaigns file needs a name column.');
  let imported = 0;
  let skipped = 0;
  await bindUser(user, async () => {
    const db = require('./db').current();
    for (const row of rows) {
      const name = clean(cell(row, mapped, 'name'), 80);
      if (!name) { skipped += 1; continue; }
      const id = 'CP-' + crypto.createHash('sha256').update(user.tenantId + '\n' + name.toLowerCase()).digest('hex').slice(0, 12);
      const region = ['Americas', 'EMEA', 'APJ', 'Global'].includes(cell(row, mapped, 'region')) ? cell(row, mapped, 'region') : 'Americas';
      const amount = Math.round(Number(String(cell(row, mapped, 'budget')).replace(/[^0-9.]/g, '')) || 0);
      try {
        await db.run('INSERT INTO campaigns(id, name, region, program, status, owner, city, country, start_date, end_date) VALUES(?,?,?,?,?,?,?,?,?,?)', [
          id, name, region, clean(cell(row, mapped, 'program') || 'Events', 40), 'planned',
          clean(cell(row, mapped, 'owner') || user.name, 60),
          clean(cell(row, mapped, 'city') || '', 40),
          clean(cell(row, mapped, 'country') || 'United States', 40),
          clean(cell(row, mapped, 'start_date') || '2026-11-01', 20),
          clean(cell(row, mapped, 'end_date') || '2026-11-01', 20)
        ]);
        if (amount > 0) {
          await db.run('INSERT INTO budgets(id, campaign_id, amount_usd, currency, status, requester, approver) VALUES(?,?,?,?,?,?,?)', [
            'B-' + id, id, amount, 'USD', amount > 150000 ? 'pending' : 'draft', user.name, null
          ]);
        }
        imported += 1;
      } catch (e) { skipped += 1; }
    }
  });
  return { imported, skipped, mapped };
}

async function loadSample(user) {
  await bindUser(user, async () => {
    const database = await require('./db').open();
    await require('./seed').run(database);
  });
  catalog.markOnboarded(user.tenantId);
}

async function applyTerritories(user, list) {
  if (!Array.isArray(list) || !list.length) return;
  await bindUser(user, async () => {
    const db = require('./db').current();
    for (const row of list) {
      const country = clean(row.country, 40);
      if (!country) continue;
      const region = ['Americas', 'EMEA', 'APJ', 'Global'].includes(row.region) ? row.region : 'Americas';
      const ae = clean(row.ae || row.owner || 'Unassigned', 60);
      const sdr = clean(row.sdr || 'Unassigned', 60);
      const existing = await db.get('SELECT country FROM territories WHERE country = ?', [country]);
      if (existing) await db.run('UPDATE territories SET region = ?, ae_name = ?, sdr_name = ? WHERE country = ?', [region, ae, sdr, country]);
      else await db.run('INSERT INTO territories(country, region, ae_id, ae_name, sdr_id, sdr_name) VALUES(?,?,?,?,?,?)', [country, region, 'ae-local', ae, 'sdr-local', sdr]);
    }
  });
}

function profile(user) {
  const tenant = catalog.byId(user.tenantId);
  return {
    ok: true,
    id: user.tenantId,
    slug: tenant.slug,
    company: tenant.name,
    color: tenant.color,
    inbound: tenant.inbound,
    sendLimit: tenant.send_limit,
    approverName: tenant.approver_name || '',
    approverEmail: tenant.approver_email || '',
    webex: !!(tenant.webex_token || tenant.webex_email),
    onboarded: !!tenant.onboarded,
    members: catalog.members(user.tenantId).map(row => ({ name: row.name, email: row.email, role: row.role }))
  };
}

async function createWorkspace(body) {
  const company = clean(body.company || body.name, 40);
  const admin = clean(body.adminName || body.admin, 60);
  const email = emailOf(body.email || body.adminEmail);
  const passcode = String(body.passcode || '');
  if (!company) fail(400, 'Enter a company name.');
  if (!admin) fail(400, 'Enter the admin name.');
  if (!email) fail(400, 'Enter a valid admin email.');
  if (passcode.length < 8) fail(400, 'Use a passcode of at least 8 characters.');
  const slug = uniqueSlug(slugify(company));
  const now = new Date().toISOString();
  const tenantId = 'w' + crypto.randomBytes(8).toString('hex');
  const row = {
    id: tenantId,
    slug,
    name: company,
    color: colorOf(body.color),
    logo: logoOf(body.logo || ''),
    admin_email: email,
    inbound: inboundFor(slug),
    webex_token: null,
    webex_email: null,
    webex_secret: null,
    approver_email: null,
    approver_name: null,
    send_limit: 250,
    territory_json: '[]',
    onboarded: 0,
    created_at: now
  };
  catalog.insertTenant(row);
  const member = {
    id: 'm' + crypto.randomBytes(8).toString('hex'),
    tenant_id: tenantId,
    email,
    name: admin,
    role: 'admin',
    pass_hash: catalog.hashPass(passcode),
    created_at: now
  };
  catalog.insertMember(member);
  const user = viewOf(Object.assign({}, member, { company, color: row.color, inbound: row.inbound, slug, onboarded: 0 }));
  await ensureDb(user);
  return { user, token: issue(member) };
}

function login(email, passcode) {
  const rows = catalog.byEmail(emailOf(email));
  const hits = rows.filter(row => catalog.checkPass(passcode, row.pass_hash));
  if (!hits.length) fail(401, 'That email or passcode is not right.');
  if (hits.length > 1) fail(409, 'That email is on more than one workspace. Use the magic link.');
  return { user: viewOf(hits[0]), token: issue(hits[0]) };
}

async function sendMagic(email) {
  const rows = catalog.byEmail(emailOf(email));
  if (!rows.length) return { ok: true, sent: false };
  const row = rows[0];
  const token = crypto.randomBytes(24).toString('base64url');
  catalog.saveMagic(token, row.tenant_id, row.email);
  const origin = String(process.env.MOPS_PUBLIC_URL || process.env.MOPS_PUBLIC || '').replace(/\/$/, '');
  const link = (origin || '') + '/api/workspace/magic?token=' + encodeURIComponent(token);
  const key = String(process.env.AGENTMAIL_API_KEY || '');
  const inbox = String(process.env.AGENTMAIL_INBOX_ID || '');
  if (!key || !inbox || !transport) return { ok: true, sent: false };
  const sent = await transport('https://api.agentmail.to/v0/inboxes/' + encodeURIComponent(inbox) + '/messages/send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      to: [row.email],
      subject: 'Your ' + row.company + ' workspace link',
      text: 'Open your workspace:\n\n' + link + '\n\nThis link works once and expires in 30 minutes.\n\n— @mops'
    })
  });
  const text = sent && sent.text ? await sent.text() : '';
  return { ok: true, sent: !!(sent && sent.status >= 200 && sent.status < 300), detail: text.slice(0, 180) };
}

function consumeMagic(token) {
  const row = catalog.takeMagic(token);
  if (!row) fail(401, 'That link has expired. Request a new one.');
  const member = catalog.member(row.tenant_id, row.email);
  if (!member) fail(401, 'That link has expired. Request a new one.');
  const full = catalog.byEmail(member.email).find(item => item.tenant_id === member.tenant_id);
  return { user: viewOf(full), token: issue(full) };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
body{margin:0;background:#f3f2ef;color:#1c1b19;font:15px/1.45 ui-sans-serif,system-ui,sans-serif}
main{width:min(720px,94vw);margin:32px auto;background:#fff;border:1px solid #e6e2da;border-radius:20px;padding:28px}
h1{font-size:32px;letter-spacing:-.03em;margin:0 0 8px}
p,li{color:#5f5c55}
label{display:block;font-size:13px;margin:14px 0 6px}
input,select{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #e6e2da;font:inherit}
button{margin-top:16px;background:#171814;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:inherit;font-weight:650;cursor:pointer}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>*{flex:1;min-width:180px}
code{background:#f3f2ef;padding:2px 6px;border-radius:6px}
.err{color:#8d2a2a;min-height:1.2em}
a{color:#0f6e56}
</style><main>${body}</main>`;
}

function signupPage() {
  return page('Create a workspace', `<p>New company</p><h1>Create a workspace</h1>
<p>This takes a few minutes. Your book is separate from the sample demo and from every other company. The address below is a plus-address on the free inbox, so nothing on flipit.fyi changes.</p>
<form id="signup">
<label for="company">Company name</label><input id="company" name="company" required maxlength="40">
<label for="color">Brand color</label><input id="color" name="color" type="color" value="#0f6e56">
<label for="logo">Logo, optional PNG or JPEG</label><input id="logo" name="logo" type="file" accept="image/png,image/jpeg">
<div class="row"><div><label for="admin">Your name</label><input id="admin" name="adminName" required></div>
<div><label for="email">Email</label><input id="email" name="email" type="email" required></div></div>
<label for="passcode">Passcode</label><input id="passcode" name="passcode" type="password" minlength="8" required autocomplete="new-password">
<p class="err" id="err"></p>
<button type="submit">Create workspace</button>
</form>
<h2>Already have a workspace?</h2>
<form id="login">
<label for="login-email">Email</label><input id="login-email" type="email" required>
<label for="login-pass">Passcode</label><input id="login-pass" type="password" required>
<p class="err" id="login-err"></p>
<button type="submit">Sign in</button>
<button id="magic" type="button">Email me a link</button>
</form>
<p><a href="/">Open the sample demo</a></p>
<script>
async function post(url, body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}
document.querySelector('#signup').onsubmit=async(ev)=>{ev.preventDefault();const err=document.querySelector('#err');err.textContent='';
  try{const file=document.querySelector('#logo').files[0];let logo='';
    if(file){if(file.size>120000)throw new Error('The logo is too large.');logo=await file.arrayBuffer().then(buf=>'data:'+file.type+';base64,'+btoa(String.fromCharCode(...new Uint8Array(buf))));}
    await post('/api/signup',{company:company.value,color:color.value,logo,adminName:admin.value,email:email.value,passcode:passcode.value});
    location.href='/onboarding';
  }catch(e){err.textContent=e.message}};
document.querySelector('#login').onsubmit=async(ev)=>{ev.preventDefault();const err=document.querySelector('#login-err');err.textContent='';
  try{await post('/api/workspace/login',{email:document.querySelector('#login-email').value,passcode:document.querySelector('#login-pass').value});location.href='/'}catch(e){err.textContent=e.message}};
document.querySelector('#magic').onclick=async()=>{const err=document.querySelector('#login-err');err.textContent='';
  try{const out=await post('/api/workspace/magic',{email:document.querySelector('#login-email').value});err.textContent=out.sent?'The link is on its way.':'If that email has a workspace, and mail is configured, a link is on its way.'}catch(e){err.textContent=e.message}};
</script>`);
}

function onboardingPage(user) {
  const info = profile(user);
  return page('Set up ' + info.company, `<p>${esc(info.company)}</p><h1>Set up the workspace</h1>
<p>Four steps, under ten minutes. You can use the sample book, upload your own files, or both.</p>
<ol>
<li>Load contacts and campaigns.</li>
<li>Name the approver, the territory owners, and the send limit.</li>
<li>Invite a marketer or an approver.</li>
<li>Copy the inbox address. The Webex token is optional.</li>
</ol>
<p>Tag address: <code id="inbox">${esc(info.inbound)}</code></p>
<form id="load">
<label><input id="sample" type="checkbox" checked> Start from the sample book</label>
<label for="contacts">Contacts CSV or Excel</label><input id="contacts" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
<label for="campaigns">Campaigns CSV or Excel</label><input id="campaigns" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
<p class="err" id="load-err"></p>
<button type="submit">Load data</button>
</form>
<form id="rules">
<div class="row"><div><label for="approver">Approver name</label><input id="approver" value="${esc(info.approverName)}"></div>
<div><label for="approver-email">Approver email</label><input id="approver-email" type="email" value="${esc(info.approverEmail)}"></div></div>
<div class="row"><div><label for="limit">Send limit</label><input id="limit" type="number" min="1" value="${esc(info.sendLimit)}"></div>
<div><label for="country">Territory country</label><input id="country" value="United States"></div></div>
<div class="row"><div><label for="ae">Account owner</label><input id="ae" placeholder="AE name"></div>
<div><label for="sdr">SDR</label><input id="sdr" placeholder="SDR name"></div></div>
<label for="webex-token">Webex bot token, optional</label><input id="webex-token" type="password" autocomplete="off">
<div class="row"><div><label for="webex-email">Webex bot email</label><input id="webex-email" type="email"></div>
<div><label for="webex-secret">Webex webhook secret</label><input id="webex-secret" type="password" autocomplete="off"></div></div>
<p class="err" id="rules-err"></p>
<button type="submit">Save rules</button>
</form>
<form id="invite">
<div class="row"><div><label for="who">Teammate name</label><input id="who"></div>
<div><label for="who-email">Teammate email</label><input id="who-email" type="email"></div></div>
<label for="role">Role</label><select id="role"><option value="marketer">Marketer</option><option value="approver">Approver</option></select>
<p class="err" id="invite-err"></p>
<p id="invite-out"></p>
<button type="submit">Invite</button>
</form>
<p><a href="/">Open the desk</a> · <a href="/platform/ops">Watch ops</a></p>
<script>
async function file64(input){const f=input.files[0];if(!f)return '';const buf=await f.arrayBuffer();let s='';const bytes=new Uint8Array(buf);for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s)}
async function post(url, body){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}
document.querySelector('#load').onsubmit=async(ev)=>{ev.preventDefault();const err=document.querySelector('#load-err');err.textContent='Working…';
  try{const out=await post('/api/workspace/onboarding',{sample:document.querySelector('#sample').checked,contactsBase64:await file64(document.querySelector('#contacts')),campaignsBase64:await file64(document.querySelector('#campaigns'))});
    err.textContent='Loaded. '+(out.contacts?out.contacts.imported+' contacts. ':'')+(out.campaigns?out.campaigns.imported+' campaigns.':'');
  }catch(e){err.textContent=e.message}};
document.querySelector('#rules').onsubmit=async(ev)=>{ev.preventDefault();const err=document.querySelector('#rules-err');err.textContent='';
  try{await post('/api/workspace/settings',{approverName:approver.value,approverEmail:document.querySelector('#approver-email').value,sendLimit:Number(document.querySelector('#limit').value),territories:[{country:country.value,region:'Americas',ae:ae.value,sdr:sdr.value}],webexToken:document.querySelector('#webex-token').value,webexEmail:document.querySelector('#webex-email').value,webexSecret:document.querySelector('#webex-secret').value});
    err.textContent='Saved.';
  }catch(e){err.textContent=e.message}};
document.querySelector('#invite').onsubmit=async(ev)=>{ev.preventDefault();const err=document.querySelector('#invite-err');err.textContent='';
  try{const out=await post('/api/workspace/invite',{name:who.value,email:document.querySelector('#who-email').value,role:role.value});
    document.querySelector('#invite-out').textContent=out.email+' can sign in with passcode '+out.passcode;
  }catch(e){err.textContent=e.message}};
</script>`);
}

function send(res, code, payload, extra) {
  const headers = Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {});
  res.writeHead(code, headers);
  res.end(JSON.stringify(payload));
}

function html(res, code, body, extra) {
  res.writeHead(code, Object.assign({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, extra || {}));
  res.end(body);
}

async function http(req, res, u) {
  const method = req.method || 'GET';
  const pathname = (u.pathname || '/').replace(/\/$/, '') || '/';
  try {
    if (method === 'GET' && pathname === '/signup') return html(res, 200, signupPage());
    if (method === 'GET' && pathname === '/onboarding') {
      const user = sessionUser(req);
      if (!user) { res.writeHead(303, { location: '/signup', 'cache-control': 'no-store' }); return res.end(); }
      return html(res, 200, onboardingPage(user));
    }
    if (method === 'GET' && pathname === '/api/workspace/magic') {
      const done = consumeMagic(u.searchParams.get('token') || '');
      res.writeHead(303, { location: done.user.onboarded ? '/' : '/onboarding', 'set-cookie': cookieHeader(done.token), 'cache-control': 'no-store' });
      return res.end();
    }
    if (method === 'GET' && pathname === '/api/workspace/logo') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { ok: false, error: 'Sign in required.' });
      const tenant = catalog.byId(user.tenantId);
      const logo = tenant && tenant.logo || '';
      const match = logo.match(/^(image\/(?:png|jpeg));base64,([a-z0-9+/=]+)$/i);
      if (!match) return send(res, 404, { ok: false, error: 'No logo.' });
      const buf = Buffer.from(match[2], 'base64');
      res.writeHead(200, { 'content-type': match[1], 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
      return res.end(buf);
    }
    if (method === 'GET' && pathname === '/api/workspace') {
      const user = sessionUser(req);
      if (!user) return send(res, 401, { ok: false, error: 'Sign in required.' });
      return send(res, 200, profile(user));
    }
    if (method === 'POST' && pathname === '/api/workspace/logout') {
      return send(res, 200, { ok: true }, { 'set-cookie': 'mops_company=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' });
    }
    if (method !== 'POST') return send(res, 404, { ok: false, error: 'Not found.' });
    const body = await parseBody(req);
    if (pathname === '/api/signup') {
      const created = await createWorkspace(body);
      return send(res, 200, { ok: true, id: created.user.tenantId, slug: created.user.slug, company: created.user.company, inbound: created.user.inbound }, { 'set-cookie': cookieHeader(created.token) });
    }
    if (pathname === '/api/workspace/login') {
      const found = login(body.email, body.passcode || '');
      return send(res, 200, { ok: true, user: publicUser(found.user) }, { 'set-cookie': cookieHeader(found.token) });
    }
    if (pathname === '/api/workspace/magic') {
      const out = await sendMagic(body.email);
      return send(res, 200, out);
    }
    const user = sessionUser(req);
    if (!user) return send(res, 401, { ok: false, error: 'Sign in required.' });
    if (pathname === '/api/workspace/onboarding') {
      await ensureDb(user);
      const out = { ok: true };
      if (body.sample === true || body.sample === 'true') { await loadSample(user); out.sample = true; }
      const contacts = tableInput(body, 'contacts');
      const campaigns = tableInput(body, 'campaigns');
      if (contacts) out.contacts = await importContacts(user, contacts);
      if (campaigns) out.campaigns = await importCampaigns(user, campaigns);
      if (out.sample || out.contacts || out.campaigns) catalog.markOnboarded(user.tenantId);
      return send(res, 200, out);
    }
    if (pathname === '/api/workspace/settings') {
      const limit = Math.max(1, Math.min(100000, Number(body.sendLimit) || 250));
      const current = catalog.byId(user.tenantId);
      const token = clean(body.webexToken, 400) || current.webex_token || null;
      const secret = clean(body.webexSecret, 200) || current.webex_secret || null;
      const bot = emailOf(body.webexEmail) || current.webex_email || null;
      catalog.updateSettings(user.tenantId, {
        approver_email: emailOf(body.approverEmail) || null,
        approver_name: clean(body.approverName, 60) || null,
        send_limit: limit,
        territory_json: JSON.stringify(Array.isArray(body.territories) ? body.territories.slice(0, 40) : []),
        webex_token: token,
        webex_email: bot,
        webex_secret: secret
      });
      await applyTerritories(user, body.territories);
      return send(res, 200, profile(sessionUser(req)));
    }
    if (pathname === '/api/workspace/invite') {
      const email = emailOf(body.email);
      const name = clean(body.name, 60);
      const role = body.role === 'approver' ? 'approver' : 'marketer';
      if (!email || !name) fail(400, 'Enter the teammate name and email.');
      if (catalog.member(user.tenantId, email)) fail(409, 'That person is already in this workspace.');
      const passcode = crypto.randomBytes(9).toString('base64url');
      catalog.insertMember({
        id: 'm' + crypto.randomBytes(8).toString('hex'),
        tenant_id: user.tenantId,
        email,
        name,
        role,
        pass_hash: catalog.hashPass(passcode),
        created_at: new Date().toISOString()
      });
      return send(res, 200, { ok: true, email, name, role, passcode });
    }
    return send(res, 404, { ok: false, error: 'Not found.' });
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.message || 'The workspace request failed.' });
  }
}

module.exports = { http, sessionUser, publicUser, dirOf, setTransport, inboundFor };
