'use strict';

// Every data query is limited to the workspace that is bound on this request.
// The tenant id is embedded as a literal after it is checked, so a query cannot
// name another workspace. The demo book is the workspace "demo".
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const ID = /^[a-z0-9_-]{1,40}$/;
const KEYWORDS = new Set(['where', 'on', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'group', 'order', 'limit', 'set', 'and', 'or', 'having', 'union', 'window', 'natural', 'full']);

const TABLES = [
  'platform_meta', 'accounts', 'contacts', 'consent', 'campaigns', 'events', 'activities', 'budgets', 'sows', 'codes', 'event_log',
  'segments', 'templates', 'sends', 'send_recipients', 'pages', 'journeys', 'journey_members', 'ask_runs',
  'actuals', 'envelopes', 'territories', 'crm_objects', 'crm_queue', 'crm_uploads', 'plan_packets',
  'ops_events', 'ops_jobs', 'mail_jobs', 'sync_payloads', 'rollup_runs', 'mart_campaign_day', 'efficiency_samples', 'scheduler_beats', 'command_checks'
];
const SCOPED = new Set(TABLES);

function fail(message) {
  const error = new Error(message);
  error.status = 403;
  throw error;
}

function tenantId() {
  const store = als.getStore();
  if (!store) return 'demo';
  return typeof store === 'string' ? store : store.id;
}

function brand() {
  const store = als.getStore();
  if (!store || typeof store === 'string' || !store.name) return { id: tenantId() };
  return {
    id: store.id,
    name: String(store.name).slice(0, 40),
    color: store.color || '',
    inbound: store.inbound || ''
  };
}

function bind(tenant, fn) {
  const store = typeof tenant === 'string' ? { id: tenant } : {
    id: tenant.id,
    name: tenant.name || '',
    color: tenant.color || '',
    inbound: tenant.inbound || ''
  };
  if (!ID.test(String(store.id || ''))) fail('That workspace id is not valid.');
  if (store.color && !/^#[0-9a-fA-F]{6}$/.test(store.color)) store.color = '';
  return als.run(store, fn);
}

function lit(id) {
  if (!ID.test(id)) fail('That workspace id is not valid.');
  return "'" + id + "'";
}

function hasOuterWhere(sql) {
  let depth = 0;
  let str = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (str) { if (c === "'") str = false; continue; }
    if (c === "'") { str = true; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && /^where\b/i.test(sql.slice(i))) return true;
  }
  return false;
}

function owns(sql, args, id) {
  for (const match of String(sql).matchAll(/tenant_id\s*=\s*'([^']*)'/gi)) {
    if (match[1] !== id) fail('That query crosses a workspace.');
  }
  const insert = String(sql).match(/insert\s+into\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i);
  if (!insert) return;
  const cols = insert[1].split(',').map(s => s.trim().toLowerCase());
  const vals = insert[2].split(',').map(s => s.trim());
  const at = cols.indexOf('tenant_id');
  if (at < 0 || cols.length !== vals.length) return;
  const quoted = vals[at].match(/^'([^']*)'$/);
  if (quoted && quoted[1] !== id) fail('That query crosses a workspace.');
  if (vals[at] === '?' && args) {
    let n = 0;
    for (let i = 0; i < at; i++) n += (vals[i].match(/\?/g) || []).length;
    if (args[n] != null && String(args[n]) !== id) fail('That query crosses a workspace.');
  }
}

function rewriteInsert(sql, id) {
  return String(sql).replace(/insert\s+into\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i, (full, table, cols, vals) => {
    if (!SCOPED.has(table.toLowerCase())) return full;
    if (/\btenant_id\b/i.test(cols)) return full;
    return 'INSERT INTO ' + table + '(' + cols + ', tenant_id) VALUES(' + vals + ', ' + lit(id) + ')';
  });
}

function rewriteMutation(sql, id) {
  const match = String(sql).match(/^\s*(update|delete\s+from|delete)\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!match || !SCOPED.has(match[2].toLowerCase())) return sql;
  if (sql.toLowerCase().includes('tenant_id = ' + lit(id))) return sql;
  const pred = "tenant_id = " + lit(id);
  return hasOuterWhere(sql) ? sql + ' AND ' + pred : sql + ' WHERE ' + pred;
}

function scopeReads(sql, id) {
  const mark = 'tenant_id = ' + lit(id);
  const re = /\b(from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let out = '';
  let cursor = 0;
  let match;
  while ((match = re.exec(sql))) {
    const table = match[2];
    if (!SCOPED.has(table.toLowerCase())) continue;
    const rest = sql.slice(re.lastIndex);
    if (/^\s+where\s+tenant_id\s*=/i.test(rest)) continue;
    let alias = table;
    let extra = 0;
    const aliasMatch = /^\s+(?:as\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/i.exec(rest);
    if (aliasMatch && !KEYWORDS.has(aliasMatch[1].toLowerCase())) {
      alias = aliasMatch[1];
      extra = aliasMatch[0].length;
    }
    out += sql.slice(cursor, match.index);
    out += match[1] + ' (SELECT * FROM ' + table + ' WHERE ' + mark + ') ' + alias;
    cursor = re.lastIndex + extra;
    re.lastIndex = cursor;
  }
  return out + sql.slice(cursor);
}

function scopeStatement(sql, tenant, args) {
  const text = String(sql || '');
  const id = tenant || tenantId();
  if (!ID.test(id)) fail('That workspace id is not valid.');
  if (!text.trim()) return text;
  owns(text, args, id);
  if (/^\s*(update|delete)\b/i.test(text)) return rewriteMutation(text, id);
  return scopeReads(rewriteInsert(text, id), id);
}

function assertSend(used, adding, cap) {
  const limit = Number(cap) || 0;
  if (limit <= 0) return;
  if ((Number(used) || 0) + (Number(adding) || 0) > limit) {
    const error = new Error('This workspace reached its send limit.');
    error.status = 429;
    throw error;
  }
}

module.exports = { TABLES, SCOPED, tenantId, brand, bind, scopeStatement, assertSend };
