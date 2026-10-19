// Client-carried demo state. Any instance rebuilds this browser's lifecycle, BAN ids,
// budget ledger, and trace from the signed blob. Seed tables stay on the instance.
const crypto = require('crypto');
const zlib = require('zlib');

function mac(body) {
  return crypto.createHmac('sha256', process.env.MOPS_SESSION_SECRET || '').update(body).digest('base64url');
}
let appliedSig = '';
function sigOf(token) { const raw = String(token || ''); const cut = raw.lastIndexOf('.'); return cut > 0 ? raw.slice(cut + 1) : ''; }
function currentSig() { return appliedSig; }
function remember(token) { appliedSig = sigOf(token); }
function core() { return require('./core'); }
function ensureTables() {
  const db = core().db;
  db.exec(`CREATE TABLE IF NOT EXISTS budget_ledger(
    lifecycle_id TEXT PRIMARY KEY, currency TEXT, amount REAL, usd REAL, status TEXT, route TEXT, approver TEXT, at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sow_docs(
    lifecycle_id TEXT PRIMARY KEY, status TEXT, signed_by TEXT, agency TEXT, at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS ban_ids(ban TEXT PRIMARY KEY, lifecycle_id TEXT UNIQUE, n INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS trace_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, service TEXT, name TEXT, ms INTEGER, status TEXT,
    request TEXT, response TEXT, rows TEXT
  )`);
}
function slimPayload(payload) {
  let row;
  try { row = JSON.parse(payload); } catch (e) { return payload; }
  if (row.sow) delete row.sow.html;
  if (row.setup) {
    const s = row.setup;
    if (s.email && s.email.body) s.email = { status: s.email.status, subject: s.email.subject };
    if (s.uploadPreview) {
      if (!(s.mapping && s.mapping.confirmed)) delete s.uploadPreview.errorCsv;
      if (Array.isArray(s.uploadPreview.preview)) s.uploadPreview.preview = s.uploadPreview.preview.slice(0, 3);
      if (s.uploadPreview.report && Array.isArray(s.uploadPreview.report.rows)) s.uploadPreview.report.rows = s.uploadPreview.report.rows.slice(0, 8);
    }
    if (s.mapping && s.mapping.confirmed && s.uploadFile) { delete s.uploadFile.text; delete s.uploadFile.base64; }
    else if (s.uploadFile && s.uploadFile.text) delete s.uploadFile.base64;
  }
  if (Array.isArray(row.log)) row.log = row.log.slice(-4);
  return JSON.stringify(row);
}
function exportLog() {
  ensureTables();
  const db = core().db;
  const rows = db.prepare("SELECT id,step,payload,at FROM lifecycle WHERE id!='LC-DEMO' ORDER BY at").all().slice(-12).map(r => ({ id: r.id, step: r.step, at: r.at, payload: slimPayload(r.payload) }));
  let bans = [], ledger = [], sows = [], audit = [], traces = [];
  try { bans = db.prepare('SELECT ban, lifecycle_id, n FROM ban_ids').all(); } catch (e) {}
  try { ledger = db.prepare('SELECT * FROM budget_ledger').all(); } catch (e) {}
  try { sows = db.prepare('SELECT * FROM sow_docs').all(); } catch (e) {}
  try { audit = db.prepare('SELECT at,user_id,role,region,action,object,before,after,prev_hash,hash FROM decision_audit ORDER BY id DESC LIMIT 20').all().reverse(); } catch (e) {}
  try { traces = db.prepare('SELECT at,service,name,ms,status,request,response,rows FROM trace_log ORDER BY id DESC LIMIT 12').all().reverse().map(t => ({ at: t.at, service: t.service, name: t.name, ms: t.ms, status: t.status, request: t.request || '', response: t.response || '', rows: t.rows || '' })); } catch (e) {}
  const body = zlib.deflateRawSync(Buffer.from(JSON.stringify({ v: 1, rows, bans, ledger, sows, audit, traces }))).toString('base64url');
  return body + '.' + mac(body);
}
function verify(token) {
  if (token == null || token === '' || token === '0') return { v: 1, rows: [], bans: [], ledger: [], sows: [], audit: [], traces: [] };
  const raw = String(token);
  const cut = raw.lastIndexOf('.');
  if (cut <= 0) return null;
  const body = raw.slice(0, cut), sig = raw.slice(cut + 1);
  const a = Buffer.from(mac(body)), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(zlib.inflateRawSync(Buffer.from(body, 'base64url')).toString('utf8')); } catch (e) { return null; }
  if (!data || data.v !== 1 || !Array.isArray(data.rows)) return null;
  return data;
}
function apply(token) {
  const data = verify(token) || { v: 1, rows: [], bans: [], ledger: [], sows: [], audit: [], traces: [] };
  ensureTables();
  const db = core().db;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM lifecycle WHERE id!='LC-DEMO'").run();
    const ins = db.prepare('INSERT INTO lifecycle(id,step,payload,at,updated_at) VALUES(?,?,?,?,?)');
    for (const r of data.rows) {
      if (!r || !/^LC-[\w]+$/.test(r.id) || r.id === 'LC-DEMO') continue;
      const payload = typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload);
      ins.run(r.id, String(r.step || '').slice(0, 40), payload, r.at || new Date().toISOString(), r.at || new Date().toISOString());
    }
    db.prepare('DELETE FROM ban_ids').run();
    const ban = db.prepare('INSERT INTO ban_ids(ban, lifecycle_id, n) VALUES(?,?,?)');
    for (const x of data.bans || []) {
      if (!x || !x.ban || !x.lifecycle_id) continue;
      ban.run(String(x.ban).slice(0, 80), String(x.lifecycle_id).slice(0, 40), +x.n || 0);
    }
    db.prepare('DELETE FROM budget_ledger').run();
    const led = db.prepare('INSERT INTO budget_ledger(lifecycle_id,currency,amount,usd,status,route,approver,at) VALUES(?,?,?,?,?,?,?,?)');
    for (const x of data.ledger || []) {
      if (!x || !x.lifecycle_id) continue;
      led.run(String(x.lifecycle_id).slice(0, 40), x.currency || '', +x.amount || 0, +x.usd || 0, x.status || '', x.route || '', x.approver || '', x.at || '');
    }
    db.prepare('DELETE FROM sow_docs').run();
    const sow = db.prepare('INSERT INTO sow_docs(lifecycle_id,status,signed_by,agency,at) VALUES(?,?,?,?,?)');
    for (const x of data.sows || []) {
      if (!x || !x.lifecycle_id) continue;
      sow.run(String(x.lifecycle_id).slice(0, 40), x.status || '', x.signed_by || '', x.agency || '', x.at || '');
    }
    db.prepare('DELETE FROM trace_log').run();
    const tr = db.prepare('INSERT INTO trace_log(at,service,name,ms,status,request,response,rows) VALUES(?,?,?,?,?,?,?,?)');
    for (const x of data.traces || []) {
      if (!x) continue;
      tr.run(x.at || '', x.service || '', x.name || '', +x.ms || 0, x.status || '', typeof x.request === 'string' ? x.request : JSON.stringify(x.request || null), typeof x.response === 'string' ? x.response : JSON.stringify(x.response || null), typeof x.rows === 'string' ? x.rows : JSON.stringify(x.rows || []));
    }
    const have = new Set(db.prepare("SELECT hash FROM decision_audit WHERE hash IS NOT NULL").all().map(r => r.hash));
    const aud = db.prepare('INSERT INTO decision_audit(at,user_id,role,region,action,object,before,after,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const x of data.audit || []) {
      if (!x || !x.hash || have.has(x.hash)) continue;
      aud.run(x.at || '', x.user_id || '', x.role || '', x.region || '', x.action || '', x.object || '', typeof x.before === 'string' ? x.before : JSON.stringify(x.before || null), typeof x.after === 'string' ? x.after : JSON.stringify(x.after || null), x.prev_hash || '', x.hash);
      have.add(x.hash);
    }
  });
  tx();
  remember(token);
  return true;
}
module.exports = { exportLog, apply, verify, currentSig, remember, sigOf };
