// Demo sessions today. Company SSO plugs in through the same provider interface.
// Set MOPS_OIDC_* or MOPS_SAML_* and the demo picker steps aside. There is no shared passcode.
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA } = require('./lib');

const USERS = [
  { id: 'maria', name: 'Maria Alvarez', role: 'marketer', regions: ['Americas'], persona: 'Americas, Security' },
  { id: 'lukas', name: 'Lukas Berger', role: 'marketer', regions: ['EMEA'], persona: 'EMEA, Collaboration' },
  { id: 'mei', name: 'Mei Tan', role: 'marketer', regions: ['APJ'], persona: 'APJC, Networking' },
  { id: 'arjun', name: 'Arjun Shah', role: 'marketer', regions: ['APJ'], persona: 'India, Data Center' },
  { id: 'srisha', name: 'Srisha R.', role: 'marketer', regions: ['Americas', 'EMEA', 'APJ'], persona: 'Field marketing' },
  { id: 'chris', name: 'Chris M.', role: 'approver', regions: ['Americas', 'EMEA', 'APJ'], persona: 'Director, field marketing' },
  { id: 'admin', name: 'Northwind Admin', role: 'admin', regions: ['Americas', 'EMEA', 'APJ'], persona: 'Demo admin' }
];
const BY_ID = Object.fromEntries(USERS.map(u => [u.id, u]));

function secret() {
  if (process.env.MOPS_SESSION_SECRET) return process.env.MOPS_SESSION_SECRET;
  if (!secret.value) secret.value = crypto.randomBytes(32).toString('base64url');
  return secret.value;
}
function sign(id) { return crypto.createHmac('sha256', secret()).update(id).digest('base64url'); }

const db = new Database(path.join(DATA, 'auth.db'));
db.exec(`CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
)`);
const TTL = 8 * 60 * 60 * 1000;

function publicUser(u) { return u && { id: u.id, name: u.name, role: u.role, regions: u.regions, persona: u.persona }; }
function provider() {
  if (process.env.MOPS_OIDC_ISSUER && process.env.MOPS_OIDC_CLIENT_ID) return 'oidc';
  if (process.env.MOPS_SAML_ENTRY) return 'saml';
  return 'demo';
}
function oidcStart(base) {
  if (provider() !== 'oidc') return null;
  if (!process.env.MOPS_OIDC_CLIENT_SECRET) return { error: 'OIDC is selected but MOPS_OIDC_CLIENT_SECRET is not set. Refusing to start a login that cannot be verified.' };
  const state = crypto.randomBytes(16).toString('base64url');
  const url = new URL(String(process.env.MOPS_OIDC_ISSUER).replace(/\/$/, '') + '/authorize');
  url.searchParams.set('client_id', process.env.MOPS_OIDC_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.MOPS_OIDC_REDIRECT || (base + '/api/login/callback'));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  return { redirect: url.toString(), state };
}
// completeOidc is the plug-in point. It fails closed until the token endpoint returns an id_token
// whose iss matches MOPS_OIDC_ISSUER. Group names map onto marketer, approver, and admin.
async function completeOidc() {
  if (provider() !== 'oidc' || !process.env.MOPS_OIDC_CLIENT_SECRET) return { error: 'OIDC is not configured.' };
  if (!process.env.MOPS_OIDC_JWKS) return { error: 'OIDC is selected but MOPS_OIDC_JWKS is not set. Refusing an id_token whose signature cannot be checked.' };
  return { error: 'Refusing the id_token. This demo does not accept an unverified token or grant a session from it.' };
}
function samlStart() {
  if (!process.env.MOPS_SAML_ENTRY) return null;
  return { redirect: process.env.MOPS_SAML_ENTRY, note: 'SAML POST lands on /api/login/saml. The assertion is accepted only when MOPS_SAML_CERT is set.' };
}

function openSession(user) {
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(id, user.id, now, now + TTL);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  return id + '.' + sign(id);
}
function readSession(token) {
  const [id, mac] = String(token || '').split('.');
  if (!id || !mac) return null;
  const a = Buffer.from(sign(id));
  const b = Buffer.from(mac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!row || row.expires_at < Date.now()) return null;
  if (row.user_id.startsWith('oidc:')) return null;
  return BY_ID[row.user_id] || null;
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function fromRequest(req) { return readSession(cookies(req).mops_session); }
function cookieHeader(token) {
  const secure = (process.env.VERCEL || process.env.NODE_ENV === 'production') ? '; Secure' : '';
  return `mops_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${TTL / 1000}; SameSite=Lax${secure}`;
}
function regionKey(fields) {
  const g = (fields && (fields.geo || fields.region)) || '';
  if (g === 'Americas' || g === 'US') return 'Americas';
  if (g === 'EMEA') return 'EMEA';
  if (g === 'APJ' || g === 'India' || g === 'Japan' || g === 'ANZ' || g === 'ASEAN') return 'APJ';
  return g || 'APJ';
}
function inRegion(user, fields) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.regions || []).includes(regionKey(fields));
}
function canApprove(user, row) {
  if (!user || user.role !== 'approver') return 'Only a regional approver can approve spend. A marketer cannot approve it.';
  if (!inRegion(user, row.fields)) return 'This request is outside your region.';
  if (row.budget && row.budget.submittedBy && row.budget.submittedBy === user.id) return 'You cannot approve your own request.';
  return '';
}

const core = require('./core');
core.db.exec(`CREATE TABLE IF NOT EXISTS decision_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, role TEXT, region TEXT,
  action TEXT NOT NULL, object TEXT, before TEXT, after TEXT
)`);
try { core.db.exec(`CREATE TRIGGER IF NOT EXISTS decision_audit_no_update BEFORE UPDATE ON decision_audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END`); } catch (e) {}
try { core.db.exec(`CREATE TRIGGER IF NOT EXISTS decision_audit_no_delete BEFORE DELETE ON decision_audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END`); } catch (e) {}
function audit(entry) {
  core.db.prepare('INSERT INTO decision_audit(at,user_id,role,region,action,object,before,after) VALUES(?,?,?,?,?,?,?,?)')
    .run(new Date().toISOString(), entry.userId || '', entry.role || '', entry.region || '', entry.action, entry.object || '', JSON.stringify(entry.before || null), JSON.stringify(entry.after || null));
}
function auditRows(limit) { return core.db.prepare('SELECT * FROM decision_audit ORDER BY id DESC LIMIT ?').all(limit || 50); }

module.exports = { USERS, publicUser, provider, oidcStart, completeOidc, samlStart, openSession, fromRequest, cookieHeader, inRegion, canApprove, regionKey, audit, auditRows, secret };
