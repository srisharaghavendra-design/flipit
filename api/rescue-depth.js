import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

// Must match rescue.js and warm-cache.js exactly
function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"' && !esc) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i+1)); } catch(e) { return null; }
      }
    }
  }
  return null;
}

async function checkDepthCache(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=depth_plan,cached_at,hit_count`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await r.json();
    if (rows?.length && rows[0].depth_plan) {
      // Fire and forget hit count update
      fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ hit_count: (rows[0].hit_count || 0) + 1 })
      }).catch(() => {});
      return { plan: rows[0].depth_plan, cached_at: rows[0].cached_at };
    }
  } catch(e) { console.error('depth cache check:', e.message); }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { product, competitor, your_sku, comp_sku, stage, industry, context, flip_mode = false } = req.body;
  if (!product || !competitor) return res.status(400).json({ error: "Missing fields" });

  const isFlip = flip_mode === true || flip_mode === "true";
  const ps = your_sku || product;
  const cs = comp_sku || competitor;
  const p = isFlip ? cs : ps;
  const c = isFlip ? ps : cs;

  const keyA = ps.trim();
  const keyB = cs.trim();
  const key = cacheKey(keyA, keyB);

  // ── Step 1: Try cache first — always fast ──
  const cached = await checkDepthCache(key);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ ...cached.plan, _cached_at: cached.cached_at });
  }

  // ── Step 2: Cache miss — generate live with Haiku (fast, no web search) ──
  // This only happens for matchups not yet warmed. Mark as unverified.
  res.setHeader('X-Cache', 'MISS');

  const prompt = `Generate competitive intelligence for ${p} vs ${c}.
Industry: ${industry || 'B2B'} | Stage: ${stage || 'Proposal'}${context ? ' | Context: ' + context : ''}

IMPORTANT: This is a live fallback — prefix ALL $ figures with "est." and add "(unverified — run warm cache to get web-verified data)"

Output ONLY this JSON:
{"executiveSummary":{"headline":"<one sentence why ${p}>","roiStatement":"est. <ROI> (unverified — run warm cache to get web-verified data)","riskOfInaction":"<risk of ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":[{"feature":"Key Capability","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"AI Features","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"Compliance","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"Integrations","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"3yr TCO","ours":"est. <${p} cost> (unverified)","theirs":"est. <${c} cost> (unverified)","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<differences>","apiDesign":"<differences>","dataModel":"<differences>","scalabilityModel":"<differences>","securityArchitecture":"<differences>","keyArchitecturalAdvantage":"<${p} advantage>"},"implementationAnalysis":{"deploymentTimeline":"<timeline>","professionalServicesRequired":"est. <PS details> (unverified)","hiddenCosts":["est. <cost 1> (unverified)","est. <cost 2> (unverified)","est. <cost 3> (unverified)"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"est. <${p} vs ${c}> (unverified)","migrationRisk":"<risks>"},"evidenceAndProof":{"customerWins":[{"company":"<customer or Major firm>","result":"<outcome>","quote":""}],"analystRecognition":"Verify at gartner.com or g2.com","g2Rating":{"ours":"verify at g2.com","theirs":"verify at g2.com"},"recentNews":"Run warm cache for verified news","sourcesUsed":[],"cachedAt":"live-generated"}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: "Competitive intelligence analyst. Output only valid JSON. Label all estimates clearly.",
      messages: [{ role: "user", content: prompt }]
    });

    const text = r.content[0]?.text || '';
    const parsed = extractJSON(text);
    if (!parsed) return res.status(500).json({ error: "Failed to parse response" });

    // Save to cache so next request is instant
    if (SB_URL && SB_KEY) {
      fetch(`${SB_URL}/rest/v1/plan_cache`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ cache_key: key, product_a: keyA, product_b: keyB, depth_plan: parsed, hit_count: 0, cached_at: new Date().toISOString() })
      }).catch(() => {});
    }

    res.json(parsed);
  } catch(err) {
    console.error('depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
