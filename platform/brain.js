'use strict';

const data = require('./data');
const engage = require('./engage');
const metrics = require('./metrics');

function norm(text) { return String(text || '').replace(/@mops/ig, ' ').replace(/\s+/g, ' ').trim(); }

async function step(calls, api, fn) {
  const t = process.hrtime.bigint();
  const value = await fn();
  calls.push({ api, ms: Math.round(Number(process.hrtime.bigint() - t) / 1e6) });
  return value;
}

const CHICAGO_RULES = { all: [
  { field: 'contact.title', op: 'eq', value: 'CIO' },
  { field: 'contact.state', op: 'eq', value: 'Illinois' },
  { field: 'contact.country', op: 'eq', value: 'United States' },
  { field: 'activity.open', op: 'within_days', value: 30 },
  { field: 'consent.status', op: 'eq', value: 'opted_in' }
] };
const INVITE_HTML = '<p>Hi {{first}},</p><p>{{company}} is invited to {{campaign}} in {{city}}.</p><p><a href="{{link}}">Reserve a seat</a></p>';

async function saveChicagoSegment(ctx, calls) {
  return step(calls, 'POST /api/platform/engage/segments', () => engage.saveSegment({
    name: 'CIOs in Illinois who opened last month', rules: CHICAGO_RULES,
    actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text
  }));
}

const ASKS = [
  {
    id: 'send-chicago', module: 'engage', example: '@mops send the Chicago invite to CIOs in Illinois who opened last month',
    test: (t) => /send the chicago invite/i.test(t),
    async run(ctx, calls) {
      const seg = await saveChicagoSegment(ctx, calls);
      const tpl = await step(calls, 'POST /api/platform/engage/templates', () => engage.saveTemplate({
        name: 'Chicago invite', subject: 'You are invited: Chicago security roundtable', html: INVITE_HTML,
        actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text
      }));
      const sent = await step(calls, 'POST /api/platform/engage/sends', () => engage.send({
        segmentId: seg.id, templateId: tpl.id, campaignId: 'CAMP-CHI', actor: ctx.actor, channel: ctx.channel,
        sourceMessage: ctx.text, idempotencyKey: 'ask:send-chicago'
      }));
      const reply = sent.idempotent
        ? `Already sent the Chicago invite to ${sent.recipients} people. No second copy.`
        : `Sent the Chicago invite to ${sent.sent} CIOs in Illinois who opened in the 30 days before 19 Oct 2026. Held ${sent.held} without opted-in consent.`;
      return { reply, result: sent };
    }
  },
  {
    id: 'draft-chicago', module: 'engage', example: '@mops draft a Chicago invite',
    test: (t) => /draft (a|the) chicago invite/i.test(t),
    async run(ctx, calls) {
      const tpl = await step(calls, 'GET /api/platform/engage/templates', () => engage.listTemplates());
      const invite = tpl.find(t => t.id === 'TPL-CHI') || tpl[0];
      const preview = await step(calls, 'POST /api/platform/engage/segments/preview', () => engage.preview(CHICAGO_RULES, 1));
      const person = preview.sample[0];
      const campaign = person && await step(calls, 'GET /api/platform/data/campaigns/CAMP-CHI', () => data.campaign('CAMP-CHI'));
      const body = person ? engage.merge(invite.html, person, campaign.campaign, '/platform/p/chicago').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return { reply: `Draft only. Nothing was sent. ${body}`, result: { templateId: invite.id, count: preview.count, sample: body } };
    }
  },
  {
    id: 'chicago-nurture', module: 'engage', example: '@mops enroll clickers who have not registered into the Chicago nurture',
    test: (t) => /enroll clickers|chicago nurture/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'POST /api/platform/engage/journeys/J-CHI/enroll', () => engage.enrollClickers({
        actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text
      }));
      const reply = result.enrolled
        ? `Enrolled ${result.enrolled} clickers who have not registered. Sent ${result.sent} first notes. The next note waits 48 hours.`
        : 'Nobody has clicked the Chicago invite yet, so there is no one to enroll.';
      return { reply, result };
    }
  },
  {
    id: 'chicago-open-rate', module: 'engage', example: '@mops what is the open rate on the Chicago invite',
    test: (t) => /open rate|how many people opened the chicago/i.test(t),
    async run(ctx, calls) {
      const sends = await step(calls, 'GET /api/platform/engage/sends', () => engage.listSends());
      const row = sends.find(s => s.idempotency_key === 'ask:send-chicago') || sends.find(s => s.campaign_id === 'CAMP-CHI' && s.segment_id !== 'journey');
      if (!row) return { reply: 'The Chicago invite has not been sent yet.', result: null };
      const pct = (n) => Math.round(n * 100);
      return { reply: `Open rate ${pct(row.openRate)}% (${row.opens} of ${row.recipients}). Click rate ${pct(row.clickRate)}% (${row.clicks} of ${row.recipients}).`, result: row };
    }
  },
  {
    id: 'chicago-mql', module: 'engage', example: '@mops who is an MQL on the Chicago invite',
    test: (t) => /who is an mql|mql on the chicago|score the chicago/i.test(t),
    async run(ctx, calls) {
      const seg = await saveChicagoSegment(ctx, calls);
      const board = await step(calls, 'GET /api/platform/engage/scores', () => engage.scores({ segmentId: seg.id }));
      const names = (board.top || []).filter(p => p.stage === 'mql').slice(0, 5).map(p => `${p.first_name} ${p.last_name} (${p.score})`);
      const reply = `${board.mqls} of ${board.inSegment} in that segment ${board.mqls === 1 ? 'is an MQL' : 'are MQLs'} at ${board.threshold}. ${names.length ? names.join(', ') + '.' : 'Opens alone stay under the line. A click crosses it.'}`;
      return { reply, result: board };
    }
  },
  {
    id: 'illinois-email', module: 'data', example: '@mops who can I email in Illinois',
    test: (t) => /who can i email in illinois/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/data/emailable', () => data.emailable({ state: 'Illinois', country: 'United States' }));
      const names = result.sample.slice(0, 3).map(p => `${p.first_name} ${p.last_name}`).join(', ');
      return { reply: `${result.count} opted-in contacts in Illinois. ${names}.`, result };
    }
  },
  {
    id: 'chicago-record', module: 'data', example: '@mops show me the Chicago campaign',
    test: (t) => /show me the chicago campaign|chicago campaign record/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/data/campaigns/CAMP-CHI', () => data.campaign('CAMP-CHI'));
      const code = (result.codes.find(c => c.kind === 'campaign') || {}).value || '';
      return { reply: `${result.campaign.name}, ${result.campaign.start_date}, owner ${result.campaign.owner}. Code ${code}. Budget $${result.budget.amount_usd.toLocaleString('en-US')}. Venue ${result.sow.venue}.`, result };
    }
  },
  {
    id: 'chicago-why', module: 'data', example: '@mops why did the Chicago venue change',
    test: (t) => /why did the chicago venue|why was the chicago venue|why the chicago venue/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/data/log', () => data.log({ q: 'venue', limit: 5 }));
      const row = result.rows.find(r => /venue/i.test(r.why)) || result.rows[0];
      if (!row) return { reply: 'Nothing in the log mentions a venue change.', result };
      return { reply: `${row.why} Source ${row.source_message}, via ${row.channel}, ${row.actor}.`, result: row };
    }
  },
  {
    id: 'consent-by-region', module: 'data', example: '@mops how many opted-in contacts are in each region',
    test: (t) => /opted-in contacts|consent by region/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/data/consent', () => data.consentByRegion());
      const lines = result.rows.filter(r => r.status === 'opted_in').map(r => `${r.region} ${r.n}`);
      return { reply: `Opted in: ${lines.join(', ')}.`, result };
    }
  },
  {
    id: 'hold-germany', module: 'data', example: '@mops hold the German contacts who have no consent',
    test: (t) => /hold the german|german contacts who have no consent/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'POST /api/platform/data/held', () => data.held({ country: 'Germany', actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text }));
      return { reply: `Held ${result.count} German contacts with no opted-in consent. They will not be emailed.`, result };
    }
  }
];

function later(text) {
  if (/salesforce|attendee file|sync the chicago|who owns the chicago accounts|sync failures/i.test(text)) return { module: 'crm', reply: 'CRM bridge is next. This ask is not wired in this run.' };
  if (/file the chicago budget|mint the campaign code|draft the sow|left in the americas budget/i.test(text)) return { module: 'plan', reply: 'Plan and spend is next. This ask is not wired in this run.' };
  if (/weekly report|monthly report|cost per lead|pipeline did chicago/i.test(text)) return { module: 'insights', reply: 'Insights is next. This ask is not wired in this run.' };
  return null;
}

async function ask({ text, channel = 'App', actor = 'Maria Alvarez' }) {
  const started = process.hrtime.bigint();
  const elapsed = () => Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  const clean = norm(text);
  const calls = [];
  const ctx = { text: clean, channel, actor };
  try {
    const found = ASKS.find(item => item.test(clean));
    if (!found) {
      const next = later(clean);
      const ms = elapsed();
      if (next) return { ok: true, matched: false, ...next, ms, calls, examples: ASKS.map(a => a.example) };
      return { ok: true, matched: false, reply: 'I can run Data core and Engage asks. Use one of the examples.', examples: ASKS.map(a => a.example), ms, calls };
    }
    const out = await found.run(ctx, calls);
    const ms = elapsed();
    await metrics.record({ askId: found.id, module: found.module, text: clean, ms, ok: 1 });
    return { ok: true, matched: true, askId: found.id, module: found.module, reply: out.reply, result: out.result, calls, ms, channel, actor };
  } catch (e) {
    return { ok: false, error: e.message || 'The ask failed', calls, ms: elapsed() };
  }
}

module.exports = { ask, ASKS, norm };
