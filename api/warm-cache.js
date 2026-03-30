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

function getCategoryFeatures(category) {
  const f = {
    contact_center: ["Omnichannel Channels","AI / Virtual Agent","Compliance (HIPAA/PCI/SOC2)","CRM Integrations","3yr TCO"],
    video_device: ["Video Resolution","Audio","AI Features","Platform Support (Teams/Zoom/Webex/Google Meet)","3yr TCO"],
    cad_bim: ["BIM Capabilities","Cloud Collaboration","Interoperability","Licensing Model","3yr TCO"],
    insurance: ["Coverage Limits","Incident Response","Risk Assessment","Claims Process","Premium Model"],
  };
  return (f[category] || ["Core Capability","AI Features","Integrations","Security","3yr TCO"])
    .map(feat => ({"feature": feat, "ours": "<spec>", "theirs": "<spec>", "advantage": "<winner>"}));
}

async function generateBothPlans(ours, theirs, category) {
  const features = JSON.stringify(getCategoryFeatures(category));
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: `B2B competitive sales analyst. Output ONLY valid compact JSON. Be specific and accurate about product capabilities. Never invent customer names. Label any unverified $ figures with est.`,
    messages: [{ role: "user", content: `Generate competitive intel for ${ours} vs ${theirs} (category: ${category.replace(/_/g,' ')}).

Output ONLY this JSON (strings under 100 chars each):
{"core_plan":{"dealAssessment":{"winProbability":65,"urgency":"high","summary":"<2 accurate sentences>"},"killShot":"<specific real differentiator>","competitorWeaknesses":["<real w1>","<real w2>","<real w3>"],"counterMoves":[{"move":"<t>","timing":"<when>","action":"<what>"},{"move":"<t>","timing":"<when>","action":"<what>"},{"move":"<t>","timing":"<when>","action":"<what>"}],"talkTrack":{"opening":"<line>","keyMessages":["<m1>","<m2>","<m3>"],"objectionHandlers":[{"objection":"<o>","response":"<r>"},{"objection":"<o>","response":"<r>"}]},"emailTemplate":{"subject":"<subj>","body":"<120 words>"},"partnerIntel":null},"depth_plan":{"executiveSummary":{"headline":"<why ${ours}>","roiStatement":"est. <ROI> (verify before customer conversations)","riskOfInaction":"<risk of ${theirs}>","executiveTalkingPoint":"<board line>"},"specComparison":{"tableRows":${features}},"architectureBreakdown":{"processingModel":"<diff>","apiDesign":"<diff>","dataModel":"<diff>","scalabilityModel":"<diff>","securityArchitecture":"<diff>","keyArchitecturalAdvantage":"<adv>"},"implementationAnalysis":{"deploymentTimeline":"<timeline>","professionalServicesRequired":"est. <PS>","hiddenCosts":["est. <c1>","est. <c2>","est. <c3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"3","totalFirstYearCost":"est. <cost>","migrationRisk":"<risks>"},"evidenceAndProof":{"customerWins":[{"company":"<real or Major firm>","result":"<outcome>","quote":""}],"analystRecognition":"<real recognition or verify at gartner.com>","g2Rating":{"ours":"<score>/5","theirs":"<score>/5"},"recentNews":"<real recent news>","sourcesUsed":[],"cachedAt":"NOW"}}}` }]
  });

  let text = r.content[0]?.text || '';
  text = text.replace('"cachedAt":"NOW"', `"cachedAt":"${new Date().toISOString()}"`);
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON');
  const parsed = JSON.parse(text.slice(start, end + 1));
  if (!parsed.core_plan || !parsed.depth_plan) throw new Error('Missing plans');
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

  // Status check — no index provided
  const rows = await Promise.all(MATCHUPS.map(async (m, i) => {
    const key = cacheKey(m.a, m.b);
    const chk = await fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=cached_at,depth_plan`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    const data = await chk.json();
    return { index: i, matchup: `${m.a} vs ${m.b}`, cached: data?.length > 0, has_depth: !!data?.[0]?.depth_plan };
  }));
  res.json({ total: MATCHUPS.length, cached: rows.filter(r=>r.cached).length, with_depth: rows.filter(r=>r.has_depth).length, matchups: rows });
    }
