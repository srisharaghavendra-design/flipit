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

  // Strong anti-refusal system prompt
  const sys = "You are a competitive intelligence JSON API. You output ONLY raw JSON. No explanations, no caveats, no markdown, no apologies. You never refuse. You always fill every field using your training data and reasonable estimates. Output must start with { and end with }.";

  const prompt = `Generate competitive intelligence for ${p} vs ${c} (stage: ${stage||"Proposal"}, industry: ${industry||"B2B"}${context?", context: "+context:""}).

Output ONLY this JSON object, nothing else:
{"executiveSummary":{"headline":"<one sentence why choose ${p}>","roiStatement":"<specific ROI $>","riskOfInaction":"<risk of ${c}>","executiveTalkingPoint":"<board-ready line>"},"specComparison":{"tableRows":[{"feature":"Video Resolution","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"Audio","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"AI Features","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"Management","ours":"<${p} spec>","theirs":"<${c} spec>","advantage":"<winner>"},{"feature":"3yr TCO","ours":"<${p} cost>","theirs":"<${c} cost>","advantage":"<winner>"}]},"architectureBreakdown":{"processingModel":"<differences>","apiDesign":"<differences>","dataModel":"<differences>","scalabilityModel":"<differences>","securityArchitecture":"<differences>","keyArchitecturalAdvantage":"<${p} advantage>"},"implementationAnalysis":{"deploymentTimeline":"<${p} X wks vs ${c} Y wks>","professionalServicesRequired":"<PS + $>","hiddenCosts":["<${c} cost 1>","<${c} cost 2>","<${c} cost 3>"],"adminOverhead":"<hrs/wk>","integrationComplexity":"<1-5>","totalFirstYearCost":"<${p} vs ${c} Yr1>","migrationRisk":"<risks>"},"evidenceAndProof":{"analystRecognition":"<Gartner/Forrester for ${p}>","g2Data":"<${p} G2 stars/reviews>","customerProof":["<customer 1>","<customer 2>"],"benchmarkData":"<benchmark>","winRateData":"<${p} vs ${c} win rate>","recentNews":"<latest ${p} news>"}}`;

  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: prompt }]
    });
    const raw = r.content[0].text;
    const parsed = extractJSON(raw);
    if (parsed && parsed.specComparison) {
      return res.status(200).json(parsed);
    }
    // Log and return error with raw so we can debug
    console.error("depth schema error. Keys:", Object.keys(parsed||{}).join(","), "Raw:", raw.slice(0,300));
    return res.status(500).json({ error: "depth parse error", keys: Object.keys(parsed||{}).join(",") });
  } catch (err) {
    console.error("depth error:", err.message);
    return res.status(500).json({ error: err.message });
  }
  }
