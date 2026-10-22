'use strict';

// Migrations are written once. SQLite runs them as-is. Postgres gets types and
// placeholders rewritten here, which is the whole of the config swap.
function adapt(sql, dialect) {
  if (dialect !== 'postgres') return sql;
  return String(sql).replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY');
}

function toPg(sql) {
  let n = 0;
  return adapt(sql, 'postgres').replace(/\?/g, () => '$' + (++n));
}

function statements(sql) {
  const cleaned = String(sql).split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === "'") inStr = !inStr;
    if (c === ';' && !inStr) {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
    } else cur += c;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function planDriver(env = process.env) {
  const dialect = String(env.PLATFORM_DB || 'sqlite').toLowerCase();
  if (dialect === 'sqlite') return { dialect };
  if (dialect !== 'postgres') return { dialect, error: 'PLATFORM_DB must be sqlite or postgres' };
  try { require.resolve('pg'); }
  catch { return { dialect, error: 'PLATFORM_DB=postgres requires the pg package. The local demo uses sqlite.' }; }
  if (!env.PLATFORM_DATABASE_URL) return { dialect, error: 'PLATFORM_DATABASE_URL is required when PLATFORM_DB=postgres' };
  return { dialect: 'postgres' };
}

module.exports = { adapt, toPg, statements, planDriver };
