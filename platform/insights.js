'use strict';

const { current } = require('./db');
const { demoDay } = require('./clock');
const reports = require('../backend/reports');

const RESPONSE = "('open','click','registration','attendance')";

function db() { return current(); }
function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
function integer(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }

async function regions() {
  const rows = await db().all(`SELECT c.region AS region,
      COUNT(*) AS campaigns,
      COALESCE(SUM(b.amount_usd), 0) AS budget,
      COALESCE(SUM(a.amount_usd), 0) AS actual,
      COALESCE(SUM(c.pipeline_usd), 0) AS pipeline,
      COALESCE(SUM(c.pipeline_target_usd), 0) AS target
    FROM campaigns c
    LEFT JOIN budgets b ON b.campaign_id = c.id
    LEFT JOIN actuals a ON a.campaign_id = c.id
    GROUP BY c.region ORDER BY c.region`);
  const leads = await db().all(`SELECT c.region AS region, COUNT(DISTINCT v.contact_id) AS n
    FROM activities v JOIN campaigns c ON c.id = v.campaign_id
    WHERE v.kind IN ${RESPONSE} GROUP BY c.region`);
  const mqls = await db().all(`SELECT a.region AS region, COUNT(*) AS n FROM contacts c
    JOIN accounts a ON a.id = c.account_id WHERE c.stage = 'mql' GROUP BY a.region`);
  const leadMap = Object.fromEntries(leads.map(r => [r.region, r.n]));
  const mqlMap = Object.fromEntries(mqls.map(r => [r.region, r.n]));
  return rows.map(r => ({ ...r, leads: leadMap[r.region] || 0, mqls: mqlMap[r.region] || 0, costPerLead: (leadMap[r.region] ? Math.round(r.actual / leadMap[r.region]) : null) }));
}

async function programs(region) {
  const args = [];
  const where = region && region !== 'portfolio' ? 'WHERE c.region = ?' : '';
  if (where) args.push(region);
  const rows = await db().all(`SELECT c.program AS program,
      COUNT(*) AS campaigns,
      COALESCE(SUM(b.amount_usd), 0) AS budget,
      COALESCE(SUM(a.amount_usd), 0) AS actual,
      COALESCE(SUM(c.pipeline_usd), 0) AS pipeline
    FROM campaigns c
    LEFT JOIN budgets b ON b.campaign_id = c.id
    LEFT JOIN actuals a ON a.campaign_id = c.id
    ${where}
    GROUP BY c.program ORDER BY c.program`, args);
  return rows;
}

async function campaignFacts(id) {
  const row = await db().get(`SELECT c.id, c.name, c.region, c.pipeline_usd AS pipeline, c.pipeline_target_usd AS target, b.amount_usd AS budget, COALESCE(a.amount_usd, 0) AS actual
    FROM campaigns c JOIN budgets b ON b.campaign_id = c.id LEFT JOIN actuals a ON a.campaign_id = c.id WHERE c.id = ?`, [id]);
  if (!row) return null;
  const leads = await db().get(`SELECT COUNT(DISTINCT contact_id) AS n FROM activities WHERE campaign_id = ? AND kind IN ${RESPONSE}`, [id]);
  const n = leads.n || 0;
  return { ...row, leads: n, costPerLead: n ? Math.round(row.actual / n) : null };
}

async function dashboard(region) {
  const scope = region && region !== 'portfolio' ? region : null;
  return { regions: await regions(), programs: await programs(scope), chicago: await campaignFacts('CAMP-CHI') };
}

function placeOf(region) { return !region || region === 'portfolio' ? 'portfolio' : region; }

async function deckFacts(region) {
  const scope = placeOf(region);
  const all = scope === 'portfolio';
  const list = await regions();
  const slice = all ? list : list.filter(r => r.region === scope);
  const bars = await programs(all ? null : scope);
  const rawNames = await db().all(`SELECT name FROM campaigns WHERE status = 'Live' ${all ? '' : 'AND region = ?'} ORDER BY id`, all ? [] : [scope]);
  const names = [];
  const seenName = new Set();
  for (const row of rawNames) {
    if (seenName.has(row.name)) continue;
    seenName.add(row.name);
    names.push(row);
    if (names.length === 6) break;
  }
  const sum = (k) => slice.reduce((s, r) => s + (r[k] || 0), 0);
  const chicago = await campaignFacts('CAMP-CHI');
  const risks = [];
  const pipeline = sum('pipeline');
  const goal = sum('target');
  if (goal && goal !== pipeline) {
    risks.push({ name: 'Pipeline against target', note: `${money(pipeline)} actual pipeline, target ${money(goal)}`, fixed: pipeline >= goal });
  }
  if (chicago && (!all ? chicago.region === scope : true)) {
    risks.push({ name: chicago.name, note: `${money(chicago.actual)} actual of ${money(chicago.budget)} budget`, fixed: chicago.actual <= chicago.budget });
  }
  return {
    region: scope,
    campaigns: sum('campaigns'),
    live: names.length,
    spend: sum('actual'),
    budget: sum('budget'),
    leads: sum('leads'),
    mqls: sum('mqls'),
    pipeline: sum('pipeline'),
    goal: sum('target'),
    bars: bars.map(b => ({ label: b.program, spend: b.actual, budget: b.budget })),
    risks: risks.length ? risks : [{ name: 'Nothing over budget', note: 'Actuals are inside the plan', fixed: true }],
    actions: ['Read the actuals against the budget.', 'Chicago over $150,000 stays with Chris M.'],
    names: names.map(n => n.name),
    warehouseRegions: 0,
    warehouseBehind: 0
  };
}

function when() { return demoDay().slice(0, 10); }

async function build(period, region) {
  const facts = await deckFacts(region);
  const stamp = when();
  const kind = period === 'monthly' ? 'monthly' : 'weekly';
  const [pptx, pdf] = await Promise.all([
    reports.pptx(kind, facts, stamp),
    Promise.resolve(reports.pdf(kind, facts, stamp))
  ]);
  const place = facts.region === 'portfolio' ? 'portfolio' : facts.region;
  return {
    period: kind,
    region: place,
    when: stamp,
    facts,
    pptx, pdf,
    pptxName: `${kind}-${place.toLowerCase()}.pptx`,
    pdfName: `${kind}-${place.toLowerCase()}.pdf`
  };
}

function summaryText(period, facts) {
  const place = facts.region === 'portfolio' ? 'the portfolio' : facts.region;
  const label = period === 'monthly' ? 'Monthly report' : 'Weekly report';
  const cpl = facts.leads ? money(Math.round(facts.spend / facts.leads)) : 'n/a';
  return `${label} for ${place}. ${facts.campaigns} campaigns, ${money(facts.spend)} actual of ${money(facts.budget)} budget, ${integer(facts.leads)} responded leads, ${integer(facts.mqls)} MQLs, ${money(facts.pipeline)} pipeline against a target of ${money(facts.goal)}. Cost per lead ${cpl}.`;
}

module.exports = { regions, programs, campaignFacts, dashboard, deckFacts, build, summaryText, money };
