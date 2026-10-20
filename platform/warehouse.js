'use strict';

const crypto = require('crypto');
const { current } = require('./db');
const { append } = require('./log');
const { now } = require('./clock');

function db() { return current(); }

async function rollup({ actor = 'Insights', channel = 'App', sourceMessage = 'nightly rollup' } = {}) {
  const d = db();
  const rows = await d.all(`SELECT campaign_id,
      substr(at, 1, 10) AS day,
      SUM(CASE WHEN kind = 'send' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN kind = 'open' THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN kind = 'click' THEN 1 ELSE 0 END) AS clicked
    FROM activities
    GROUP BY campaign_id, substr(at, 1, 10)`);
  const pipes = await d.all('SELECT id, pipeline_usd FROM campaigns');
  const pipeOf = Object.fromEntries(pipes.map(r => [r.id, r.pipeline_usd || 0]));
  const at = now();
  const id = 'ROLL-' + crypto.randomBytes(3).toString('hex');
  await d.tx(async (q) => {
    await q.run('DELETE FROM mart_campaign_day');
    for (const row of rows) {
      const key = row.campaign_id + ':' + row.day;
      await q.run('INSERT INTO mart_campaign_day(id, campaign_id, day, sent, opened, clicked, pipeline_usd, updated_at) VALUES(?,?,?,?,?,?,?,?)',
        [key, row.campaign_id, row.day, row.sent, row.opened, row.clicked, pipeOf[row.campaign_id] || 0, at]);
    }
    const why = `Rolled ${rows.length} campaign-day rows into the warehouse mart for the weekly and monthly reports.`;
    await q.run('INSERT INTO rollup_runs(id, job, at, status, row_count, why) VALUES(?,?,?,?,?,?)', [id, 'nightly-rollup', at, 'done', rows.length, why]);
    await append(q, { entity: 'mart_campaign_day', entityId: id, op: 'insert', actor, channel, sourceMessage, why, after: { rows: rows.length } });
  });
  return { id, rows: rows.length, why: `Rolled ${rows.length} campaign-day rows into the warehouse mart for the weekly and monthly reports.` };
}

async function ensureSchedule() {
  const d = db();
  const row = await d.get('SELECT id FROM scheduler_beats WHERE id = ?', ['nightly-rollup']);
  if (row) return;
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await d.run('INSERT INTO scheduler_beats(id, job, next_at, last_at) VALUES(?,?,?,NULL)', ['nightly-rollup', 'nightly-rollup', next]);
}

async function runScheduler(nowIso = new Date().toISOString(), ctx = {}) {
  await ensureSchedule();
  const due = await db().all('SELECT * FROM scheduler_beats WHERE next_at <= ?', [nowIso]);
  const ran = [];
  for (const beat of due) {
    let result = { rows: 0 };
    if (beat.job === 'nightly-rollup') result = await rollup({ actor: ctx.actor || 'Insights', channel: ctx.channel || 'App', sourceMessage: ctx.sourceMessage || 'scheduler' });
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db().run('UPDATE scheduler_beats SET last_at = ?, next_at = ? WHERE id = ?', [nowIso, next, beat.id]);
    ran.push({ id: beat.id, job: beat.job, rows: result.rows });
  }
  return ran;
}

async function marts() {
  return db().all('SELECT campaign_id, day, sent, opened, clicked, pipeline_usd FROM mart_campaign_day ORDER BY day DESC, campaign_id LIMIT 40');
}

module.exports = { rollup, ensureSchedule, runScheduler, marts };
