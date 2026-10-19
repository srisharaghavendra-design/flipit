'use strict';

const { current } = require('./db');
const { now } = require('./clock');
const { BASELINES } = require('./modules');

function db() { return current(); }

async function record({ askId, module, text, ms, ok }) {
  await db().run('INSERT INTO ask_runs(ask_id, module, text, ms, ok, at) VALUES(?, ?, ?, ?, ?, ?)', [askId, module, String(text || '').slice(0, 500), Math.round(ms), ok ? 1 : 0, now()]);
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function secondsText(ms) {
  if (ms == null) return 'not measured yet';
  return (ms / 1000).toFixed(3) + ' seconds';
}

async function summary() {
  const d = db();
  const out = {};
  for (const [key, base] of Object.entries(BASELINES)) {
    const rows = await d.all('SELECT ms FROM ask_runs WHERE ask_id = ? AND ok = 1 ORDER BY id DESC LIMIT 20', [base.askId]);
    const medianMs = median(rows.map(r => r.ms));
    out[key] = { ...base, runs: rows.length, medianMs, secondsText: secondsText(medianMs) };
  }
  return out;
}

module.exports = { record, summary, secondsText };
