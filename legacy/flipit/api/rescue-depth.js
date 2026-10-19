import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

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

// Score how well two product names match (0-1)
function matchScore(a, b) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const tokensA = norm(a).split(/\s+/);
  const tokensB = norm(b).split(/\s+/);
  let hits = 0;
  for (const t of tokensA) {
    if (t.length > 2 && tokensB.some(tb => tb.includes(t) || t.includes(tb))) hits++;
  }
  return hits / Math.max(tokensA.length, tokensB.length);
}

async function checkDepthCache(keyA, keyB) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    // Step 1: try exact key
    const exactKey = cacheKey(keyA, keyB);
    const r1 = await fetch(
      `${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(exactKey)}&select=depth_plan,cached_at,hit_count`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows1 = await r1.json();
    if (rows1?.length && rows1[0].depth_plan) {
      fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(exactKey)}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ hit_count: (rows1[0].hit_count || 0) + 1 })
      }).catch(() => {});
      return { plan: rows1[0].depth_plan, cached_at: rows1[0].cached_at };
    }

    // Step 2: fuzzy match — fetch all cached rows and find best match
    const r2 = await fetch(
      `${SB_URL}/rest/v1/plan_cache?select=cache_key,product_a,product_b,depth_plan,cached_at,hit_count&depth_plan=not.is.null`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const allRows = await r2.json();
    if (!allRows?.length) return null;

    // Find row with best combined match score
    let bestRow = null, bestScore = 0;
    for (const row of allRows) {
      if (!row.depth_plan) continue;
      const scoreA = Math.max(matchScore(keyA, row.product_a), matchScore(keyA, row.product_b));
      const scoreB = Math.max(matchScore(keyB, row.product_a), matchScore(keyB, row.product_b));
      const combined = scoreA + scoreB;
      if (combined > bestScore) { bestScore = combined; bestRow = row; }
    }

    if (bestRow && bestScore >= 1.0) {
      fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(bestRow.cache_key)}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ hit_count: (bestRow.hit_count || 0) + 1 })
      }).catch(() => {});
      return { plan: bestRow.depth_plan, cached_at: bestRow.cached_at };
    }
  } catch(e) {
    console.error('depth cache check:', e.message);
  }
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

  // Try cache first (exact + fuzzy)
  const cached = await checkDepthCache(keyA, keyB);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ ...cached.plan, _cached_at: cached.cached_at });
  }

  // Cache miss — live Haiku fallback
  res.setHeader('X-Cache', 'MISS');
  const prompt = `Generate competitive intelligence for ${p} vs ${c}.
Industry: ${industry || 'B2B'} | Stage: ${stage || 'Proposal'}${context ? ' | Context: ' + context : ''}

IMPORTANT: This is a live fallback — prefix ALL $ figures with "est." and add "(unverified)"

Output ONLY this JSON:
{"executiveSummary":{"headline":"<one sentence why ${p}>","roiStatement":"est. <ROI> (unverified)","riskOfInaction":"<risk of ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":[{"feature":"Key Capability","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"AI Features","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"Compliance","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"Integrations","ours":"<spec>","theirs":"<spec>","advantage":"<winner>"},{"feature":"3yr TCO","ours":"est. <cost> (unverified)","theirs":"est. <cost> (unverified)","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<diff>","apiDesign":"<diff>","dataModel":"<diff>","scalabilityModel":"<diff>","securityArchitecture":"<diff>","keyArchitecturalAdvantage":"<adv>"},"implementationAnalysis":{"deploymentTimeline":"<timeline>","professionalServicesRequired":"est. <PS> (unverified)","hiddenCosts":["est. <c1> (unverified)","est. <c2> (unverified)","est. <c3> (unverified)"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"est. <cost> (unverified)","migrationRisk":"<risks>"},"evidenceAndProof":{"customerWins":[{"company":"<customer>","result":"<outcome>","quote":""}],"analystRecognition":"Verify at gartner.com","g2Rating":{"ours":"verify at g2.com","theirs":"verify at g2.com"},"recentNews":"Run warm cache for verified news","sourcesUsed":[],"cachedAt":"live-generated"}}`;

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

    // Save to cache
    if (SB_URL && SB_KEY) {
      fetch(`${SB_URL}/rest/v1/plan_cache`, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify({ cache_key: cacheKey(keyA, keyB), product_a: keyA, product_b: keyB, depth_plan: parsed, hit_count: 0, cached_at: new Date().toISOString() })
      }).catch(() => {});
    }
    res.json(parsed);
  } catch(err) {
    console.error('depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
        }
