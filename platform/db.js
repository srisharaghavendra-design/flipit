'use strict';

const fs = require('fs');
const path = require('path');
const { DATA } = require('../backend/lib');
const { adapt, toPg, statements, planDriver } = require('./sql');

let singleton = null;

function cacheWrap(sqlite) {
  const cache = new Map();
  function stmt(sql) {
    let s = cache.get(sql);
    if (!s) { s = sqlite.prepare(sql); cache.set(sql, s); }
    return s;
  }
  const api = {
    dialect: 'sqlite',
    close() { sqlite.close(); },
    exec(sql) { sqlite.exec(sql); return Promise.resolve(); },
    all(sql, args = []) { return Promise.resolve(stmt(sql).all(...args)); },
    get(sql, args = []) { return Promise.resolve(stmt(sql).get(...args)); },
    run(sql, args = []) { return Promise.resolve(stmt(sql).run(...args)); },
    insertMany(sql, rows) {
      const st = stmt(sql);
      for (const args of rows) st.run(...args);
      return Promise.resolve(rows.length);
    },
    async tx(fn) {
      if (sqlite.inTransaction) return fn(api);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn(api);
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        try { sqlite.exec('ROLLBACK'); } catch (_) { /* already closed */ }
        throw e;
      }
    }
  };
  return api;
}

function openSqlite() {
  const Database = require('better-sqlite3');
  fs.mkdirSync(DATA, { recursive: true });
  const sqlite = new Database(path.join(DATA, 'platform.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return cacheWrap(sqlite);
}

function openPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.PLATFORM_DATABASE_URL });
  function bind(queryable) {
    return {
      dialect: 'postgres',
      exec(sql) { return queryable.query(adapt(sql, 'postgres')).then(() => {}); },
      all(sql, args = []) { return queryable.query(toPg(sql), args).then(r => r.rows); },
      get(sql, args = []) { return queryable.query(toPg(sql), args).then(r => r.rows[0]); },
      run(sql, args = []) { return queryable.query(toPg(sql), args).then(r => ({ changes: r.rowCount })); },
      async insertMany(sql, rows) {
        const text = toPg(sql);
        for (const args of rows) await queryable.query(text, args);
        return rows.length;
      }
    };
  }
  const api = {
    ...bind(pool),
    close() { return pool.end(); },
    async tx(fn) {
      const client = await pool.connect();
      const q = bind(client);
      try {
        await client.query('BEGIN');
        const out = await fn(q);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* already aborted */ }
        throw e;
      } finally { client.release(); }
    }
  };
  return api;
}

async function migrate(database) {
  await database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const seen = await database.get('SELECT id FROM schema_migrations WHERE id = ?', [id]);
    if (seen) continue;
    const script = statements(adapt(fs.readFileSync(path.join(dir, file), 'utf8'), database.dialect));
    for (const stmt of script) await database.exec(stmt);
    await database.run('INSERT INTO schema_migrations(id, applied_at) VALUES(?, ?)', [id, new Date().toISOString()]);
  }
}

async function open() {
  if (singleton) return singleton;
  const plan = planDriver();
  if (plan.error) throw new Error(plan.error);
  singleton = plan.dialect === 'postgres' ? openPostgres() : openSqlite();
  await migrate(singleton);
  return singleton;
}

function current() {
  if (!singleton) throw new Error('Platform database is not open yet');
  return singleton;
}

module.exports = { open, current, planDriver };
