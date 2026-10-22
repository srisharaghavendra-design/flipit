// Default and maximum size for the in-app scale test.
// A small host must not try to seed a million contacts. Overrides are env vars.
const os = require('os');

function positive(value, fallback) {
  const n = Math.floor(+value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function limits(env = process.env, totalBytes = os.totalmem()) {
  const gb = totalBytes / (1024 ** 3);
  const vercel = env.VERCEL === '1';
  let defC = 50000, defS = 5000, maxC = 100000, maxS = 10000;
  let label = `This machine has ${gb.toFixed(1)} GB of RAM.`;
  if (vercel) {
    defC = 2000; defS = 200; maxC = 8000; maxS = 800;
    label = 'Vercel Hobby: 2 GB memory and a 300 second limit. This run is sized to finish inside that.';
  } else if (gb < 1.5) { defC = 5000; defS = 500; maxC = 25000; maxS = 2500; }
  else if (gb < 3) { defC = 20000; defS = 2000; maxC = 50000; maxS = 5000; }
  if (!vercel && env.LOAD_ALLOW_MILLION === '1') { maxC = 1000000; maxS = 100000; }
  const maxContacts = positive(env.LOAD_MAX_CONTACTS, maxC);
  const maxSends = positive(env.LOAD_MAX_SENDS, maxS);
  return {
    defaultContacts: Math.min(positive(env.LOAD_DEFAULT_CONTACTS, defC), maxContacts),
    defaultSends: Math.min(positive(env.LOAD_DEFAULT_SENDS, defS), maxSends),
    maxContacts,
    maxSends,
    memoryGb: +gb.toFixed(2),
    vercel,
    label
  };
}

function resolve(opts = {}, lim = limits()) {
  const askedC = opts.contacts == null || opts.contacts === '' ? null : Math.floor(+opts.contacts);
  const askedS = opts.sends == null || opts.sends === '' ? null : Math.floor(+opts.sends);
  const contacts = Math.min(Math.max(1, Number.isFinite(askedC) && askedC > 0 ? askedC : lim.defaultContacts), lim.maxContacts);
  const sends = Math.min(Math.max(1, Number.isFinite(askedS) && askedS > 0 ? askedS : lim.defaultSends), lim.maxSends);
  const capped = (Number.isFinite(askedC) && askedC > contacts) || (Number.isFinite(askedS) && askedS > sends);
  return { contacts, sends, capped, limits: lim };
}

module.exports = { limits, resolve };
