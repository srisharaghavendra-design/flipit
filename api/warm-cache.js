// api/warm-cache.js
// Runs nightly via cron — generates BOTH core_plan + depth_plan for all matchups
// Uses web search + Sonnet for accuracy. Sellers always hit cache, never wait for AI.
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const MATCHUPS = [
  { a: "Cisco Room Bar Pro", b: "Poly Studio X50", category: "video_device" },
  { a: "Cisco Room Bar Pro", b: "Zoom Bar", category: "video_device" },
  { a: "Cisco Room Bar Pro", b: "Microsoft Teams Room", category: "video_device" },
  { a: "Cisco Room Bar Pro", b: "Logitech Rally Bar", category: "video_device" },
  { a: "Cisco Room Bar Pro", b: "Yealink MVC960", category: "video_device" },
  { a: "Cisco Room Bar Pro", b: "Neat Bar Pro", category: "video_device" },
  { a: "Cisco Room Bar", b: "Neat Bar", category: "video_device" },
  { a: "Cisco Webex Contact Center", b: "Genesys Cloud CX 2", category: "contact_center" },
  { a: "Cisco Webex Contact Center", b: "NICE CXone Core", category: "contact_center" },
  { a: "Cisco Webex Contact Center", b: "Five9 Cloud Contact Center", category: "contact_center" },
  { a: "Cisco Webex Contact Center", b: "Amazon Connect Voice", category: "contact_center" },
  { a: "Cisco Webex Contact Center", b: "Avaya Experience Platform", category: "contact_center" },
  { a: "Genesys Cloud CX 2", b: "NICE CXone Core", category: "contact_center" },
  { a: "Genesys Cloud CX 2", b: "Five9 Cloud Contact Center", category: "contact_center" },
  { a: "Genesys Cloud CX 2", b: "Amazon Connect Voice", category: "contact_center" },
  { a: "Autodesk Revit", b: "Bentley Systems MicroStation", category: "cad_bim" },
  { a: "Autodesk BIM 360", b: "Bexel Manager", category: "cad_bim" },
  { a: "Autodesk BIM 360", b: "Trimble ProjectSight", category: "cad_bim" },
  { a: "Autodesk Revit", b: "Dassault Systemes SOLIDWORKS Professional", category: "cad_bim" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Chubb CyberEdge", category: "insurance" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "AIG CyberEdge by AIG", category: "insurance" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Coalition Active Cyber Insurance", category: "insurance" },
];

// Shared normalizer — must match rescue.js exactly
function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

function getCategoryFeatures(category, p, c) {
  switch(category) {
    case 'contact_center': return [
      {"feature":"Omnichannel Channels","ours":"<"+p+" channels>","theirs":"<"+c+" channels>","advantage":"<winner>"},
      {"feature":"AI / Virtual Agent","ours":"<"+p+" AI>","theirs":"<"+c+" AI>","advantage":"<winner>"},
      {"feature":"Compliance","ours":"<"+p+" certs>","theirs":"<"+c+" certs>","advantage":"<winner>"},
      {"feature":"CRM Integrations","ours":"<"+p+" integrations>","theirs":"<"+c+" integrations>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost>","theirs":"<"+c+" cost>","advantage":"<winner>"}
    ];
    case 'video_device': return [
      {"feature":"Video Resolution","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Audio","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"AI Features","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Platform Support","ours":"<"+p+" platforms>","theirs":"<"+c+" platforms>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost>","theirs":"<"+c+" cost>","advantage":"<winner>"}
    ];
    case 'cad_bim': return [
      {"feature":"BIM Capabilities","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Cloud Collaboration","ours":"<"+p+" spec>","theirs":"<"+c+" spec>","advantage":"<winner>"},
      {"feature":"Interoperability","ours":"<"+p+" formats>","theirs":"<"+c+" formats>","advantage":"<winner>"},
      {"feature":"Licensing Model","ours":"<"+p+" model>","theirs":"<"+c+" model>","advantage":"<winner>"},
      {"feature":"3yr TCO","ours":"<"+p+" cost>","theirs":"<"+c+" cost>","advantage":"<winner>"}
    ];
    default: return [
      {"feature":"Coverage Limits","ours":"<"+p+" limits>","theirs":"<"+c+" limits>","advantage":"<winner>"},
      {"feature":"Incident Response","ours":"<"+p+" IR>","theirs":"<"+c+" IR>","advantage":"<winner>"},
      {"feature":"Risk Assessment","ours":"<"+p+" approach>","theirs":"<"+c+" approach>","advantage":"<winner>"},
      {"feature":"Claims Process","ours":"<"+p+" process>","theirs":"<"+c+" process>","advantage":"<winner>"},
      {"feature":"Premium Model","ours":"<"+p+" pricing>","theirs":"<"+c+" pricing>","advantage":"<winner>"}
    ];
  }
}

async function generateBothPlans(ours, theirs, category) {
  const featureRows = JSON.stringify(getCategoryFeatures(category, ours, theirs));

  // Single Sonnet call with web search generates BOTH plans in one shot
  const r = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: `You are a competitive intelligence analyst. Use web_search to find real current data before responding.
Rules:
- Every $ figure must cite its source e.g. (Source: Gartner 2024)
- If no verified source, prefix with "est." and note (unverified)
- Never invent customer names, analyst quotes, or awards
- For video devices: include ALL supported platforms (Teams, Zoom, Webex, Google Meet etc) accurately
- Output ONLY raw JSON, no markdown`,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: `Search for: "${ours} vs ${theirs} ${category.replace(/_/g,' ')} specs pricing review 2025"

Then output ONLY this JSON with two top-level keys — core_plan and depth_plan:
{
  "core_plan": {
    "dealAssessment": {"winProbability": <40-90>, "urgency": "<high|medium|low>", "summary": "<2 accurate sentences based on search results>"},
    "killShot": "<specific verified differentiator>",
    "competitorWeaknesses": ["<verified weakness 1>", "<verified weakness 2>", "<verified weakness 3>"],
    "counterMoves": [
      {"move": "<title>", "timing": "<when>", "action": "<what>"},
      {"move": "<title>", "timing": "<when>", "action": "<what>"},
      {"move": "<title>", "timing": "<when>", "action": "<what>"}
    ],
    "talkTrack": {
      "opening": "<verbatim opening line>",
      "keyMessages": ["<msg 1>", "<msg 2>", "<msg 3>"],
      "objectionHandlers": [
        {"objection": "<obj>", "response": "<resp>"},
        {"objection": "<obj>", "response": "<resp>"}
      ]
    },
    "emailTemplate": {"subject": "<subject>", "body": "<body 150 words>"},
    "partnerIntel": null
  },
  "depth_plan": {
    "executiveSummary": {
      "headline": "<one verified sentence why ${ours}>",
      "roiStatement": "<ROI with $ AND source citation, or est. (unverified)>",
      "riskOfInaction": "<verified risk of choosing ${theirs}>",
      "executiveTalkingPoint": "<board-ready line>"
    },
    "specComparison": {"tableRows": ${featureRows}},
    "architectureBreakdown": {
      "processingModel": "<verified differences>",
      "apiDesign": "<verified differences>",
      "dataModel": "<verified differences>",
      "scalabilityModel": "<verified differences>",
      "securityArchitecture": "<verified differences>",
      "keyArchitecturalAdvantage": "<${ours} verified advantage>"
    },
    "implementationAnalysis": {
      "deploymentTimeline": "<${ours} X wks vs ${theirs} Y wks>",
      "professionalServicesRequired": "<PS details with source or est.>",
      "hiddenCosts": ["<${theirs} cost 1 with source or est.>", "<cost 2>", "<cost 3>"],
      "adminOverhead": "<hrs/wk>",
      "integrationComplexity": "<1-5>",
      "totalFirstYearCost": "<${ours} vs ${theirs} Year 1 with source or est.>",
      "migrationRisk": "<key risks>"
    },
    "evidenceAndProof": {
      "customerWins": [{"company": "<real customer or Major [industry] firm>", "result": "<outcome>", "quote": "<real quote or empty string>"}],
      "analystRecognition": "<real Gartner/Forrester recognition with year or verify at source>",
      "g2Rating": {"ours": "<real G2 score>/5", "theirs": "<real G2 score>/5"},
      "recentNews": "<real 2024-2025 news from search>",
      "sourcesUsed": ["<source URL or publication 1>", "<source 2>"],
      "cachedAt": "${new Date().toISOString()}"
    }
  }
}` }]
  });

  let text = '';
  for (const block of r.content) {
    if (block.type === 'text') text += block.text;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in response');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed.core_plan || !parsed.depth_plan) throw new Error('Missing core_plan or depth_plan');
  return parsed;
}

async function saveToCache(key, a, b, corePlan, depthPlan) {
  const r = await fetch(`${SB_URL}/rest/v1/plan_cache`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates'
    },
    body: JSON.stringify({
      cache_key: key,
      product_a: a,
      product_b: b,
      core_plan: corePlan,
      depth_plan: depthPlan,
      hit_count: 0,
      cached_at: new Date().toISOString()
    })
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.WARM_CACHE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const force = req.query.force === 'true';
  const results = [];

  for (const m of MATCHUPS) {
    const key = cacheKey(m.a, m.b);
    try {
      // Check if already cached (skip unless force=true)
      if (!force) {
        const chk = await fetch(
          `${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=id,cached_at`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
        );
        const ex = await chk.json();
        if (ex?.length) {
          results.push({ matchup: `${m.a} vs ${m.b}`, status: 'already cached', cached_at: ex[0].cached_at });
          continue;
        }
      }

      // Generate both plans with web search
      const { core_plan, depth_plan } = await generateBothPlans(m.a, m.b, m.category);
      await saveToCache(key, m.a, m.b, core_plan, depth_plan);
      results.push({ matchup: `${m.a} vs ${m.b}`, status: 'cached', key });

    } catch(e) {
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
