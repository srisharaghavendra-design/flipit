// One process the host watches. It starts every service, then re-seeds fictional data.
const { start } = require('./stack');

const port = String(process.env.PORT || process.env.MOPS_PORT || '8787');
process.env.MOPS_PORT = process.env.MOPS_PORT || port;
process.env.MOPS_INTERNAL_SMTP = process.env.MOPS_INTERNAL_SMTP || '1';

(async () => {
  if (!process.env.DEMO_PASSCODE) console.warn('\n  WARNING: DEMO_PASSCODE is not set. Set it before sharing the public URL.\n');
  const stack = await start();
  const stop = () => { try { stack.stop(); } catch {} setTimeout(() => process.exit(0), 400); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const base = 'http://127.0.0.1:' + process.env.MOPS_PORT;
  if (process.env.MOPS_RESEED === '0') { console.log('@mops listening on :' + process.env.MOPS_PORT + ' (kept existing data)'); return; }
  const app = await fetch(base + '/api/reset', { method: 'POST' });
  if (!app.ok) throw new Error('app re-seed failed');
  const r = await fetch(base + '/api/engine/reset', { method: 'POST' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new Error(body.error || 'seed failed');
  console.log(`@mops ready on :${process.env.MOPS_PORT} · re-seeded · CRM loaded ${body.crmLoaded} records · mail stays on the internal catcher`);
})().catch(e => { console.error(e); process.exit(1); });
