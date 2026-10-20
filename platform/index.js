'use strict';

const { open } = require('./db');
const seed = require('./seed');
const data = require('./data');
const engage = require('./engage');
const crm = require('./crm');
const spend = require('./spend');
const insights = require('./insights');
const brain = require('./brain');
const metrics = require('./metrics');
const pages = require('./pages');
const policy = require('./policy');
const why = require('./why');
const { MODULES } = require('./modules');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const ready = new Map();
let workerOn = false;

function ensure() {
  let key = '';
  try { key = require('../backend/sandbox').currentDir() || ''; } catch (e) { key = ''; }
  if (key && !require('./db').peek(key)) ready.delete(key);
  if (!ready.has(key)) {
    ready.set(key, (async () => {
      const database = await open();
      await seed.run(database);
      const sandbox = require('../backend/sandbox');
      if (!workerOn && !sandbox.enabled() && process.env.VERCEL !== '1') {
        workerOn = true;
        require('./live').startWorker();
      }
      return database;
    })().catch((e) => { ready.delete(key); throw e; }));
  }
  return ready.get(key);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > 1_000_000) { reject(Object.assign(new Error('Request is too large'), { status: 413 })); return; }
      b += c;
    });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  const ct = req.headers['content-type'] || '';
  if (ct.includes('json')) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function json(res, code, payload, started) {
  const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload, ms: payload.ms == null ? ms : payload.ms } : payload;
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function actor(req) { return (req.mopsUser && req.mopsUser.name) || 'Maria Alvarez'; }

async function handle(req, res, u) {
  const started = process.hrtime.bigint();
  const method = req.method || 'GET';
  const p = (u.pathname || '/').replace(/\/$/, '') || '/';
  try {
    await ensure();
    if (method === 'GET' && p === '/platform') return html(res, pages.home());
    if (method === 'GET' && p === '/platform/data') return html(res, pages.dataPage());
    if (method === 'GET' && p === '/platform/engage') return html(res, await pages.engagePage());
    if (method === 'GET' && p === '/platform/ask') return html(res, pages.askPage());
    if (method === 'GET' && p === '/platform/crm') return html(res, pages.crmPage());
    if (method === 'GET' && p === '/platform/spend') return html(res, pages.spendPage());
    if (method === 'GET' && p === '/platform/insights') return html(res, pages.insightsPage());
    if (method === 'GET' && p === '/platform/brain') return html(res, pages.brainPage());
    if (method === 'GET' && p === '/platform/architecture') return html(res, pages.architecture());
    if (method === 'GET' && p === '/platform/ops') return html(res, pages.opsPage());
    if (method === 'GET' && p === '/platform/samples/chicago-attendees.xlsx') {
      const buf = crm.sample.buffer();
      res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="chicago-attendees.xlsx"', 'cache-control': 'no-store' });
      return res.end(buf);
    }
    if (method === 'GET' && p === '/api/platform/modules') return json(res, 200, { modules: MODULES }, started);
    if (method === 'GET' && p === '/api/platform/metrics') return json(res, 200, await metrics.summary(), started);
    if (method === 'POST' && p === '/api/platform/ask') {
      const body = await parseBody(req);
      const out = await brain.ask({ text: body.text, channel: body.channel || 'App', actor: actor(req), role: (req.mopsUser && req.mopsUser.role) || 'marketer' });
      return json(res, out.ok === false ? 400 : 200, out, started);
    }
    if (method === 'GET' && p === '/api/platform/data/schema') return json(res, 200, data.schema(), started);
    if (method === 'GET' && p === '/api/platform/data/counts') return json(res, 200, await data.counts(), started);
    if (method === 'GET' && p === '/api/platform/data/tables') return json(res, 200, { tables: await data.tables() }, started);
    if (method === 'GET' && p === '/api/platform/data/log') return json(res, 200, await data.log({ limit: u.searchParams.get('limit'), q: u.searchParams.get('q') || '' }), started);
    if (method === 'GET' && p === '/api/platform/data/emailable') return json(res, 200, await data.emailable({ state: u.searchParams.get('state') || 'Illinois', country: u.searchParams.get('country') || 'United States' }), started);
    if (method === 'GET' && p === '/api/platform/data/consent') return json(res, 200, await data.consentByRegion(), started);
    if (method === 'POST' && p === '/api/platform/data/held') {
      const body = await parseBody(req);
      return json(res, 200, await data.held({ country: body.country || 'Germany', actor: actor(req), channel: body.channel || 'App', sourceMessage: body.text || '' }), started);
    }
    let m;
    if (method === 'GET' && (m = p.match(/^\/api\/platform\/data\/tables\/([a-z_]+)$/))) return json(res, 200, await data.browse(m[1], { q: u.searchParams.get('q') || '', limit: u.searchParams.get('limit'), offset: u.searchParams.get('offset') }), started);
    if (method === 'GET' && (m = p.match(/^\/api\/platform\/data\/campaigns\/([A-Za-z0-9-]+)$/))) return json(res, 200, await data.campaign(m[1]), started);
    if (method === 'GET' && p === '/api/platform/engage/segments') return json(res, 200, { segments: await engage.listSegments() }, started);
    if (method === 'POST' && p === '/api/platform/engage/segments') {
      const body = await parseBody(req);
      return json(res, 200, await engage.saveSegment({ ...body, actor: actor(req), channel: body.channel || 'App', sourceMessage: body.sourceMessage || '' }), started);
    }
    if (method === 'POST' && p === '/api/platform/engage/segments/preview') {
      const body = await parseBody(req);
      return json(res, 200, await engage.preview(body.rules, body.limit || 8), started);
    }
    if (method === 'GET' && p === '/api/platform/engage/templates') return json(res, 200, { templates: await engage.listTemplates() }, started);
    if (method === 'POST' && p === '/api/platform/engage/templates') {
      const body = await parseBody(req);
      return json(res, 200, await engage.saveTemplate({ ...body, actor: actor(req), channel: body.channel || 'App', sourceMessage: body.sourceMessage || '' }), started);
    }
    if (method === 'GET' && p === '/api/platform/engage/sends') return json(res, 200, { sends: await engage.sendLog() }, started);
    if (method === 'POST' && p === '/api/platform/engage/sends') {
      const body = await parseBody(req);
      return json(res, 200, await engage.send({ ...body, actor: actor(req), channel: body.channel || 'App' }), started);
    }
    if (method === 'GET' && (m = p.match(/^\/api\/platform\/engage\/sends\/([A-Za-z0-9-]+)$/))) return json(res, 200, await engage.getSend(m[1]), started);
    if (method === 'POST' && (m = p.match(/^\/api\/platform\/engage\/sends\/([A-Za-z0-9-]+)\/simulate$/))) {
      const body = await parseBody(req);
      return json(res, 200, await engage.simulate(m[1], body), started);
    }
    if (method === 'GET' && p === '/api/platform/engage/scores') return json(res, 200, await engage.scores({ segmentId: u.searchParams.get('segment') || undefined, state: u.searchParams.get('state') || undefined }), started);
    if (method === 'GET' && p === '/api/platform/engage/journeys') return json(res, 200, { journeys: await engage.listJourneys() }, started);
    if (method === 'POST' && (m = p.match(/^\/api\/platform\/engage\/journeys\/([A-Za-z0-9-]+)\/enroll$/))) {
      const body = await parseBody(req);
      return json(res, 200, await engage.enrollClickers({ journeyId: m[1], campaignId: body.campaignId, actor: actor(req), channel: body.channel || 'App', sourceMessage: body.text || '' }), started);
    }
    if (method === 'POST' && (m = p.match(/^\/api\/platform\/engage\/journeys\/([A-Za-z0-9-]+)\/tick$/))) return json(res, 200, await engage.tickJourney(m[1], { actor: actor(req) }), started);
    if (method === 'GET' && p === '/api/platform/crm/objects') return json(res, 200, { objects: await crm.listObjects(u.searchParams.get('campaign') || 'CAMP-CHI') }, started);
    if (method === 'GET' && p === '/api/platform/crm/queue') return json(res, 200, await crm.failures(), started);
    if (method === 'GET' && p === '/api/platform/crm/owners') return json(res, 200, await crm.chicagoAccounts(), started);
    if (method === 'GET' && p === '/api/platform/crm/uploads') return json(res, 200, { uploads: await crm.listUploads(u.searchParams.get('campaign') || 'CAMP-CHI') }, started);
    if (method === 'POST' && p === '/api/platform/crm/uploads') {
      const body = await parseBody(req);
      const buffer = body.file ? Buffer.from(String(body.file), 'base64') : undefined;
      return json(res, 200, await crm.upload({ filename: body.filename, buffer: buffer && buffer.length ? buffer : undefined, campaignId: body.campaignId || 'CAMP-CHI', actor: actor(req), channel: body.channel || 'App', sourceMessage: body.text || '', idempotencyKey: body.idempotencyKey }), started);
    }
    if (method === 'POST' && p === '/api/platform/crm/sync') {
      const body = await parseBody(req);
      return json(res, 200, await crm.syncCampaign({ campaignId: body.campaignId || 'CAMP-CHI', actor: actor(req), channel: body.channel || 'App', sourceMessage: body.text || '' }), started);
    }
    if (method === 'GET' && p === '/api/platform/spend/packets') return json(res, 200, { packets: await spend.packets() }, started);
    if (method === 'GET' && p === '/api/platform/spend/actuals') return json(res, 200, { rows: await spend.actuals(), americas: await spend.remaining('Americas') }, started);
    if (method === 'POST' && p === '/api/platform/spend/budgets') {
      const body = await parseBody(req);
      return json(res, 200, await spend.file({ ...body, actor: actor(req), channel: body.channel || 'App' }), started);
    }
    if (method === 'POST' && p === '/api/platform/spend/approve') {
      const body = await parseBody(req);
      return json(res, 200, await spend.approve({ campaignId: body.campaignId || 'CAMP-CHI', actor: actor(req), role: (req.mopsUser && req.mopsUser.role) || 'marketer', channel: body.channel || 'App', sourceMessage: body.text || '' }), started);
    }
    if (method === 'POST' && p === '/api/platform/spend/sow') {
      const body = await parseBody(req);
      return json(res, 200, await spend.answer({ campaignId: body.campaignId || 'CAMP-CHI', answers: body.answers || body, actor: actor(req), channel: body.channel || 'App', sourceMessage: body.text || '' }), started);
    }
    if (method === 'GET' && p === '/api/platform/insights/dashboard') return json(res, 200, await insights.dashboard(u.searchParams.get('region') || ''), started);
    if (method === 'GET' && p === '/api/platform/brain/policy') return json(res, 200, { rules: policy.RULES, chicago: policy.explain(180000) }, started);
    if (method === 'GET' && p === '/api/platform/brain/why') return json(res, 200, await why.feed({ q: u.searchParams.get('q') || '', limit: u.searchParams.get('limit') || 40 }), started);
    if (method === 'GET' && p === '/api/platform/ops/snapshot') return json(res, 200, await require('./live').snapshot(), started);
    if (method === 'POST' && p === '/api/platform/ops/demo') {
      const body = await parseBody(req);
      const live = require('./live');
      const sandbox = require('../backend/sandbox');
      const paced = sandbox.enabled() || process.env.VERCEL === '1';
      const armed = await live.armDemo({
        spanMs: paced ? 0 : (body.spanMs == null ? 60000 : Number(body.spanMs)),
        actor: actor(req),
        channel: body.channel || 'App'
      });
      if (!paced) return json(res, 200, armed, started);
      const database = require('./db').current();
      const before = await database.get('SELECT COALESCE(MAX(id), 0) AS n FROM ops_events');
      try {
        await live.drain();
      } catch (e) {
        console.error('ops drain', e && e.message || e);
        return json(res, 200, { ...armed, paced: true, fallback: true, events: sandbox.trace(), snapshot: await live.snapshot().catch(() => ({})) }, started);
      }
      const events = await database.all('SELECT id, at, service, kind, message, actor, channel, source, why FROM ops_events WHERE id > ? ORDER BY id', [before.n]);
      const snapshot = await live.snapshot();
      return json(res, 200, { ...armed, paced: true, events: events.length ? events : sandbox.trace(), snapshot }, started);
    }
    if (method === 'POST' && p === '/api/platform/ops/tick') {
      const live = require('./live');
      const stepped = await live.tick();
      const snapshot = await live.snapshot();
      return json(res, 200, { ...snapshot, stepped }, started);
    }
    if (method === 'GET' && p === '/platform/ops-trace.json') {
      return json(res, 200, { events: require('../backend/sandbox').trace() }, started);
    }
    if (method === 'GET' && p === '/api/platform/ops/stream') return require('./live').stream(req, res);
    if (method === 'POST' && p === '/api/platform/reset') return json(res, 200, await seed.reset(require('./db').current()), started);
    if (method === 'GET' && (m = p.match(/^\/api\/platform\/insights\/reports\/(weekly|monthly)\.(pptx|pdf)$/))) {
      const region = u.searchParams.get('region') || (m[1] === 'monthly' ? 'portfolio' : 'Americas');
      const built = await insights.build(m[1], region);
      const pdf = m[2] === 'pdf';
      const buf = pdf ? built.pdf : built.pptx;
      const name = pdf ? built.pdfName : built.pptxName;
      const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      res.writeHead(200, { 'content-type': type, 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' });
      return res.end(buf);
    }
    json(res, 404, { ok: false, error: 'Unknown platform route' }, started);
  } catch (e) {
    if (e instanceof SyntaxError) return json(res, 400, { ok: false, error: 'That was not valid JSON.' }, started);
    const code = e.status || 500;
    if (code >= 500) console.error('platform', e);
    if (!res.headersSent) json(res, code >= 500 ? 500 : code, { ok: false, error: e.message || 'The platform request failed.' }, started);
  }
}

async function publicRoute(req, res, u) {
  const p = u.pathname || '/';
  try {
    await ensure();
    let m;
    if ((m = p.match(/^\/platform\/t\/o\/([^/]+)$/))) {
      await engage.mark(decodeURIComponent(m[1]), 'open', 'Recorded an open from the tracking pixel.');
      res.writeHead(200, { 'content-type': 'image/gif', 'cache-control': 'no-store' });
      return res.end(PIXEL);
    }
    if ((m = p.match(/^\/platform\/t\/c\/([^/]+)$/))) {
      const token = decodeURIComponent(m[1]);
      await engage.mark(token, 'click', 'Recorded a click from the redirect.');
      const rec = await require('./db').current().get('SELECT send_id FROM send_recipients WHERE token = ?', [token]);
      let to = '/platform';
      if (rec) {
        const page = await require('./db').current().get('SELECT p.slug FROM pages p JOIN sends s ON s.campaign_id = p.campaign_id WHERE s.id = ?', [rec.send_id]);
        if (page) to = '/platform/p/' + page.slug;
      }
      res.writeHead(302, { location: to, 'cache-control': 'no-store' });
      return res.end();
    }
    if ((m = p.match(/^\/platform\/p\/([a-z0-9-]+)$/))) {
      const slug = m[1];
      if (req.method === 'POST') {
        const fields = await parseBody(req);
        const out = await engage.register(slug, fields);
        if (!out) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('No page'); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(out.html);
      }
      const pge = await engage.page(slug);
      if (!pge) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('No page'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(engage.pageHtml(pge));
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } catch (e) {
    console.error('platform public', e);
    if (!res.headersSent) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('The page failed.'); }
  }
}

module.exports = { handle, publicRoute, ensure };
