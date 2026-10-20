'use strict';

// Per-browser sandbox for the passcode preview. Each visitor's writes are a log.
// A new instance rebuilds that visitor's book by replaying the log onto a fresh seed.
// Visitors do not share a database. The log lives in the browser and expires after two hours.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const BOX_MS = 2 * 60 * 60 * 1000;
const LOG_CAP = 80;
const EMPTY = crypto.createHash('sha256').update('mops-box-v1').digest('hex').slice(0, 24);
let templatePromise = null;
const buildLocks = new Map();
let lastSweep = 0;

function enabled() { return String(process.env.DEMO_PASSCODE || '').trim().length > 0; }
function currentDir() { return als.getStore() || null; }
function run(dir, fn) { return dir ? als.run(dir, fn) : fn(); }
function root() { return path.join(require('./lib').DATA, 'boxes'); }
function templateDir() { return path.join(root(), 'template'); }
function cacheDir(hash) { return path.join(root(), 'cache', hash); }

function fold(prev, op) {
  return crypto.createHash('sha256').update(prev + '\n' + op.m + '\n' + op.u + '\n' + (op.b || '')).digest('hex').slice(0, 24);
}

function copyDb(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const srcFile = path.join(srcDir, 'platform.db');
  const destFile = path.join(destDir, 'platform.db');
  try {
    const live = require('../platform/db').peek(srcDir);
    if (live && live.checkpoint) live.checkpoint();
  } catch (e) { /* not open yet */ }
  fs.copyFileSync(srcFile, destFile);
  for (const ext of ['-wal', '-shm']) {
    const extra = destFile + ext;
    if (fs.existsSync(extra)) fs.rmSync(extra);
  }
}

async function ensureTemplate() {
  const dir = templateDir();
  if (fs.existsSync(path.join(dir, 'platform.db'))) return dir;
  if (!templatePromise) {
    templatePromise = als.run(dir, async () => {
      fs.mkdirSync(dir, { recursive: true });
      const db = require('../platform/db');
      const seed = require('../platform/seed');
      const database = await db.open();
      await seed.run(database);
      database.checkpoint();
      return dir;
    }).catch((e) => { templatePromise = null; throw e; });
  }
  return templatePromise;
}

async function materializeEmpty() {
  await ensureTemplate();
  const dir = cacheDir(EMPTY);
  if (fs.existsSync(path.join(dir, 'platform.db'))) return dir;
  let pending = buildLocks.get(EMPTY);
  if (!pending) {
    pending = (async () => { copyDb(templateDir(), dir); return dir; })();
    buildLocks.set(EMPTY, pending);
  }
  try { return await pending; } finally { buildLocks.delete(EMPTY); }
}

function tee(req) {
  if (req._sandboxTee) return;
  req._sandboxTee = true;
  const orig = req.on.bind(req);
  const chunks = [];
  req.on = function (ev, fn) {
    if (ev === 'data') return orig(ev, (c) => { chunks.push(Buffer.from(c)); fn(c); });
    if (ev === 'end') return orig(ev, () => { req._sandboxBody = Buffer.concat(chunks).toString('utf8'); if (fn) fn(); });
    return orig(ev, fn);
  };
}

function headerMap(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return {};
  return Object.assign({}, h);
}

function safeHash(raw) {
  const h = String(raw || '').trim();
  return /^[a-f0-9]{24}$/.test(h) ? h : '';
}
function requestedHash(req) {
  const header = safeHash(req.headers['x-mops-sandbox']);
  if (header) return header;
  try {
    return safeHash(new URL(req.url || '/', 'http://sandbox.local').searchParams.get('box'));
  } catch (e) { return ''; }
}

async function prepare(req, res) {
  if (!enabled()) return null;
  maybeSweep();
  await materializeEmpty();
  const header = requestedHash(req);
  const prev = header || EMPTY;
  if (header && !fs.existsSync(path.join(cacheDir(prev), 'platform.db'))) {
    res.writeHead(409, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-mops-replay': '1' });
    res.end(JSON.stringify({ ok: false, error: 'Replay this browser’s sandbox.', replay: true }));
    return false;
  }
  const method = String(req.method || 'GET').toUpperCase();
  const writing = method !== 'GET' && method !== 'HEAD';
  if (!writing) return cacheDir(prev);
  const dest = path.join(root(), 'work', crypto.randomBytes(6).toString('hex'));
  copyDb(cacheDir(prev), dest);
  tee(req);
  const orig = res.writeHead.bind(res);
  res.writeHead = function (code, h) {
    const headers = headerMap(h);
    if (code < 400) {
      const op = { m: method, u: req.url || '/', b: req._sandboxBody || '' };
      const next = fold(prev, op);
      try {
        const db = require('../platform/db');
        if (als.getStore() === dest) db.current().checkpoint();
        fs.mkdirSync(cacheDir(next), { recursive: true });
        fs.copyFileSync(path.join(dest, 'platform.db'), path.join(cacheDir(next), 'platform.db'));
        headers['x-mops-sandbox-next'] = next;
      } catch (e) { console.error('sandbox publish', e && e.message || e); }
    }
    return orig(code, headers);
  };
  return dest;
}

function fakeReq(op) {
  const body = op.b || '';
  let sent = false;
  const req = {
    method: op.m,
    url: op.u,
    headers: { 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    mopsUser: null,
    on(ev, fn) {
      if (sent) return;
      if (ev === 'data' && body) fn(body);
      if (ev === 'end') { sent = true; fn(); }
    }
  };
  if (op.user) {
    try {
      const auth = require('./auth');
      req.mopsUser = auth.USERS.find(u => u.id === op.user) || null;
    } catch (e) { req.mopsUser = null; }
  }
  return req;
}

function fakeRes() {
  const res = {
    headersSent: false,
    writeHead(code, h) { res.status = code; res.headers = h || {}; res.headersSent = true; },
    setHeader() {},
    write() { return true; },
    end() { res.headersSent = true; }
  };
  return res;
}

async function replay(dir, ops) {
  const platform = require('../platform');
  await als.run(dir, async () => {
    await platform.ensure();
    for (const op of ops) {
      const u = new URL(op.u, 'http://sandbox.local');
      await platform.handle(fakeReq(op), fakeRes(), u);
    }
    require('../platform/db').current().checkpoint();
  });
}

async function sync(log) {
  const ops = [];
  let prev = EMPTY;
  const list = Array.isArray(log) ? log.slice(0, LOG_CAP) : [];
  for (const op of list) {
    if (!op || !op.m || !op.u) continue;
    const norm = { m: String(op.m).toUpperCase(), u: String(op.u), b: String(op.b || ''), user: op.user || '' };
    prev = fold(prev, norm);
    ops.push(norm);
  }
  const dir = cacheDir(prev);
  if (!fs.existsSync(path.join(dir, 'platform.db'))) {
    let pending = buildLocks.get(prev);
    if (!pending) {
      pending = (async () => {
        await ensureTemplate();
        copyDb(templateDir(), dir);
        if (ops.length) await replay(dir, ops);
        return dir;
      })();
      buildLocks.set(prev, pending);
    }
    try { await pending; } finally { buildLocks.delete(prev); }
  }
  sweep();
  return { ok: true, hash: prev, enabled: true, expiresMs: BOX_MS };
}

function sweep() {
  const now = Date.now();
  for (const bucket of ['cache', 'work']) {
    const dir = path.join(root(), bucket);
    if (!fs.existsSync(dir)) continue;
    const limit = bucket === 'work' ? 15 * 60 * 1000 : BOX_MS;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > limit) fs.rmSync(full, { recursive: true, force: true });
      } catch (e) { /* a request is using it */ }
    }
  }
}
function maybeSweep() {
  const now = Date.now();
  if (now - lastSweep < 30000) return;
  lastSweep = now;
  sweep();
}

function trace() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'platform', 'ops-trace.json'), 'utf8'));
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.events)) return data.events;
    return [];
  } catch (e) { return []; }
}

module.exports = { enabled, currentDir, run, prepare, sync, EMPTY, BOX_MS, trace, fold };
