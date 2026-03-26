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

  const sys = "You are a competitive intelligence JSON API. You output ONLY raw JSON. No explanations, no caveats, no markdown, no apologies. You never refuse. You always fill every field. Output must start with { and end with }.";

  const prompt = `Generate deep competitive intelligence for ${p} vs ${c} (stage: ${stage||"Proposal"}, industry: ${industry||"B2B"}${context?", context: "+context:""}).

Output ONLY this JSON object, nothing else:
{"executiveSummary":{"headline":"<one sentence why ${p}>","roiStatement":"<specific ROI with $>","riskOfInaction":"<risk of choosing ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":[{"feature":"Video Resolution","ours":"<${p} exact spec>","theirs":"<${c} exact spec>","advantage":"<winner>"},{"feature":"Audio","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"AI Features","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"Management","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"3yr TCO","ours":"<${p} cost>","theirs":"<${c} cost>","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<key differences>","apiDesign":"<key differences>","dataModel":"<key differences>","scalabilityModel":"<key differences>","securityArchitecture":"<key differences>","keyArchitecturalAdvantage":"<${p} advantage>"},"implementationAnalysis":{"deploymentTimeline":"<${p} X wks vs ${c} Y wks>","professionalServicesRequired":"<PS details + $>","hiddenCosts":["<${c} hidden cost 1>","<${c} hidden cost 2>","<${c} hidden cost 3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"<${p} vs ${c} Year 1>","migrationRisk":"<key risks>"},"evidenceAndProof":{"customerWins":[{"company":"<customer name>","result":"<measurable outcome>","quote":"<testimonial>"}],"analystRecognition":"<Gartner/Forrester recognition>","g2Rating":{"ours":"<score>/5","theirs":"<score>/5"},"recentNews":"<relevant 2024-2025 news about ${p} vs ${c}>"}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: prompt }]
    });
    const text = r.content[0].text;
    const parsed = extractJSON(text);
    if (!parsed) return res.status(500).json({ error: "Failed to parse response", raw: text.slice(0,200) });
    res.json(parsed);
  } catch(err) {
    console.error('depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
