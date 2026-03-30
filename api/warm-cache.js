// api/warm-cache.js
// Nightly background job: web search + Sonnet → generates core_plan + depth_plan → stores in Supabase
// Every live request hits cache only — no AI at request time
// GET /api/warm-cache?secret=YOUR_SECRET

import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const MATCHUPS = [
  { a: "Cisco Room Bar Pro",              b: "Poly Studio X50" },
  { a: "Cisco Room Bar Pro",              b: "Zoom Bar" },
  { a: "Cisco Room Bar Pro",              b: "Microsoft Teams Room" },
  { a: "Cisco Room Bar Pro",              b: "Logitech Rally Bar" },
  { a: "Cisco Room Bar Pro",              b: "Yealink MVC960" },
  { a: "Cisco Room Bar Pro",              b: "Neat Bar Pro" },
  { a: "Cisco Room Bar",                  b: "Neat Bar" },
  { a: "Cisco Webex Contact Center",      b: "Genesys Cloud CX 2" },
  { a: "Cisco Webex Contact Center",      b: "NICE CXone Core" },
  { a: "Cisco Webex Contact Center",      b: "Five9 Cloud Contact Center" },
  { a: "Cisco Webex Contact Center",      b: "Amazon Connect Voice" },
  { a: "Cisco Webex Contact Center",      b: "Avaya Experience Platform" },
  { a: "Genesys Cloud CX 2",             b: "NICE CXone Core" },
  { a: "Genesys Cloud CX 2",             b: "Five9 Cloud Contact Center" },
  { a: "Genesys Cloud CX 2",             b: "Amazon Connect Voice" },
  { a: "Autodesk Revit",                  b: "Bentley Systems MicroStation" },
  { a: "Autodesk BIM 360",               b: "Bexel Manager" },
  { a: "Autodesk BIM 360",               b: "Trimble ProjectSight" },
  { a: "Autodesk Revit",                  b: "Dassault Systemes SOLIDWORKS Professional" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Chubb CyberEdge" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "AIG CyberEdge by AIG" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Coalition Coalition Active Cyber Insurance" },
];

// Shared key normalizer — must match rescue.js exactly
function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

function detectCategory(name) {
  const p = name.toLowerCase();
  if (p.includes('contact center') || p.includes('genesys') || p.includes('five9') ||
      p.includes('amazon connect') || p.includes('avaya') || p.includes('nice') ||
      p.includes('cxone')) return 'contact_center';
  if (p.includes('room bar') || p.includes('room kit') || p.includes('board') ||
      p.includes('poly') || p.includes('neat') || p.includes('logitech') ||
      p.includes('yealink') || p.includes('zoom bar') || p.includes('teams room'))
    return 'video_device';
  if (p.includes('revit') || p.includes('microstation') || p.includes('bim') ||
      p.includes('trimble') || p.includes('bexel') || p.includes('solidworks') ||
      p.includes('dassault')) return 'cad_bim';
  if (p.includes('insurance') || p.includes('cyber') || p.includes('chubb') ||
      p.includes('aig') || p.includes('coalition') || p.includes('boxx')) return 'insurance';
  return 'saas';
}

function getCategoryFeatures(category, p, c) {
  switch (category) {
    case 'contact_center': return [
      { feature: 'Omnichannel Channels', ours: p + ' channels', theirs: c + ' channels', advantage: '' },
      { feature: 'AI / Virtual Agent',   ours: p + ' AI',       theirs: c + ' AI',       advantage: '' },
      { feature: 'Compliance',           ours: p + ' certs',    theirs: c + ' certs',    advantage: '' },
      { feature: 'CRM Integrations',     ours: p + ' CRM',      theirs: c + ' CRM',      advantage: '' },
      { feature: '3yr TCO',              ours: p + ' cost',     theirs: c + ' cost',     advantage: '' },
    ];
    case 'video_device': return [
      { feature: 'Video Resolution', ours: p + ' res',   theirs: c + ' res',   advantage: '' },
      { feature: 'Audio',            ours: p + ' audio', theirs: c + ' audio', advantage: '' },
      { feature: 'AI Features',      ours: p + ' AI',    theirs: c + ' AI',    advantage: '' },
      { feature: 'Management',       ours: p + ' mgmt',  theirs: c + ' mgmt',  advantage: '' },
      { feature: '3yr TCO',          ours: p + ' cost',  theirs: c + ' cost',  advantage: '' },
    ];
    case 'cad_bim': return [
      { feature: 'BIM Capabilities',    ours: p + ' BIM',     theirs: c + ' BIM',     advantage: '' },
      { feature: 'Cloud Collaboration', ours: p + ' cloud',   theirs: c + ' cloud',   advantage: '' },
      { feature: 'Interoperability',    ours: p + ' formats', theirs: c + ' formats', advantage: '' },
      { feature: 'Licensing Model',     ours: p + ' license', theirs: c + ' license', advantage: '' },
      { feature: '3yr TCO',             ours: p + ' cost',    theirs: c + ' cost',    advantage: '' },
    ];
    case 'insurance': return [
      { feature: 'Coverage Limits',   ours: p + ' limits',  theirs: c + ' limits',  advantage: '' },
      { feature: 'Incident Response', ours: p + ' IR',      theirs: c + ' IR',      advantage: '' },
      { feature: 'Risk Assessment',   ours: p + ' risk',    theirs: c + ' risk',    advantage: '' },
      { feature: 'Claims Process',    ours: p + ' claims',  theirs: c + ' claims',  advantage: '' },
      { feature: 'Premium Model',     ours: p + ' pricing', theirs: c + ' pricing', advantage: '' },
    ];
    default: return [
      { feature: 'Core Functionality',    ours: p + ' capability', theirs: c + ' capability', advantage: '' },
      { feature: 'AI / Automation',       ours: p + ' AI',         theirs: c + ' AI',         advantage: '' },
      { feature: 'Integrations',          ours: p + ' integrations', theirs: c + ' integrations', advantage: '' },
      { feature: 'Security & Compliance', ours: p + ' security',   theirs: c + ' security',   advantage: '' },
      { feature: '3yr TCO',               ours: p + ' cost',       theirs: c + ' cost',       advantage: '' },
    ];
  }
}

// Generate core battle card plan using web search + Sonnet
async function generateCorePlan(ours, theirs) {
  const category = detectCategory(ours + ' ' + theirs);

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: `You are a B2B competitive sales strategist. Use web_search to find real current facts about ${ours} and ${theirs} before responding. Never invent weaknesses, features, or customer names. Base everything on what you find. Output only valid JSON.`,
    messages: [{ role: 'user', content: `Search for "${ours} vs ${theirs} ${category.replace(/_/g,' ')} 2025 comparison review" then generate a rescue plan JSON.

Return ONLY this JSON (no markdown):
{"dealAssessment":{"winProbability":65,"urgency":"high","summary":"<2 sentences based on real product differences>"},"killShot":"<real specific differentiator found in search>","competitorWeaknesses":["<real weakness 1>","<real weakness 2>","<real weakness 3>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<what>"},{"move":"<title>","timing":"<when>","action":"<what>"},{"move":"<title>","timing":"<when>","action":"<what>"}],"talkTrack":{"opening":"<verbatim opening line>","keyMessages":["<msg>","<msg>","<msg>"],"objectionHandlers":[{"objection":"<obj>","response":"<resp>"},{"objection":"<obj>","response":"<resp>"}]},"emailTemplate":{"subject":"<subject>","body":"<150 word body>"},"partnerIntel":null,"cachedAt":"${new Date().toISOString()}"}` }]
  });

  let text = '';
  for (const block of r.content) {
    if (block.type === 'text') text += block.text;
  }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON in core plan response');
  return JSON.parse(text.slice(s, e + 1));
}

// Generate deep intel plan using web search + Sonnet
async function generateDepthPlan(ours, theirs) {
  const category = detectCategory(ours + ' ' + theirs);
  const features = getCategoryFeatures(category, ours, theirs);

  const r = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    system: `You are a competitive intelligence analyst. Use web_search to find real current data. Rules: every $ figure must cite source e.g. (Source: Gartner 2024). If no verified source found, write "est." before number and add (unverified). Never invent customer names, quotes, or analyst awards. Output only valid JSON.`,
    messages: [{ role: 'user', content: `Search for "${ours} vs ${theirs} ${category.replace(/_/g,' ')} pricing analyst review G2 2025" then generate deep competitive intelligence.

Return ONLY this JSON (no markdown):
{"executiveSummary":{"headline":"<one sentence why ${ours}>","roiStatement":"<ROI with $ AND source, or est. (unverified)>","riskOfInaction":"<risk of ${theirs}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":${JSON.stringify(features)}},"architectureBreakdown":{"processingModel":"<real differences>","apiDesign":"<real differences>","dataModel":"<real differences>","scalabilityModel":"<real differences>","securityArchitecture":"<real differences>","keyArchitecturalAdvantage":"<${ours} real advantage>"},"implementationAnalysis":{"deploymentTimeline":"<${ours} X wks vs ${theirs} Y wks>","professionalServicesRequired":"<PS details + $ with source or est.>","hiddenCosts":["<${theirs} real cost 1>","<real cost 2>","<real cost 3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"<${ours} vs ${theirs} Year 1 with source or est.>","migrationRisk":"<real risks>"},"evidenceAndProof":{"customerWins":[{"company":"<real customer or Major [industry] firm>","result":"<real outcome>","quote":"<real quote or empty string>"}],"analystRecognition":"<real Gartner/Forrester recognition with year, or empty string>","g2Rating":{"ours":"<real G2 score>/5 (verify at g2.com)","theirs":"<real G2 score>/5 (verify at g2.com)"},"recentNews":"<real 2024-2025 news found in search>","sourcesUsed":["<source url or publication 1>","<source 2>"]},"cachedAt":"${new Date().toISOString()}"}` }]
  });

  let text = '';
  for (const block of r.content) {
    if (block.type === 'text') text += block.text;
  }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON in depth plan response');
  return JSON.parse(text.slice(s, e + 1));
}

async function saveToCache(key, a, b, corePlan, depthPlan) {
  const body = {
    cache_key: key,
    product_a: a,
    product_b: b,
    core_plan: corePlan,
    depth_plan: depthPlan,
    hit_count: 0
  };
  const r = await fetch(`${SB_URL}/rest/v1/plan_cache`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.WARM_CACHE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // force=true regenerates even if already cached
  const force = req.query.force === 'true';
  const results = [];

  for (const m of MATCHUPS) {
    const key = cacheKey(m.a, m.b);
    try {
      // Check if already cached (unless force refresh)
      if (!force) {
        const chk = await fetch(
          `${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=id,depth_plan`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        const ex = await chk.json();
        // Skip only if BOTH plans exist
        if (ex?.length && ex[0].depth_plan) {
          results.push({ matchup: `${m.a} vs ${m.b}`, status: 'already cached', key });
          continue;
        }
      }

      // Generate both plans in parallel for speed
      const [corePlan, depthPlan] = await Promise.all([
        generateCorePlan(m.a, m.b),
        generateDepthPlan(m.a, m.b)
      ]);

      await saveToCache(key, m.a, m.b, corePlan, depthPlan);
      results.push({ matchup: `${m.a} vs ${m.b}`, status: 'cached', key });

    } catch (e) {
      results.push({ matchup: `${m.a} vs ${m.b}`, status: 'error', error: e.message });
    }
  }

  res.json({
    cached: results.filter(r => r.status === 'cached').length,
    skipped: results.filter(r => r.status === 'already cached').length,
    errors: results.filter(r => r.status === 'error').length,
    total: MATCHUPS.length,
    results
  });
    }
