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

function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

async function generateBothPlans(ours, theirs, category) {
  const r = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: `Competitive intelligence analyst. Use web_search once to find real current data. Rules: cite sources for $ figures e.g. (Source: Gartner 2024). If unverified prefix with est. Never invent customer names or awards. Output ONLY compact raw JSON, no markdown.`,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: `Search: "${ours} vs ${theirs} ${category.replace(/_/g,' ')} 2025"

Output ONLY this JSON (keep all string values under 120 chars):
{"core_plan":{"dealAssessment":{"winProbability":65,"urgency":"high","summary":"<2 sentences>"},"killShot":"<key differentiator>","competitorWeaknesses":["<w1>","<w2>","<w3>"],"counterMoves":[{"move":"<t>","timing":"<when>","action":"<what>"},{"move":"<t>","timing":"<when>","action":"<what>"},{"move":"<t>","timing":"<when>","action":"<what>"}],"talkTrack":{"opening":"<line>","keyMessages":["<m1>","<m2>","<m3>"],"objectionHandlers":[{"objection":"<o>","response":"<r>"},{"objection":"<o>","response":"<r>"}]},"emailTemplate":{"subject":"<subj>","body":"<150 words>"},"partnerIntel":null},"depth_plan":{"executiveSummary":{"headline":"<why ${ours}>","roiStatement":"<ROI with source or est.(unverified)>","riskOfInaction":"<risk>","executiveTalkingPoint":"<board line>"},"specComparison":{"tableRows":[{"feature":"<f1>","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"<f2>","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"<f3>","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"<f4>","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"3yr TCO","ours":"<cost>","theirs":"<cost>","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<diff>","apiDesign":"<diff>","dataModel":"<diff>","scalabilityModel":"<diff>","securityArchitecture":"<diff>","keyArchitecturalAdvantage":"<adv>"},"implementationAnalysis":{"deploymentTimeline":"<timeline>","professionalServicesRequired":"<PS>","hiddenCosts":["<c1>","<c2>","<c3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"3","totalFirstYearCost":"<cost>","migrationRisk":"<risks>"},"evidenceAndProof":{"customerWins":[{"company":"<real or Major firm>","result":"<outcome>","quote":""}],"analystRecognition":"<recognition>","g2Rating":{"ours":"<score>/5","theirs":"<score>/5"},"recentNews":"<2024-2025 news>","sourcesUsed":["<src1>","<src2>"],"cachedAt":"NOW"}}}` }]
  });
  let text = '';
  for (const block of r.content) { if (block.type === 'text') text += block.text; }
  text = text.replace('"cachedAt":"NOW"', `"cachedAt":"${new Date().toISOString()}"`);
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in response');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed.core_plan || !parsed.depth_plan) throw new Error('Missing core_plan or depth_plan');
  return parsed;
}

async function saveToCache(key, a, b, corePlan, depthPlan) {
  const r = await fetch(`${SB_URL}/rest/v1/plan_cache`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ cache_key: key, product_a: a, product_b: b, core_plan: corePlan, depth_plan: depthPlan, hit_count: 0, cached_at: new Date().toISOString() })
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.WARM_CACHE_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  // Single index mode: process exactly ONE matchup, return fast
  const idx = parseInt(req.query.index ?? '-1', 10);
  if (idx >= 0 && idx < MATCHUPS.length) {
    const m = MATCHUPS[idx];
    const key = cacheKey(m.a, m.b);
    try {
      const { core_plan, depth_plan } = await generateBothPlans(m.a, m.b, m.category);
      await saveToCache(key, m.a, m.b, core_plan, depth_plan);
      return res.json({ index: idx, matchup: `${m.a} vs ${m.b}`, status: 'cached', next: idx + 1 < MATCHUPS.length ? idx + 1 : 'DONE' });
    } catch(e) {
      return res.status(500).json({ index: idx, matchup: `${m.a} vs ${m.b}`, status: 'error', error: e.message, next: idx + 1 });
    }
  }

  // No index — return status of all matchups
  const statuses = await Promise.all(MATCHUPS.map(async (m, i) => {
    const key = cacheKey(m.a, m.b);
    const chk = await fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=cached_at,depth_plan`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    const rows = await chk.json();
    return { index: i, matchup: `${m.a} vs ${m.b}`, cached: rows?.length > 0, has_depth: !!rows?.[0]?.depth_plan, cached_at: rows?.[0]?.cached_at };
  }));
  res.json({ total: MATCHUPS.length, cached: statuses.filter(s=>s.cached).length, with_depth: statuses.filter(s=>s.has_depth).length, matchups: statuses });
      }
