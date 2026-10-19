// Read-only view of the tables the demo actually writes. Counts come from those databases.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATA } = require('./lib');

function open(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return null;
  try { return new Database(p, { readonly: true, fileMustExist: true }); } catch (e) { return null; }
}
function sample(db, sql, params) {
  try {
    const rows = db.prepare(sql).all(...(params || []));
    const n = rows.length && rows[0].n != null && Object.keys(rows[0]).length === 1 ? null : rows;
    return n;
  } catch (e) { return { error: e.message }; }
}
function countOf(db, table) {
  try { return db.prepare('SELECT COUNT(*) n FROM ' + table).get().n; } catch (e) { return 0; }
}
function clipCell(v) {
  if (v == null) return v;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 160 ? s.slice(0, 160) + '…' : v;
}
function presentRow(table, row) {
  if (table === 'lifecycle') {
    let name = '', city = '', status = '';
    try {
      const p = JSON.parse(row.payload || '{}');
      name = (p.fields && p.fields.campaign_name) || '';
      city = (p.fields && p.fields.city) || '';
      status = (p.budget && p.budget.status) || p.step || '';
    } catch (e) {}
    return { id: row.id, step: row.step, name, city, status, at: row.at };
  }
  if (table === 'trace_log') return { id: row.id, at: row.at, service: row.service, name: row.name, ms: row.ms, status: row.status };
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = clipCell(v);
  return out;
}
function rowsOf(db, table, limit) {
  const lim = limit || 20;
  const map = rows => rows.map(r => presentRow(table, r));
  try { return map(db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid DESC LIMIT ' + lim).all()); }
  catch (e) { try { return map(db.prepare('SELECT * FROM ' + table + ' LIMIT ' + lim).all()); } catch (e2) { return []; } }
}
function pack(id, label, source, count, rows, columns) {
  const list = Array.isArray(rows) ? rows : [];
  return { id, label, source, count, columns: columns || (list[0] ? Object.keys(list[0]) : []), rows: list.slice(0, 20) };
}
function tables() {
  const core = require('./core').db;
  const engine = open('engine.db');
  const crm = open('crm.db');
  const wh = open('warehouse.db');
  const out = [];
  const add = (id, label, db, table, source) => {
    if (!db) { out.push(pack(id, label, source, 0, [])); return; }
    out.push(pack(id, label, source, countOf(db, table), rowsOf(db, table, 20)));
  };
  add('lifecycle', 'Campaign requests', core, 'lifecycle', 'core');
  add('budget_ledger', 'Budget ledger', core, 'budget_ledger', 'core');
  add('ban_registry', 'BAN registry', core, 'ban_ids', 'core');
  add('sow', 'SOW', core, 'sow_docs', 'core');
  add('audit', 'Audit log', core, 'decision_audit', 'core');
  add('trace', 'Backend trace', core, 'trace_log', 'core');
  if (engine) {
    add('campaigns', 'Campaigns', engine, 'campaigns', 'engine');
    add('budgets', 'Budget requests', engine, 'budget_requests', 'engine');
    add('leads', 'Leads', engine, 'leads', 'engine');
    add('consent', 'Consent ledger', engine, 'consent_ledger', 'engine');
    add('sync_queue', 'Sync queue', engine, 'sync_jobs', 'engine');
    engine.close();
  }
  if (crm) {
    add('sfdc_campaigns', 'SFDC campaigns (in-process)', crm, 'Campaign', 'crm');
    crm.close();
  }
  if (wh) {
    let facts = [];
    try { facts = wh.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'marts_%' ORDER BY 1").all(); } catch (e) {}
    for (const t of facts.slice(0, 8)) out.push(pack('wh_' + t.name, 'Warehouse ' + t.name.replace(/^marts_/, ''), 'warehouse', countOf(wh, t.name), rowsOf(wh, t.name, 12)));
    wh.close();
  }
  return out;
}
function one(id) {
  return tables().find(t => t.id === id) || null;
}
const ENDPOINTS = [
  ['GET', '/api/session', 'Who is signed in'],
  ['GET', '/api/engine/health', 'Service counts'],
  ['GET', '/api/engine/architecture', 'Control-plane diagram'],
  ['GET', '/api/engine/events', 'Recent bus events'],
  ['GET', '/api/engine/trace', 'Steps from this browser'],
  ['GET', '/api/engine/explorer', 'Table counts and rows'],
  ['GET', '/api/engine/lifecycle?full=1', 'Open campaign requests'],
  ['GET', '/api/briefing', 'Desk briefing'],
  ['GET', '/health', 'Process health']
];
module.exports = { tables, one, ENDPOINTS };
