'use strict';

const data = require('./data');
const engage = require('./engage');
const crm = require('./crm');
const spend = require('./spend');
const insights = require('./insights');
const metrics = require('./metrics');
const policy = require('./policy');
const why = require('./why');

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
      return { reply: `The venue changed to River North Club, Salon B, and the date moved to 19 Mar. ${row.why} Source ${row.source_message}, via ${row.channel}, ${row.actor}.`, result: row };
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
  },
  {
    id: 'upload-chicago', module: 'crm', example: '@mops upload this attendee file to SFDC for the Chicago roundtable',
    test: (t) => /upload this attendee file|attendee file to sfdc/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'POST /api/platform/crm/uploads', () => crm.upload({
        campaignId: 'CAMP-CHI', actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text, idempotencyKey: 'ask:upload-chicago'
      }));
      const owners = crm.ownerLine(result.owners);
      const held = (result.held || []).map(row => `${row.name} (${row.reason})`).join('; ');
      const reply = result.idempotent
        ? `Already uploaded ${result.filename} for the Chicago roundtable. ${result.accepted} campaign members are in Salesforce. ${owners}.`
        : `Uploaded ${result.filename} to Salesforce for the Chicago roundtable. ${result.accepted} campaign members. ${owners}. Held ${result.held.length}: ${held}. ${result.retried ? 'Retried ' + result.retried + ' transient error. ' : ''}The queue is clear.`;
      return { reply, result };
    }
  },
  {
    id: 'chicago-owners', module: 'crm', example: '@mops who owns the Chicago accounts',
    test: (t) => /who owns the chicago accounts/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/crm/owners', () => crm.chicagoAccounts());
      return { reply: crm.ownerLine(result.owners) + '.', result };
    }
  },
  {
    id: 'sync-chicago', module: 'crm', example: '@mops sync the Chicago campaign to Salesforce',
    test: (t) => /sync the chicago campaign/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'POST /api/platform/crm/sync', () => crm.syncCampaign({ actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text }));
      const reply = result.idempotent
        ? `The Chicago campaign is already in Salesforce as ${result.id}. No second copy.`
        : `Synced the Chicago campaign to Salesforce as ${result.id}.`;
      return { reply, result };
    }
  },
  {
    id: 'sync-failures', module: 'crm', example: '@mops show the sync failures',
    test: (t) => /sync failures/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/crm/queue', () => crm.failures());
      let reply = 'Nothing has been synced yet.';
      if (result.jobs.length && result.open.length) reply = `${result.open.length} sync jobs are still open.`;
      else if (result.jobs.length) reply = result.retried.length
        ? `No open failures. ${result.retried.length} transient error was retried and the queue is clear.`
        : 'No open failures. The queue is clear.';
      return { reply, result };
    }
  },
  {
    id: 'budget-chicago', module: 'plan', example: '@mops new budget: Chicago security roundtable, $180K',
    test: (t) => /new budget|file the chicago budget/i.test(t),
    async run(ctx, calls) {
      const Money = require('../backend/money');
      const parsed = Money.parseMoney(ctx.text) || { amount: 180000, currency: 'USD' };
      const result = await step(calls, 'POST /api/platform/spend/budgets', () => spend.file({
        name: 'Chicago security roundtable', amount: parsed.amount, currency: parsed.currency,
        actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text, idempotencyKey: 'ask:budget-chicago'
      }));
      const rows = await step(calls, 'GET /api/platform/spend/actuals', () => spend.actuals());
      const chi = rows.find(r => r.id === 'CAMP-CHI');
      const open = result.open.map(f => f.label).join(', ');
      const actuals = `Actuals are ${spend.money(chi.actual)} of ${spend.money(chi.budget)}.`;
      const sow = `SOW drafted for ${result.sow.agency}. Still open, because only a person knows them: ${open}.`;
      let reply;
      if (result.status === 'pending') {
        const again = result.idempotent ? 'Already filed. ' : '';
        reply = `${again}Filed ${spend.money(result.amountUsd)} for the Chicago security roundtable. Waiting on Chris. The BAN and the campaign code are minted when he approves. ${sow} ${actuals}`;
      } else if (result.approver) {
        const again = result.idempotent ? 'Chris M. already approved this. ' : '';
        reply = `${again}Filed ${spend.money(result.amountUsd)} for the Chicago security roundtable. Chris M. approved it. BAN ${result.ban}. Code ${result.campaignCode}. ${sow} ${actuals}`;
      } else {
        reply = `Filed ${spend.money(result.amountUsd)} for the Chicago security roundtable. That is at or under $150,000, so the policy approves it. BAN ${result.ban}. Code ${result.campaignCode}. ${sow} ${actuals}`;
      }
      return { reply, result: { ...result, actual: chi } };
    }
  },
  {
    id: 'mint-chicago', module: 'plan', example: '@mops mint the campaign code',
    test: (t) => /mint the campaign code/i.test(t),
    async run(ctx, calls) {
      const packet = await step(calls, 'GET /api/platform/spend/packets', () => spend.chicagoPacket());
      if (!packet || packet.status !== 'approved') {
        return { reply: 'The Chicago BAN and campaign code are minted when Chris M. approves. The request is Waiting on Chris.', result: packet };
      }
      const result = await step(calls, 'POST /api/platform/spend/codes', () => spend.codes({ actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text }));
      return { reply: `The Chicago code is ${result.campaignCode}. BAN ${result.ban}. A second mint returns the same ids.`, result };
    }
  },
  {
    id: 'draft-sow', module: 'plan', example: '@mops draft the SOW',
    test: (t) => /draft the sow/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'POST /api/platform/spend/budgets', () => spend.file({
        name: 'Chicago security roundtable', amount: 180000, currency: 'USD',
        actor: ctx.actor, channel: ctx.channel, sourceMessage: ctx.text, idempotencyKey: 'ask:budget-chicago'
      }));
      const open = result.open.map(f => f.label).join(', ');
      return { reply: `Drafted the SOW for ${result.sow.agency}. Venue ${result.sow.fields.venue}. Still open, because only a person knows them: ${open}.`, result };
    }
  },
  {
    id: 'americas-left', module: 'plan', example: '@mops what is left in the Americas budget',
    test: (t) => /left in the americas budget/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/spend/remaining', () => spend.remaining('Americas'));
      return { reply: `Americas has ${spend.money(result.left)} left of ${spend.money(result.envelope)} after ${spend.money(result.committed)} committed. Actuals so far are ${spend.money(result.actual)}.`, result };
    }
  },
  {
    id: 'weekly-americas', module: 'insights', example: '@mops weekly report for Americas',
    test: (t) => /weekly report/i.test(t),
    async run(ctx, calls) {
      const region = place(ctx.text);
      const facts = await step(calls, 'GET /api/platform/insights/dashboard', () => insights.deckFacts(region));
      const q = encodeURIComponent(facts.region);
      return {
        reply: insights.summaryText('weekly', facts),
        result: facts,
        downloads: [
          { label: 'Download PowerPoint', href: `/api/platform/insights/reports/weekly.pptx?region=${q}` },
          { label: 'Download PDF', href: `/api/platform/insights/reports/weekly.pdf?region=${q}` }
        ]
      };
    }
  },
  {
    id: 'monthly-portfolio', module: 'insights', example: '@mops monthly report for the portfolio',
    test: (t) => /monthly report/i.test(t),
    async run(ctx, calls) {
      const region = place(ctx.text);
      const facts = await step(calls, 'GET /api/platform/insights/dashboard', () => insights.deckFacts(region));
      const q = encodeURIComponent(facts.region);
      return {
        reply: insights.summaryText('monthly', facts),
        result: facts,
        downloads: [
          { label: 'Download PowerPoint', href: `/api/platform/insights/reports/monthly.pptx?region=${q}` },
          { label: 'Download PDF', href: `/api/platform/insights/reports/monthly.pdf?region=${q}` }
        ]
      };
    }
  },
  {
    id: 'chicago-cpl', module: 'insights', example: '@mops what is the cost per lead for Chicago',
    test: (t) => /cost per lead/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/insights/campaigns/CAMP-CHI', () => insights.campaignFacts('CAMP-CHI'));
      const reply = result.leads
        ? `Cost per lead for Chicago is ${insights.money(result.costPerLead)} (${insights.money(result.actual)} actual / ${result.leads} responded leads).`
        : `Chicago has ${insights.money(result.actual)} of actuals and no responded leads yet, so cost per lead is not a number.`;
      return { reply, result };
    }
  },
  {
    id: 'chicago-pipeline', module: 'insights', example: '@mops how much pipeline did Chicago source',
    test: (t) => /pipeline did chicago|chicago source/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/insights/campaigns/CAMP-CHI', () => insights.campaignFacts('CAMP-CHI'));
      return { reply: `Chicago has sourced ${insights.money(result.pipeline)} of pipeline. The target is ${insights.money(result.target)}.`, result };
    }
  },
  {
    id: 'approve-chicago', module: 'brain', example: '@mops approve Chicago',
    test: (t) => /approve chicago/i.test(t),
    async run(ctx, calls) {
      if (!policy.isApprover(ctx.actor, ctx.role)) {
        const waiting = await step(calls, 'GET /api/platform/spend/packets', () => spend.chicagoPacket());
        return { reply: 'Only Chris M. can approve the Chicago budget. It is Waiting on Chris.', result: waiting };
      }
      const result = await step(calls, 'POST /api/platform/spend/approve', () => spend.approve({
        campaignId: 'CAMP-CHI', actor: ctx.actor, role: ctx.role, channel: ctx.channel, sourceMessage: ctx.text
      }));
      const again = result.idempotent ? 'Chris M. already approved this. ' : '';
      return { reply: `${again}Chris M. approved ${spend.money(result.amountUsd)} for the Chicago security roundtable. BAN ${result.ban}. Code ${result.campaignCode}.`, result };
    }
  },
  {
    id: 'approval-policy', module: 'brain', example: '@mops what is the approval policy',
    test: (t) => /approval policy|what is the policy/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/brain/policy', async () => ({ rules: policy.RULES, chicago: policy.explain(180000) }));
      return { reply: result.chicago + ' ' + policy.RULES.map(r => r.name + ': ' + r.text).join(' '), result };
    }
  },
  {
    id: 'chicago-changes', module: 'brain', example: '@mops what changed on the Chicago roundtable',
    test: (t) => /what changed on the chicago/i.test(t),
    async run(ctx, calls) {
      const result = await step(calls, 'GET /api/platform/brain/why', () => why.feed({ q: 'Chicago', limit: 12 }));
      const lines = result.rows.slice(0, 4).map(r => `${r.module} via ${r.channel}: ${r.why}`);
      return { reply: lines.length ? lines.join(' ') : 'Nothing in the why feed mentions Chicago yet.', result };
    }
  }
];

function place(text) {
  const m = String(text).match(/\b(americas|emea|apj|global|portfolio)\b/i);
  if (!m) return 'Americas';
  return { americas: 'Americas', emea: 'EMEA', apj: 'APJ', global: 'Global', portfolio: 'portfolio' }[m[1].toLowerCase()];
}

function later() { return null; }

async function ask({ text, channel = 'App', actor = 'Maria Alvarez', role = 'marketer' }) {
  const started = process.hrtime.bigint();
  const elapsed = () => Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  const clean = norm(text);
  const calls = [];
  const ctx = { text: clean, channel, actor, role };
  try {
    const found = ASKS.find(item => item.test(clean));
    if (!found) {
      const next = later(clean);
      const ms = elapsed();
      if (next) return { ok: true, matched: false, ...next, ms, calls, examples: ASKS.map(a => a.example) };
      return { ok: true, matched: false, reply: 'I can run Data core, Engage, CRM, Plan and spend, Insights, and the Brain. Use one of the examples.', examples: ASKS.map(a => a.example), ms, calls };
    }
    const out = await found.run(ctx, calls);
    const ms = elapsed();
    await metrics.record({ askId: found.id, module: found.module, text: clean, ms, ok: 1 });
    return { ok: true, matched: true, askId: found.id, module: found.module, reply: out.reply, result: out.result, downloads: out.downloads || [], calls, ms, channel, actor };
  } catch (e) {
    return { ok: false, error: e.message || 'The ask failed', calls, ms: elapsed() };
  }
}

module.exports = { ask, ASKS, norm };
