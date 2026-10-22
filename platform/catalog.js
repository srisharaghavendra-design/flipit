'use strict';

// Workspace directory. Business rows live in each workspace database.
// This file only stores who owns which workspace, and every read here
// names that workspace id except the login lookup by email.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let db;

function open() {
  if (db) return db;
  const root = require('../backend/lib').DATA;
  fs.mkdirSync(root, { recursive: true });
  db = new (require('better-sqlite3'))(path.join(root, 'catalog.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    logo TEXT,
    admin_email TEXT NOT NULL,
    inbound TEXT NOT NULL UNIQUE,
    webex_token TEXT,
    webex_email TEXT,
    webex_secret TEXT,
    approver_email TEXT,
    approver_name TEXT,
    send_limit INTEGER NOT NULL,
    territory_json TEXT NOT NULL,
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(tenant_id, email)
  );
  CREATE TABLE IF NOT EXISTS magic (
    token_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_members_tenant ON members(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);`);
  return db;
}

function hashPass(pass) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const key = crypto.scryptSync(String(pass), salt, 32).toString('base64url');
  return 'scrypt$' + salt + '$' + key;
}

function checkPass(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
  const got = crypto.scryptSync(String(pass), parts[1], 32);
  const want = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function byId(id) {
  return open().prepare('SELECT * FROM tenants WHERE id = ?').get(id) || null;
}

function bySlug(slug) {
  return open().prepare('SELECT * FROM tenants WHERE slug = ?').get(String(slug || '').toLowerCase()) || null;
}

function slugTaken(slug) {
  return !!open().prepare('SELECT id FROM tenants WHERE slug = ?').get(slug);
}

function insertTenant(row) {
  open().prepare(`INSERT INTO tenants(id, slug, name, color, logo, admin_email, inbound, webex_token, webex_email, webex_secret, approver_email, approver_name, send_limit, territory_json, onboarded, created_at)
    VALUES(@id, @slug, @name, @color, @logo, @admin_email, @inbound, @webex_token, @webex_email, @webex_secret, @approver_email, @approver_name, @send_limit, @territory_json, @onboarded, @created_at)`).run(row);
}

function insertMember(row) {
  open().prepare('INSERT INTO members(id, tenant_id, email, name, role, pass_hash, created_at) VALUES(@id, @tenant_id, @email, @name, @role, @pass_hash, @created_at)').run(row);
}

function members(tenantId) {
  return open().prepare('SELECT id, tenant_id, email, name, role, created_at FROM members WHERE tenant_id = ? ORDER BY created_at').all(tenantId);
}

function member(tenantId, email) {
  return open().prepare('SELECT * FROM members WHERE tenant_id = ? AND email = ?').get(tenantId, String(email || '').toLowerCase()) || null;
}

function byEmail(email) {
  return open().prepare(`SELECT m.id, m.tenant_id, m.email, m.name, m.role, m.pass_hash, m.created_at,
      t.slug, t.name AS company, t.color, t.inbound, t.send_limit, t.approver_email, t.approver_name,
      t.webex_token, t.webex_email, t.webex_secret, t.onboarded, t.logo, t.admin_email
    FROM members m JOIN tenants t ON t.id = m.tenant_id
    WHERE m.email = ? ORDER BY m.created_at DESC`).all(String(email || '').toLowerCase());
}

function updateSettings(id, row) {
  open().prepare(`UPDATE tenants SET approver_email = ?, approver_name = ?, send_limit = ?, territory_json = ?,
      webex_token = ?, webex_email = ?, webex_secret = ?, onboarded = 1 WHERE id = ?`).run(
    row.approver_email, row.approver_name, row.send_limit, row.territory_json,
    row.webex_token, row.webex_email, row.webex_secret, id
  );
}

function markOnboarded(id) {
  open().prepare('UPDATE tenants SET onboarded = 1 WHERE id = ?').run(id);
}

function setLogo(id, logo) {
  open().prepare('UPDATE tenants SET logo = ? WHERE id = ?').run(logo, id);
}

function limitOf(id) {
  const row = open().prepare('SELECT send_limit FROM tenants WHERE id = ?').get(id);
  return row ? Number(row.send_limit) || 0 : 0;
}

function saveMagic(token, tenantId, email) {
  open().prepare('INSERT INTO magic(token_hash, tenant_id, email, expires_at, used) VALUES(?,?,?,?,0)').run(
    tokenHash(token), tenantId, String(email).toLowerCase(), Date.now() + 30 * 60 * 1000
  );
}

function takeMagic(token) {
  const hash = tokenHash(token);
  const row = open().prepare('SELECT * FROM magic WHERE token_hash = ?').get(hash);
  if (!row || row.used || row.expires_at < Date.now()) return null;
  const info = open().prepare('UPDATE magic SET used = 1 WHERE token_hash = ? AND used = 0').run(hash);
  if (!info.changes) return null;
  return row;
}

function matchWebex(raw, sig) {
  if (!sig) return null;
  const rows = open().prepare("SELECT * FROM tenants WHERE webex_secret IS NOT NULL AND length(webex_secret) > 0").all();
  for (const row of rows) {
    const want = crypto.createHmac('sha1', row.webex_secret).update(String(raw)).digest('hex');
    if (same(want, String(sig).toLowerCase()) || same(want, sig)) return row;
  }
  return null;
}

module.exports = {
  hashPass, checkPass, byId, bySlug, slugTaken, insertTenant, insertMember, members, member, byEmail,
  updateSettings, markOnboarded, setLogo, limitOf, saveMagic, takeMagic, matchWebex
};
