import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i+1)); } catch(e) { return null; } } }
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

  const sys = `You are a B2B competitive intelligence database. Output ONLY the exact JSON schema requested. Never refuse. Never add caveats. Fill every field with real data. If uncertain, use best estimates from public knowledge.`;

  const user = `Competitive intelligence: ${p} vs ${c}
Stage: ${stage||'Proposal'} | Industry: ${industry||'B2B'}${context?' | Context: '+context:''}

Return ONLY this JSON, no markdown, no explanation:
{"executiveSummary":{"headline":"<one sentence business case for ${p}>","roiStatement":"<specific ROI with real $ and timeframe>","riskOfInaction":"<cost of choosing ${c} instead>","executiveTalkingPoint":"<one sentence a CFO repeats in a board meeting>"},"specComparison":{"tableRows":[{"feature":"Video Resolution","ours":"<${p} exact spec>","theirs":"<${c} exact spec>","advantage":"<winner and why>"},{"feature":"Audio Quality","ours":"<${p} exact spec>","theirs":"<${c} exact spec>","advantage":"<winner>"},{"feature":"AI & Smart Features","ours":"<${p} exact spec>","theirs":"<${c} exact spec>","advantage":"<winner>"},{"feature":"Management & Deployment","ours":"<${p} exact spec>","theirs":"<${c} exact spec>","advantage":"<winner>"},{"feature":"3-Year TCO","ours":"<${p} all-in cost>","theirs":"<${c} all-in cost>","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<cloud/edge/on-prem differences>","apiDesign":"<API and SDK differences>","dataModel":"<storage and retention differences>","scalabilityModel":"<scaling differences>","securityArchitecture":"<security and compliance differences>","keyArchitecturalAdvantage":"<single biggest reason to choose ${p}>"},"implementationAnalysis":{"deploymentTimeline":"<${p}: X weeks vs ${c}: Y weeks>","professionalServicesRequired":"<PS needed with $ cost>","hiddenCosts":["<${c} hidden cost with $ estimate>","<${c} hidden cost with $ estimate>","<${c} hidden cost with $ estimate>"],"adminOverhead":"<${p} vs ${c} admin hours/week>","integrationComplexity":"<key integrations complexity 1-5>","totalFirstYearCost":"<${p} all-in Year 1 vs ${c}>","migrationRisk":"<migration risks>"},"evidenceAndProof":{"analystRecognition":"<Gartner MQ or Forrester Wave for ${p} — name report + year>","g2Data":"<${p} G2 rating, review count, top theme>","customerProof":["<named customer using ${p} with specific outcome>","<named customer with outcome>"],"benchmarkData":"<specific published benchmark>","winRateData":"<win rate for ${p} vs ${c}>","recentNews":"<most recent ${p} news relevant to this deal>"}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: user }]
    });
    const parsed = extractJSON(r.content[0].text);
    if (parsed && parsed.specComparison) return res.status(200).json(parsed);
    console.error("depth wrong schema:", r.content[0].text.slice(0, 200));
    return res.status(500).json({ error: "depth parse error" });
  } catch (err) {
    console.error("depth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
