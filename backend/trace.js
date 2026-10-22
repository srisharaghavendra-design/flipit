// Records the real steps of one request. The panel reads these back; nothing here is a scripted sentence.
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

function clip(v) {
  if (v == null) return null;
  let s;
  try { s = JSON.stringify(v); } catch (e) { return { error: 'unserializable' }; }
  if (s.length <= 1800) { try { return JSON.parse(s); } catch (e) { return s; } }
  return { truncated: true, preview: s.slice(0, 1800) };
}
function add(step) {
  const ctx = als.getStore();
  if (!ctx || !step) return;
  ctx.steps.push({
    at: step.at || new Date().toISOString(),
    service: String(step.service || 'backend').slice(0, 80),
    name: String(step.name || '').slice(0, 180),
    ms: step.ms == null ? 0 : step.ms,
    status: step.status || 'ok',
    request: clip(step.request),
    response: clip(step.response),
    rows: Array.isArray(step.rows) ? step.rows.slice(0, 12).map(clip) : []
  });
}
function persist(steps) {
  if (!steps || !steps.length) return;
  const core = require('./core');
  core.db.exec(`CREATE TABLE IF NOT EXISTS trace_log(
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, service TEXT, name TEXT, ms INTEGER, status TEXT,
    request TEXT, response TEXT, rows TEXT
  )`);
  const ins = core.db.prepare('INSERT INTO trace_log(at,service,name,ms,status,request,response,rows) VALUES(?,?,?,?,?,?,?,?)');
  for (const s of steps) ins.run(s.at, s.service, s.name, s.ms || 0, s.status, JSON.stringify(s.request), JSON.stringify(s.response), JSON.stringify(s.rows || []));
  const n = core.db.prepare('SELECT COUNT(*) n FROM trace_log').get().n;
  if (n > 140) core.db.prepare('DELETE FROM trace_log WHERE id < (SELECT MIN(id) FROM (SELECT id FROM trace_log ORDER BY id DESC LIMIT 100))').run();
  try {
    const bus = require('./hub').bus;
    for (const s of steps) bus({ svc: s.service, kind: 'step', msg: s.name + ' · ' + (s.ms || 0) + 'ms · ' + s.status, data: { status: s.status, ms: s.ms } });
  } catch (e) {}
}
async function run(fn) {
  const ctx = { steps: [] };
  const value = await als.run(ctx, fn);
  try { persist(ctx.steps); } catch (e) { console.error('trace', e.message); }
  return { value, steps: ctx.steps };
}
function list(limit) {
  const core = require('./core');
  try {
    return core.db.prepare('SELECT id,at,service,name,ms,status,request,response,rows FROM trace_log ORDER BY id DESC LIMIT ?').all(limit || 80).reverse().map(r => ({
      at: r.at, service: r.service, name: r.name, ms: r.ms, status: r.status,
      request: JSON.parse(r.request || 'null'), response: JSON.parse(r.response || 'null'), rows: JSON.parse(r.rows || '[]')
    }));
  } catch (e) { return []; }
}
module.exports = { add, run, list, clip };
