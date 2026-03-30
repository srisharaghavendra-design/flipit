// api/warm-cache.js - Pre-generates top matchups into Supabase
// GET /api/warm-cache?secret=YOUR_SECRET
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const MATCHUPS = [
  { a: "Cisco Room Bar Pro", b: "Poly Studio X50" },
  { a: "Cisco Room Bar Pro", b: "Zoom Bar" },
  { a: "Cisco Room Bar Pro", b: "Microsoft Teams Room" },
  { a: "Cisco Room Bar Pro", b: "Logitech Rally Bar" },
  { a: "Cisco Room Bar Pro", b: "Yealink MVC960" },
  { a: "Cisco Room Bar Pro", b: "Neat Bar Pro" },
  { a: "Cisco Room Bar", b: "Neat Bar" },
  { a: "Cisco Webex Contact Center", b: "Genesys Cloud CX 2" },
  { a: "Cisco Webex Contact Center", b: "NICE CXone Core" },
  { a: "Cisco Webex Contact Center", b: "Five9 Cloud Contact Center" },
  { a: "Cisco Webex Contact Center", b: "Amazon Connect Voice" },
  { a: "Cisco Webex Contact Center", b: "Avaya Experience Platform" },
  { a: "Genesys Cloud CX 2", b: "NICE CXone Core" },
  { a: "Genesys Cloud CX 2", b: "Five9 Cloud Contact Center" },
  { a: "Genesys Cloud CX 2", b: "Amazon Connect Voice" },
  { a: "Autodesk Revit", b: "Bentley Systems MicroStation" },
  { a: "Autodesk BIM 360", b: "Bexel Manager" },
  { a: "Autodesk BIM 360", b: "Trimble ProjectSight" },
  { a: "Autodesk Revit", b: "Dassault Systemes SOLIDWORKS Professional" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Chubb CyberEdge" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "AIG CyberEdge by AIG" },
  { a: "Boxx Insurance BOXX Cyber Enterprise", b: "Coalition Coalition Active Cyber Insurance" },
];

// Shared normalization — must match rescue.js exactly
function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

async function generatePlan(ours, theirs) {
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: "B2B competitive sales strategist. Return only valid JSON. Win probability based on features only.",
    messages: [{ role: "user", content: `Rescue plan: ${ours} vs ${theirs}. Return ONLY this JSON: {"dealAssessment":{"winProbability":65,"urgency":"high","summary":"2 sentences"},"killShot":"specific differentiator","competitorWeaknesses":["w1","w2","w3"],"counterMoves":[{"move":"m","timing":"t","action":"a"},{"move":"m","timing":"t","action":"a"},{"move":"m","timing":"t","action":"a"}],"talkTrack":{"opening":"opening line","keyMessages":["m1","m2","m3"],"objectionHandlers":[{"objection":"o","response":"r"},{"objection":"o","response":"r"}]},"emailTemplate":{"subject":"s","body":"b"},"partnerIntel":null}` }]
  });
  const t = r.content[0].text;
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}')+1));
}

async function saveToCache(key, a, b, plan) {
  const r = await fetch(`${SB_URL}/rest/v1/plan_cache`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ cache_key: key, product_a: a, product_b: b, core_plan: plan, hit_count: 0 })
  });
  if(!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  if (req.query.secret !== process.env.WARM_CACHE_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const results = [];
  for (const m of MATCHUPS) {
    const key = cacheKey(m.a, m.b);
    try {
      const chk = await fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=id`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      });
      const ex = await chk.json();
      if (ex?.length) {
        results.push({ matchup: `${m.a} vs ${m.b}`, status: 'already cached', key });
        continue;
      }
      const plan = await generatePlan(m.a, m.b);
      await saveToCache(key, m.a, m.b, plan);
      results.push({ matchup: `${m.a} vs ${m.b}`, status: 'cached', key });
    } catch(e) {
      results.push({ matchup: `${m.a} vs ${m.b}`, status: 'error', error: e.message });
    }
  }

  res.json({ cached: results.filter(r=>r.status==='cached').length, total: MATCHUPS.length, results });
}
