'use strict';

// Email and Webex tags. A free inbound mailbox or a Webex bot posts here.
// The ask runs in a workspace keyed to the sender. Nothing here uses flipit.fyi DNS.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let transport = global.fetch ? global.fetch.bind(global) : null;
function setTransport(fn) { transport = fn; }

function dataDir() { return require('../backend/lib').DATA; }
function feedFile() { return path.join(dataDir(), 'inbound-feed.json'); }
function seenFile() { return path.join(dataDir(), 'inbound-seen.json'); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function feed(tenantId) {
  const rows = readJson(feedFile(), []);
  const list = Array.isArray(rows) ? rows : [];
  if (!tenantId) return list;
  if (tenantId === 'demo') return list.filter(row => !row.tenantId || row.tenantId === 'demo');
  return list.filter(row => row.tenantId === tenantId);
}

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function header(req, name) {
  const value = req.headers[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function allow(envName) {
  return String(process.env[envName] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function addressOf(value) {
  if (!value) return '';
  if (Array.isArray(value)) return addressOf(value[0]);
  if (typeof value === 'object') return addressOf(value.email || value.address || '');
  const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function nameOf(value, email) {
  const item = Array.isArray(value) ? value[0] : value;
  if (item && typeof item === 'object' && item.name) return String(item.name).trim().slice(0, 80);
  const text = typeof item === 'string' ? item : '';
  const named = text.match(/^\s*([^<]+)</);
  if (named && named[1].trim()) return named[1].trim().slice(0, 80);
  return email;
}

function visible(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^>/.test(line) || /^On .+wrote:$/.test(trimmed) || /^-{2,}\s*$/.test(trimmed) || trimmed === '— @mops') break;
    out.push(line);
  }
  return out.join('\n').trim();
}

function collect(value, into) {
  if (!value) return;
  if (Array.isArray(value)) { for (const item of value) collect(item, into); return; }
  if (typeof value === 'object') { collect(value.email || value.address, into); return; }
  const matches = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const match of matches) into.push(match.toLowerCase());
}

function plusSlug(addresses) {
  for (const addr of addresses || []) {
    const match = String(addr).match(/\+([a-z0-9-]+)@/i);
    if (match) return match[1].toLowerCase();
  }
  return '';
}

function askText(subject, text) {
  const body = visible(text);
  const line = (subject + '\n' + body).split(/\r?\n/).map(s => s.trim()).find(s => /@mops/i.test(s));
  return (line || body || subject || '').trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > 1_000_000) { reject(Object.assign(new Error('Request is too large'), { status: 413 })); return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

function send(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function origin(req) {
  const set = String(process.env.MOPS_PUBLIC_URL || process.env.MOPS_PUBLIC || '').replace(/\/$/, '');
  if (set) return set;
  const host = header(req, 'x-forwarded-host') || header(req, 'host') || 'localhost';
  const proto = header(req, 'x-forwarded-proto') || 'https';
  return proto + '://' + host;
}

function roleFor(email) {
  return allow('MOPS_APPROVER_EMAILS').includes(email) ? 'approver' : 'marketer';
}

function parseEmail(body) {
  const msg = body.message || body.data || body;
  const fromRaw = msg.from_ || msg.from || body.from;
  const from = addressOf(fromRaw);
  const subject = String(msg.subject || body.subject || '');
  const text = String(msg.extracted_text || msg.text || msg.textBody || body.text || body.textBody || msg.preview || '');
  const messageId = String(msg.message_id || msg.messageId || body.messageId || body.id || '');
  const eventId = String(body.event_id || body.eventId || messageId);
  const inboxId = String(msg.inbox_id || body.inbox_id || process.env.AGENTMAIL_INBOX_ID || '');
  const eventType = String(body.event_type || body.eventType || 'message.received');
  const to = [];
  collect(msg.to || msg.to_ || body.to, to);
  collect(msg.recipients, to);
  collect(msg.delivered_to || body.delivered_to, to);
  return { from, name: nameOf(fromRaw, from), subject, text, messageId, eventId, inboxId, eventType, to };
}

function note(row) {
  const rows = feed().filter(item => item.id !== row.id);
  rows.unshift(row);
  writeJson(feedFile(), rows.slice(0, 80));
}

function prior(id) {
  const all = readJson(seenFile(), {});
  return all[id] || null;
}

function remember(id, result) {
  const all = readJson(seenFile(), {});
  all[id] = result;
  const keys = Object.keys(all);
  if (keys.length > 200) delete all[keys[0]];
  writeJson(seenFile(), all);
}

async function applyAsk({ email, name, text, channel, source, messageId, tenant, role }) {
  const sandbox = require('../backend/sandbox');
  const dir = tenant ? require('./workspace').dirOf(tenant.id) : await sandbox.senderDir(email);
  const token = tenant ? '' : sandbox.signWorkspace(email);
  const run = async () => {
    const platform = require('./index');
    await platform.ensure();
    const brain = require('./brain');
    const out = await brain.ask({ text, channel, actor: name || email, role: role || roleFor(email) });
    const reply = out.reply || out.error || 'The ask did not match.';
    const db = require('./db').current();
    await require('./log').append(db, {
      entity: 'ask_runs',
      entityId: String(messageId || email).slice(0, 80),
      op: 'insert',
      actor: name || email,
      channel,
      sourceMessage: source,
      why: `Tagged @mops from ${channel}. ${reply}`.slice(0, 500)
    });
    if (db.checkpoint) db.checkpoint();
    return { reply, matched: out.matched !== false && out.ok !== false, askId: out.askId || '', token };
  };
  if (!tenant) return sandbox.run(dir, run);
  return sandbox.run(dir, () => require('./scope').bind({
    id: tenant.id, name: tenant.name, color: tenant.color, inbound: tenant.inbound
  }, run));
}

async function postJson(url, opts) {
  if (!transport) throw new Error('This process has no fetch.');
  const res = await transport(url, opts);
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (e) { body = { raw: text }; }
  return { status: res.status, body };
}

async function deliverEmail(parsed, text) {
  const key = String(process.env.AGENTMAIL_API_KEY || '');
  const inbox = parsed.inboxId || String(process.env.AGENTMAIL_INBOX_ID || '');
  if (!key || !inbox || !parsed.messageId) return { ok: false, reason: 'Mail reply is not configured.' };
  const sent = await postJson('https://api.agentmail.to/v0/inboxes/' + encodeURIComponent(inbox) + '/messages/' + encodeURIComponent(parsed.messageId) + '/reply', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return { ok: sent.status >= 200 && sent.status < 300, status: sent.status, body: sent.body };
}

async function deliverWebex({ roomId, messageId, text, token }) {
  const key = token || String(process.env.WEBEX_BOT_TOKEN || '');
  if (!key || !roomId) return { ok: false, reason: 'Webex reply is not configured.' };
  const sent = await postJson('https://webexapis.com/v1/messages', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ roomId, parentId: messageId || undefined, markdown: text })
  });
  return { ok: sent.status >= 200 && sent.status < 300, status: sent.status, body: sent.body };
}

function replyText(reply, link) {
  return reply + '\n\nOpen this workspace: ' + link + '\n\n— @mops';
}

async function workspaceLink(req, tenant, email) {
  const catalog = require('./catalog');
  if (!catalog.member(tenant.id, email)) return origin(req) + '/signup';
  const token = crypto.randomBytes(24).toString('base64url');
  catalog.saveMagic(token, tenant.id, email);
  return origin(req) + '/api/workspace/magic?token=' + encodeURIComponent(token);
}

async function runWorkspaceEmail(parsed, req, slug) {
  const catalog = require('./catalog');
  const tenant = catalog.bySlug(slug);
  if (!tenant) return { status: 404, body: { ok: false, error: 'No workspace uses that address.' } };
  if (!parsed.from || !parsed.messageId) return { status: 400, body: { ok: false, error: 'The email needs a sender and a message id.' } };
  const member = catalog.member(tenant.id, parsed.from);
  if (!member && !allow('MOPS_EMAIL_ALLOWLIST').includes(parsed.from)) return { status: 403, body: { ok: false, error: 'That sender is not on the allow list.' } };
  const seenId = 'email:' + (parsed.eventId || parsed.messageId);
  const again = prior(seenId);
  if (again) return { status: 200, body: Object.assign({}, again, { idempotent: true }) };
  const text = askText(parsed.subject, parsed.text);
  const applied = await applyAsk({
    email: parsed.from,
    name: parsed.name,
    text,
    channel: 'Email',
    source: `Email from ${parsed.from}${parsed.subject ? ', “' + parsed.subject.slice(0, 120) + '”' : ''}`,
    messageId: parsed.messageId,
    tenant,
    role: member && member.role === 'approver' ? 'approver' : 'marketer'
  });
  const link = await workspaceLink(req, tenant, parsed.from);
  const outgoing = replyText(applied.reply, link);
  let delivered = { ok: false };
  try { delivered = await deliverEmail(parsed, outgoing); } catch (e) { delivered = { ok: false, reason: e.message }; }
  const result = { ok: true, channel: 'Email', from: parsed.from, reply: applied.reply, link, askId: applied.askId, delivered: !!delivered.ok, idempotent: false, workspace: tenant.slug };
  remember(seenId, result);
  note({
    id: seenId,
    at: new Date().toISOString(),
    channel: 'Email',
    actor: parsed.from,
    source: parsed.subject || parsed.messageId,
    message: applied.reply,
    why: `Tagged @mops from email. ${parsed.subject || 'No subject.'}`,
    tenantId: tenant.id
  });
  return { status: 200, body: result };
}

async function runEmail(parsed, req) {
  const own = String(process.env.AGENTMAIL_INBOX_ID || '').toLowerCase();
  if (own && parsed.from === own) return { status: 200, body: { ok: true, ignored: true, reason: 'Own message.' } };
  if (parsed.eventType && parsed.eventType !== 'message.received') return { status: 200, body: { ok: true, ignored: true } };
  const slug = plusSlug(parsed.to);
  if (slug) return runWorkspaceEmail(parsed, req, slug);
  if (!parsed.from || !parsed.messageId) return { status: 400, body: { ok: false, error: 'The email needs a sender and a message id.' } };
  if (!allow('MOPS_EMAIL_ALLOWLIST').includes(parsed.from)) return { status: 403, body: { ok: false, error: 'That sender is not on the allow list.' } };
  const seenId = 'email:' + (parsed.eventId || parsed.messageId);
  const again = prior(seenId);
  if (again) return { status: 200, body: Object.assign({}, again, { idempotent: true }) };
  const text = askText(parsed.subject, parsed.text);
  const applied = await applyAsk({
    email: parsed.from,
    name: parsed.name,
    text,
    channel: 'Email',
    source: `Email from ${parsed.from}${parsed.subject ? ', “' + parsed.subject.slice(0, 120) + '”' : ''}`,
    messageId: parsed.messageId
  });
  const link = origin(req) + '/?ws=' + encodeURIComponent(applied.token);
  const outgoing = replyText(applied.reply, link);
  let delivered = { ok: false };
  try { delivered = await deliverEmail(parsed, outgoing); } catch (e) { delivered = { ok: false, reason: e.message }; }
  const result = {
    ok: true,
    channel: 'Email',
    from: parsed.from,
    reply: applied.reply,
    link,
    askId: applied.askId,
    delivered: !!delivered.ok,
    idempotent: false
  };
  remember(seenId, result);
  note({
    id: seenId,
    at: new Date().toISOString(),
    channel: 'Email',
    actor: parsed.from,
    source: parsed.subject || parsed.messageId,
    message: applied.reply,
    why: `Tagged @mops from email. ${parsed.subject || 'No subject.'}`
  });
  return { status: 200, body: result };
}

async function loadWebexMessage(data, tenant) {
  if (data.text) return data;
  const token = (tenant && tenant.webex_token) || String(process.env.WEBEX_BOT_TOKEN || '');
  if (!token || !data.id) return data;
  const got = await postJson('https://webexapis.com/v1/messages/' + encodeURIComponent(data.id), {
    method: 'GET',
    headers: { authorization: 'Bearer ' + token }
  });
  return Object.assign({}, data, got.body || {});
}

async function runWebex(payload, req, tenant) {
  const data = await loadWebexMessage(payload.data || {}, tenant);
  const from = addressOf(data.personEmail || data.person_email);
  const bot = String((tenant && tenant.webex_email) || process.env.WEBEX_BOT_EMAIL || '').toLowerCase();
  if (bot && from === bot) return { status: 200, body: { ok: true, ignored: true, reason: 'Own message.' } };
  const text = String(data.text || data.markdown || '');
  if (!/@mops/i.test(text)) return { status: 200, body: { ok: true, ignored: true, reason: 'Not a tag.' } };
  if (!from || !data.id) return { status: 400, body: { ok: false, error: 'The Webex message needs a sender and an id.' } };
  const member = tenant ? require('./catalog').member(tenant.id, from) : null;
  if (!(member || allow('MOPS_WEBEX_ALLOWLIST').includes(from))) return { status: 403, body: { ok: false, error: 'That sender is not on the allow list.' } };
  const seenId = 'webex:' + data.id;
  const again = prior(seenId);
  if (again) return { status: 200, body: Object.assign({}, again, { idempotent: true }) };
  const applied = await applyAsk({
    email: from,
    name: from,
    text,
    channel: 'Webex',
    source: `Webex from ${from}`,
    messageId: data.id,
    tenant: tenant || null,
    role: member ? (member.role === 'approver' ? 'approver' : 'marketer') : undefined
  });
  const link = tenant ? await workspaceLink(req, tenant, from) : origin(req) + '/?ws=' + encodeURIComponent(applied.token);
  const outgoing = replyText(applied.reply, link);
  let delivered = { ok: false };
  try { delivered = await deliverWebex({ roomId: data.roomId, messageId: data.id, text: outgoing, token: tenant && tenant.webex_token }); } catch (e) { delivered = { ok: false, reason: e.message }; }
  const result = {
    ok: true,
    channel: 'Webex',
    from,
    reply: applied.reply,
    link,
    askId: applied.askId,
    delivered: !!delivered.ok,
    roomId: data.roomId || '',
    idempotent: false
  };
  remember(seenId, result);
  note({
    id: seenId,
    at: new Date().toISOString(),
    channel: 'Webex',
    actor: from,
    source: 'Webex',
    message: applied.reply,
    why: 'Tagged @mops from Webex.',
    tenantId: tenant ? tenant.id : ''
  });
  return { status: 200, body: result };
}

function sparkOk(raw, sig) {
  const secret = String(process.env.MOPS_WEBEX_SECRET || '');
  if (!secret || !sig) return false;
  const want = crypto.createHmac('sha1', secret).update(raw).digest('hex');
  return same(want, String(sig).toLowerCase()) || same(want, sig);
}

async function http(req, res, u) {
  try {
    const pathname = u.pathname;
    const raw = await readBody(req);
    if (pathname === '/api/inbound/email') {
      const secret = String(process.env.INBOUND_WEBHOOK_SECRET || '');
      const got = header(req, 'x-mops-inbound-secret') || header(req, 'authorization').replace(/^Bearer\s+/i, '');
      if (!same(got, secret)) return send(res, 401, { ok: false, error: 'Bad inbound secret.' });
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { ok: false, error: 'That was not valid JSON.' }); }
      const result = await runEmail(parseEmail(body), req);
      return send(res, result.status, result.body);
    }
    if (pathname === '/api/inbound/webex') {
      const sig = header(req, 'x-spark-signature');
      const tenant = sparkOk(raw, sig) ? null : require('./catalog').matchWebex(raw, sig);
      if (!sparkOk(raw, sig) && !tenant) return send(res, 401, { ok: false, error: 'Bad signature.' });
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { return send(res, 400, { ok: false, error: 'That was not valid JSON.' }); }
      if (body.resource && body.resource !== 'messages') return send(res, 200, { ok: true, ignored: true });
      if (body.event && body.event !== 'created') return send(res, 200, { ok: true, ignored: true });
      const result = await runWebex(body, req, tenant);
      return send(res, result.status, result.body);
    }
    return send(res, 404, { ok: false, error: 'Unknown inbound route.' });
  } catch (e) {
    console.error('inbound', e && e.message || e);
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.message || 'The inbound request failed.' });
  }
}

module.exports = { http, feed, parseEmail, setTransport, askText, visible };
