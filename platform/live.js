'use strict';

const crypto = require('crypto');
const { current } = require('./db');
const engage = require('./engage');
const crm = require('./crm');
const spend = require('./spend');
const insights = require('./insights');
const warehouse = require('./warehouse');
const command = require('./command');
const { BASELINES } = require('./modules');
const { now } = require('./clock');

const GOAL = 20;
const CHICAGO_RULES = { all: [
  { field: 'contact.title', op: 'eq', value: 'CIO' },
  { field: 'contact.state', op: 'eq', value: 'Illinois' },
  { field: 'contact.country', op: 'eq', value: 'United States' },
  { field: 'activity.open', op: 'within_days', value: 30 },
  { field: 'consent.status', op: 'eq', value: 'opted_in' }
] };

const listeners = new Set();
let timer = null;
let ticking = false;
let seq = 0;

function db() { return current(); }
function wall() { return new Date().toISOString(); }
function jobId() { seq += 1; return 'JOB-' + Date.now().toString(36) + '-' + String(seq).padStart(4, '0'); }
function ratio(baselineMin, measuredMs) {
  const ms = Math.max(1, Math.round(Number(measuredMs) || 0));
  return (Number(baselineMin) || 0) * 60000 / ms;
}

async function emit(row) {
  const at = row.at || wall();
  const info = await db().run(
    'INSERT INTO ops_events(at, service, kind, message, actor, channel, source, why, payload_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [at, row.service || 'ops', row.kind || 'note', row.message || '', row.actor || '', row.channel || 'App', row.source || '', row.why || '', row.payload ? JSON.stringify(row.payload) : null]
  );
  const event = { id: info.lastInsertRowid || info.changes, at, service: row.service || 'ops', kind: row.kind || 'note', message: row.message || '', actor: row.actor || '', channel: row.channel || 'App', source: row.source || '', why: row.why || '', payload: row.payload || null };
  for (const send of listeners) {
    try { send(event); } catch (e) { listeners.delete(send); }
  }
  return event;
}

async function enqueue({ runId, kind, runAfter, actor, channel, source, why, payload }) {
  const id = jobId();
  const at = wall();
  await db().run(
    'INSERT INTO ops_jobs(id, run_id, kind, status, run_after, actor, channel, source, why, payload_json, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    [id, runId || '', kind, 'queued', runAfter || at, actor || '', channel || 'App', source || '', why || '', JSON.stringify(payload || {}), at]
  );
  return id;
}

function later(ms) { return new Date(Date.now() + Math.max(0, ms)).toISOString(); }

async function next(ctx, kind, extra) {
  await enqueue({
    runId: ctx.runId, kind, runAfter: later(ctx.stepMs || 0),
    actor: ctx.actor, channel: ctx.channel, source: ctx.source, why: '',
    payload: Object.assign({}, ctx, extra || {})
  });
}

function ctxOf(job) {
  const payload = JSON.parse(job.payload_json || '{}');
  return {
    runId: job.run_id,
    stepMs: payload.stepMs || 0,
    actor: job.actor || payload.actor || 'Maria Alvarez',
    channel: job.channel || payload.channel || 'App',
    source: job.source || payload.source || 'Live demo',
    sendId: payload.sendId || '',
    cursor: payload.cursor || 0
  };
}

async function doSegment(ctx) {
  const seg = await engage.saveSegment({
    name: 'CIOs in Illinois who opened last month', rules: CHICAGO_RULES,
    actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.source
  });
  const why = `Built the Chicago segment. ${seg.count} opted-in CIOs in Illinois who opened last month.`;
  await emit({ service: 'engage', kind: 'segment', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { count: seg.count, segmentId: seg.id } });
  await next(ctx, 'queue', { segmentId: seg.id, templateId: 'TPL-CHI' });
  return { segmentId: seg.id, count: seg.count };
}

async function doQueue(ctx, payload) {
  const begun = await engage.beginQueue({
    segmentId: payload.segmentId, templateId: payload.templateId || 'TPL-CHI', campaignId: 'CAMP-CHI',
    actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.source, idempotencyKey: 'live:chicago'
  });
  const at = wall();
  if (!begun.already) {
    for (const person of begun.queued) {
      await db().run('INSERT INTO mail_jobs(id, run_id, send_id, contact_id, email, status, reason, queued_at) VALUES(?,?,?,?,?,?,NULL,?)',
        ['MJ-' + crypto.randomBytes(3).toString('hex'), ctx.runId, begun.sendId, person.id, person.email, 'queued', at]);
    }
    for (const person of begun.heldRows || []) {
      const reason = person.status === 'opted_out' ? 'Unsubscribed. Consent is opted out.' : 'Held. Consent is not opted in.';
      await db().run('INSERT INTO mail_jobs(id, run_id, send_id, contact_id, email, status, reason, queued_at) VALUES(?,?,?,?,?,?,?,?)',
        ['MJ-' + crypto.randomBytes(3).toString('hex'), ctx.runId, begun.sendId, person.id, person.email, 'held', reason, at]);
    }
  }
  const why = begun.already
    ? `The Chicago invite is already on the book. ${begun.sent} delivered. No second copy.`
    : `Queued ${begun.queued.length} invites. Held ${begun.held} without opted-in consent.`;
  await emit({ service: 'engage', kind: 'queue', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { sendId: begun.sendId, queued: begun.already ? 0 : begun.queued.length, held: begun.held } });
  await next(ctx, 'hold', { sendId: begun.sendId });
  return { sendId: begun.sendId, queued: begun.already ? 0 : begun.queued.length };
}

async function doHold(ctx, payload) {
  const person = await db().get(`SELECT c.id, c.email, c.first_name, cn.status
    FROM contacts c JOIN consent cn ON cn.contact_id = c.id AND cn.current = 1
    WHERE cn.status = 'opted_out' ORDER BY c.id LIMIT 1`);
  let reason = 'No opted-out contact was on the book.';
  if (person) {
    reason = 'Unsubscribed. Consent is opted out.';
    await db().run('INSERT INTO mail_jobs(id, run_id, send_id, contact_id, email, status, reason, queued_at) VALUES(?,?,?,?,?,?,?,?)',
      ['MJ-' + crypto.randomBytes(3).toString('hex'), ctx.runId, payload.sendId || '', person.id, person.email, 'held', reason, wall()]);
    reason = `${person.first_name || person.email} was not mailed. ${reason}`;
  }
  await emit({ service: 'engage', kind: 'consent', message: reason, actor: ctx.actor, channel: 'Email', source: ctx.source, why: reason, payload: person || {} });
  await next(ctx, 'deliver', { sendId: payload.sendId || '' });
  return { held: !!person };
}

async function doDeliver(ctx, payload) {
  const job = await db().get("SELECT * FROM mail_jobs WHERE run_id = ? AND status = 'queued' ORDER BY id LIMIT 1", [ctx.runId]);
  if (!job) {
    await emit({ service: 'engage', kind: 'deliver', message: 'The send queue is empty.', actor: ctx.actor, channel: 'Email', source: ctx.source, why: 'Every queued invite has been delivered or held.' });
    await next(ctx, 'drip', { sendId: payload.sendId || '', cursor: 0 });
    return { done: true };
  }
  const result = await engage.deliverContact(job.send_id, job.contact_id, { actor: ctx.actor, channel: 'Email', sourceMessage: ctx.source });
  if (result.held) {
    await db().run("UPDATE mail_jobs SET status = 'held', reason = ? WHERE id = ?", [result.reason, job.id]);
    await emit({ service: 'engage', kind: 'consent', message: `${job.email}: ${result.reason}`, actor: ctx.actor, channel: 'Email', source: ctx.source, why: result.reason, payload: { email: job.email } });
  } else {
    await db().run("UPDATE mail_jobs SET status = 'delivered', delivered_at = ? WHERE id = ?", [wall(), job.id]);
    const why = `Delivered the Chicago invite to ${job.email}.`;
    await emit({ service: 'engage', kind: 'deliver', message: why, actor: ctx.actor, channel: 'Email', source: ctx.source, why, payload: { email: job.email, sendId: job.send_id } });
  }
  await next(ctx, 'deliver', { sendId: job.send_id });
  return { email: job.email, held: !!result.held };
}

async function doDrip(ctx, payload) {
  const sendId = payload.sendId;
  const rows = sendId
    ? await db().all('SELECT token, contact_id, email, opened, clicked FROM send_recipients WHERE send_id = ? ORDER BY contact_id', [sendId])
    : [];
  const n = rows.length;
  const openN = Math.min(n, Math.round(n * engage.OPEN_RATE));
  const clickN = Math.min(openN, Math.round(n * engage.CLICK_RATE));
  const cursor = payload.cursor || 0;
  if (!n || cursor >= openN) {
    const why = n ? `Opens and clicks are in. ${openN} opens, ${clickN} clicks.` : 'No recipients to score yet.';
    await emit({ service: 'engage', kind: 'drip', message: why, actor: 'contact', channel: 'Email', source: ctx.source, why, payload: { opens: openN, clicks: clickN } });
    await next(ctx, 'crm', { sendId });
    return { opens: openN, clicks: clickN };
  }
  const row = rows[cursor];
  if (cursor < openN && !row.opened) await engage.mark(row.token, 'open', 'Recorded an open from the tracking pixel.');
  if (cursor < clickN && !row.clicked) await engage.mark(row.token, 'click', 'Recorded a click from the redirect.');
  const what = cursor < clickN ? 'opened and clicked' : 'opened';
  const why = `${row.email} ${what} the Chicago invite.`;
  await emit({ service: 'engage', kind: 'drip', message: why, actor: 'contact', channel: 'Email', source: ctx.source, why, payload: { email: row.email, cursor } });
  await next(ctx, 'drip', { sendId, cursor: cursor + 1 });
  return { cursor };
}

async function doCrm(ctx) {
  const result = await crm.upload({ campaignId: 'CAMP-CHI', actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.source });
  const jobs = await db().all('SELECT id, kind, external_id, status, payload_json, last_error FROM crm_queue ORDER BY id DESC LIMIT 12');
  for (const job of jobs) {
    const why = job.last_error || `Synced a ${job.kind} payload to the CRM bridge.`;
    const id = 'SYNC-' + job.id;
    const existing = await db().get('SELECT id FROM sync_payloads WHERE id = ?', [id]);
    if (!existing) {
      await db().run('INSERT INTO sync_payloads(id, at, object_kind, external_id, status, payload_json, why) VALUES(?,?,?,?,?,?,?)',
        [id, wall(), job.kind, job.external_id, job.status, job.payload_json, why]);
    }
    await emit({ service: 'crm', kind: 'sync', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { kind: job.kind, externalId: job.external_id, status: job.status } });
  }
  const heldN = (result.held || []).length;
  const why = `Uploaded the attendee file. ${result.accepted} accepted, ${heldN} held. Owners follow the AE and SDR territory rules.`;
  await emit({ service: 'crm', kind: 'upload', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { accepted: result.accepted, held: heldN } });
  await next(ctx, 'file');
  return { accepted: result.accepted, held: heldN, payloads: jobs.length };
}

async function doFile(ctx) {
  const packet = await spend.file({
    campaignId: 'CAMP-CHI', name: 'Chicago security roundtable', amount: 180000, currency: 'USD',
    actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.source, idempotencyKey: 'ask:budget-chicago'
  });
  const synced = await command.sync('CAMP-CHI', ctx);
  const why = packet.status === 'approved'
    ? 'The Chicago budget is already approved.'
    : 'Filed $180,000 for the Chicago security roundtable. Waiting on Chris. Three human-check fields are still open.';
  await emit({ service: 'command', kind: 'budget', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { status: packet.status, checks: synced.checks } });
  await next(ctx, 'fill');
  return { status: packet.status };
}

async function doFill(ctx) {
  const packet = await spend.answer({
    campaignId: 'CAMP-CHI',
    answers: { our_pm: 'Maria Alvarez', po_number: 'PO-2044', venue_contact: 'Jordan Hale' },
    actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.source
  });
  await command.sync('CAMP-CHI', ctx);
  const why = 'Saved the three SOW answers a person had to supply: Maria Alvarez, PO-2044, Jordan Hale.';
  await emit({ service: 'command', kind: 'sow', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { open: (packet.open || []).length } });
  await next(ctx, 'approve');
  return { open: (packet.open || []).length };
}

async function doApprove(ctx) {
  const packet = await spend.approve({ campaignId: 'CAMP-CHI', actor: 'Chris M.', role: 'approver', channel: ctx.channel, sourceMessage: ctx.source });
  await command.sync('CAMP-CHI', { actor: 'Chris M.', channel: ctx.channel, sourceMessage: ctx.source });
  const why = `Chris M. approved $${Math.round(packet.amountUsd || 0).toLocaleString('en-US')} for the Chicago security roundtable. The code is ready.`;
  await emit({ service: 'command', kind: 'approve', message: why, actor: 'Chris M.', channel: ctx.channel, source: ctx.source, why, payload: { status: packet.status } });
  await next(ctx, 'rollup');
  return { status: packet.status };
}

async function doRollup(ctx) {
  const result = await warehouse.rollup({ actor: 'Insights', channel: ctx.channel, sourceMessage: ctx.source });
  await emit({ service: 'warehouse', kind: 'rollup', message: result.why, actor: 'Insights', channel: ctx.channel, source: ctx.source, why: result.why, payload: { rows: result.rows } });
  await next(ctx, 'report');
  return result;
}

async function doReport(ctx) {
  const weekly = await insights.build('weekly', 'Americas');
  const monthly = await insights.build('monthly', 'portfolio');
  const why = 'Built the weekly Americas deck and the monthly portfolio deck from the warehouse mart.';
  await emit({ service: 'warehouse', kind: 'report', message: why, actor: 'Insights', channel: ctx.channel, source: ctx.source, why, payload: { weekly: weekly.pptxName, monthly: monthly.pptxName } });
  await next(ctx, 'efficiency');
  return { weekly: weekly.pptxName, monthly: monthly.pptxName };
}

async function doEfficiency(ctx) {
  const jobs = await db().all('SELECT kind, measured_ms FROM ops_jobs WHERE run_id = ? AND status = ?', [ctx.runId, 'done']);
  const groups = {
    data: ['segment', 'hold'],
    engage: ['queue', 'deliver', 'drip'],
    crm: ['crm'],
    plan: ['file', 'fill', 'approve'],
    insights: ['rollup', 'report'],
    brain: ['segment', 'approve']
  };
  const samples = [];
  for (const [task, kinds] of Object.entries(groups)) {
    const base = BASELINES[task];
    if (!base) continue;
    const measured = jobs.filter(j => kinds.includes(j.kind)).reduce((sum, j) => sum + (j.measured_ms || 0), 0) || 1;
    const score = ratio(base.minutes, measured);
    const why = `${base.proof} took ${measured} ms here. The old-tool baseline is ${base.minutes} minutes, ${Math.round(score)}x.`;
    const id = ctx.runId + ':' + task;
    await db().run(`INSERT INTO efficiency_samples(id, task, baseline_min, measured_ms, ratio, at, why) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET measured_ms = excluded.measured_ms, ratio = excluded.ratio, at = excluded.at, why = excluded.why`,
      [id, task, base.minutes, measured, score, now(), why]);
    samples.push({ task, baseline: base.minutes, measured, ratio: score });
    await emit({ service: 'efficiency', kind: 'meter', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why, payload: { task, ratio: Math.round(score), goal: GOAL } });
  }
  await next(ctx, 'done');
  return { samples };
}

async function doDone(ctx) {
  const why = 'The live Chicago run finished. The queue, the CRM sync, the warehouse rollup, and Chris\'s approval are on the book.';
  await emit({ service: 'ops', kind: 'done', message: why, actor: ctx.actor, channel: ctx.channel, source: ctx.source, why });
  return { ok: true };
}

const HANDLERS = {
  segment: doSegment,
  queue: doQueue,
  hold: doHold,
  deliver: doDeliver,
  drip: doDrip,
  crm: doCrm,
  file: doFile,
  fill: doFill,
  approve: doApprove,
  rollup: doRollup,
  report: doReport,
  efficiency: doEfficiency,
  done: doDone
};

async function tick(nowIso) {
  if (ticking) return { done: 0, ready: 0, busy: true };
  ticking = true;
  const stamp = nowIso || wall();
  let done = 0;
  try {
    await warehouse.runScheduler(stamp).catch(() => []);
    const jobs = await db().all("SELECT * FROM ops_jobs WHERE status = 'queued' AND run_after <= ? ORDER BY run_after, id LIMIT 4", [stamp]);
    for (const job of jobs) {
      const started = Date.now();
      await db().run("UPDATE ops_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'", [wall(), job.id]);
      const claimed = await db().get('SELECT status FROM ops_jobs WHERE id = ?', [job.id]);
      if (!claimed || claimed.status !== 'running') continue;
      try {
        const payload = JSON.parse(job.payload_json || '{}');
        const ctx = ctxOf(job);
        const handler = HANDLERS[job.kind];
        const result = handler ? await handler(ctx, payload) : {};
        const ms = Date.now() - started;
        await db().run("UPDATE ops_jobs SET status = 'done', finished_at = ?, measured_ms = ?, result_json = ? WHERE id = ?", [wall(), ms, JSON.stringify(result || {}), job.id]);
        done += 1;
      } catch (e) {
        const ms = Date.now() - started;
        await db().run("UPDATE ops_jobs SET status = 'error', finished_at = ?, measured_ms = ?, error = ? WHERE id = ?", [wall(), ms, e.message || String(e), job.id]);
        await emit({ service: 'ops', kind: 'error', message: e.message || String(e), actor: job.actor, channel: job.channel, source: job.source, why: e.message || 'A job failed.' });
        done += 1;
      }
    }
    const ready = await db().get("SELECT COUNT(*) AS n FROM ops_jobs WHERE status = 'queued' AND run_after <= ?", [stamp]);
    return { done, ready: ready ? ready.n : 0 };
  } finally {
    ticking = false;
  }
}

async function drain(limit = 500) {
  let steps = 0;
  for (let i = 0; i < limit; i++) {
    const out = await tick(new Date(Date.now() + 3600 * 1000).toISOString());
    if (out.busy) { await new Promise(r => setTimeout(r, 20)); continue; }
    steps += out.done;
    if (!out.done) break;
  }
  return steps;
}

async function armDemo({ spanMs = 60000, actor = 'Maria Alvarez', channel = 'App', source = 'Live demo' } = {}) {
  await db().run("UPDATE ops_jobs SET status = 'cancelled', finished_at = ? WHERE status = 'queued'", [wall()]);
  const runId = 'RUN-' + crypto.randomBytes(3).toString('hex');
  const steps = 60;
  const stepMs = Math.max(0, Math.round(Number(spanMs) / steps));
  await enqueue({
    runId, kind: 'segment', runAfter: wall(), actor, channel, source,
    why: 'Start the Chicago run.',
    payload: { stepMs, spanMs, actor, channel, source }
  });
  await emit({ service: 'ops', kind: 'start', message: 'Live demo started. The Chicago run will show each backend step.', actor, channel, source, why: 'Maria asked to watch the Chicago flow end to end.', payload: { runId, spanMs } });
  return { ok: true, runId, spanMs, stepMs };
}

function startWorker() {
  if (timer) return;
  timer = setInterval(() => { tick().catch(e => console.error('ops', e && e.message || e)); }, 400);
  if (timer.unref) timer.unref();
}

function stopWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function snapshot() {
  const d = db();
  const mail = await d.get("SELECT COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) AS queued, COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered, COALESCE(SUM(CASE WHEN status = 'held' THEN 1 ELSE 0 END), 0) AS held FROM mail_jobs");
  const jobs = await d.get("SELECT COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) AS queued, COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS running, COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done, COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS error FROM ops_jobs");
  const events = await d.all('SELECT id, at, service, kind, message, actor, channel, source, why FROM ops_events ORDER BY id DESC LIMIT 40');
  const sync = await d.all('SELECT id, at, object_kind, external_id, status, payload_json, why FROM sync_payloads ORDER BY at DESC LIMIT 8');
  const samples = await d.all('SELECT task, baseline_min, measured_ms, ratio, why FROM efficiency_samples ORDER BY task');
  const checks = await command.list('CAMP-CHI');
  const mart = await warehouse.marts();
  const beat = await d.get('SELECT job, next_at, last_at FROM scheduler_beats WHERE id = ?', ['nightly-rollup']);
  return {
    goal: GOAL,
    mail: mail || { queued: 0, delivered: 0, held: 0 },
    jobs: jobs || { queued: 0, running: 0, done: 0, error: 0 },
    events,
    sync: sync.map(row => ({ ...row, payload: safeJson(row.payload_json) })),
    efficiency: samples.map(row => ({ ...row, ratio: Math.round(row.ratio), pastGoal: row.ratio >= GOAL })),
    checks,
    mart: mart.slice(0, 8),
    scheduler: beat || null
  };
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch (e) { return {}; }
}

function stream(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no'
  });
  const send = (event) => {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.kind || 'note'}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  listeners.add(send);
  snapshot().then(body => {
    res.write(`event: snapshot\ndata: ${JSON.stringify(body)}\n\n`);
  }).catch(e => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: e.message || String(e) })}\n\n`);
  });
  const drop = () => listeners.delete(send);
  req.on('close', drop);
  return drop;
}

module.exports = { GOAL, ratio, emit, armDemo, tick, drain, startWorker, stopWorker, snapshot, stream, enqueue };
