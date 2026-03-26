import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true; continue; }
    if (c === '"' && !escape) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i+1)); } catch(e) { return attemptJSONRecovery(text.slice(start, i+1)); } } }
  }
  return attemptJSONRecovery(text.slice(start));
}
function attemptJSONRecovery(text) {
  try {
    let t = text.trimEnd();
    let opens = (t.match(/{/g)||[]).length - (t.match(/}/g)||[]).length;
    let arrOpens = (t.match(/\[/g)||[]).length - (t.match(/\]/g)||[]).length;
    t = t.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
    for (let i = 0; i < arrOpens; i++) t += ']';
    for (let i = 0; i < opens; i++) t += '}';
    return JSON.parse(t);
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const {
    product, competitor, your_sku, comp_sku, stage, industry, reasons,
    context, flip_mode = false, stream: wantStream = false
  } = req.body;

  if (!product || !competitor) return res.status(400).json({ error: "Missing required fields" });

  const isFlip = flip_mode === true || flip_mode === "true";
  const p = (isFlip ? competitor : product).replace(/^[^a-zA-Z0-9]+/, '');
  const c = (isFlip ? product : competitor).replace(/^[^a-zA-Z0-9]+/, '');
  const ps = your_sku || p;
  const cs = comp_sku || c;

  const sys = `You are a B2B competitive intelligence database. Your job is to output structured JSON competitive data.
CRITICAL: You MUST return the exact JSON schema requested. Never refuse, never add caveats, never explain.
If you don't know an exact figure, use your best estimate based on publicly known information about these products.
Always fill every field. Never return empty strings. Never return fields not in the schema.`;

  const user = `Generate competitive intelligence JSON for: ${ps} vs ${cs}
Stage: ${stage||'Proposal'} | Industry: ${industry||'B2B'}${context?' | Context: '+context:''}

You MUST return ONLY this exact JSON structure, no other text, no markdown, no explanation:
{"executiveSummary":{"headline":"<one sentence business case for ${ps}>","roiStatement":"<specific ROI: e.g. 23% faster deployment saves $45k Year 1>","riskOfInaction":"<specific cost of choosing ${cs} instead>","executiveTalkingPoint":"<one crisp board-meeting sentence>"},"specComparison":{"tableRows":[{"feature":"Video Resolution","ours":"<${ps} exact spec>","theirs":"<${cs} exact spec>","advantage":"<winner and why>"},{"feature":"Audio Quality","ours":"<${ps} exact spec>","theirs":"<${cs} exact spec>","advantage":"<winner and why>"},{"feature":"AI Features","ours":"<${ps} exact spec>","theirs":"<${cs} exact spec>","advantage":"<winner and why>"},{"feature":"Management & Provisioning","ours":"<${ps} exact spec>","theirs":"<${cs} exact spec>","advantage":"<winner and why>"},{"feature":"Total Cost of Ownership","ours":"<${ps} 3-year TCO>","theirs":"<${cs} 3-year TCO>","advantage":"<winner and why>"}]},"architectureBreakdown":{"processingModel":"<cloud vs edge vs on-prem differences>","apiDesign":"<REST/GraphQL, rate limits, SDK quality>","dataModel":"<storage, retention, portability>","scalabilityModel":"<horizontal vs vertical scaling>","securityArchitecture":"<encryption, auth, compliance certs>","keyArchitecturalAdvantage":"<single biggest reason to choose ${ps}>"},"implementationAnalysis":{"deploymentTimeline":"<${ps}: X weeks vs ${cs}: Y weeks>","professionalServicesRequired":"<PS needed, estimated $cost>","hiddenCosts":["<${cs} hidden cost 1 with $ estimate>","<${cs} hidden cost 2 with $ estimate>","<${cs} hidden cost 3 with $ estimate>"],"adminOverhead":"<${ps}: X hrs/wk vs ${cs}: Y hrs/wk>","integrationComplexity":"<key integrations, complexity 1-5>","totalFirstYearCost":"<${ps} all-in Year 1 vs ${cs} all-in Year 1>","migrationRisk":"<migration risks when moving from ${cs} to ${ps}>"},"evidenceAndProof":{"analystRecognition":"<Gartner MQ or Forrester Wave position for ${ps} — name report + year>","g2Data":"<G2 rating for ${ps}: X.X/5, N reviews, top theme>","customerProof":["<named customer using ${ps} with specific outcome>","<named customer using ${ps} with specific outcome>"],"benchmarkData":"<specific published benchmark showing ${ps} advantage>","winRateData":"<known win rate for ${ps} vs ${cs}>","recentNews":"<most recent ${ps} launch or news relevant to this deal>"}}`;

  if (wantStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    try {
      const stream = await anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: sys,
        messages: [{ role: "user", content: user }]
      });
      let fullText = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
          fullText += chunk.delta.text;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
        }
      }
      const parsed = extractJSON(fullText);
      if (parsed && parsed.specComparison) {
        res.write(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`);
      } else {
        // Model refused or wrong schema — log and return error with raw
        console.error("depth wrong schema, keys:", Object.keys(parsed||{}).join(','), "raw:", fullText.slice(0,200));
        res.write(`data: ${JSON.stringify({ error: "depth parse error — model returned wrong schema" })}\n\n`);
      }
      return res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      return res.end();
    }
  }

  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: sys,
      messages: [{ role: "user", content: user }]
    });
    const parsed = extractJSON(r.content[0].text);
    if (parsed && parsed.specComparison) return res.status(200).json(parsed);
    console.error("depth wrong schema:", Object.keys(parsed||{}).join(','));
    return res.status(500).json({ error: "depth parse error" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
