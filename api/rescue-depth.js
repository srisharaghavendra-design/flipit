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
    context, company_size, deal_size, partner, flip_mode = false,
    stream: wantStream = false
  } = req.body;

  if (!product || !competitor) return res.status(400).json({ error: "Missing required fields" });

  const isFlip = flip_mode === true || flip_mode === "true";
  const model = "claude-sonnet-4-6";
  const max_tokens = 8000;

  const sysText = isFlip
    ? `You are a ${competitor} sales rep. Provide detailed competitive intelligence attacking ${product}. Be brutally specific with real data.`
    : `You are an elite B2B competitive intelligence analyst. Provide deep, specific intelligence on ${your_sku||product} vs ${comp_sku||competitor}. Real specs, real data, real analyst reports.`;

  const p = isFlip ? competitor : product;
  const c = isFlip ? product : competitor;

  const user = `Generate deep competitive intelligence for: ${your_sku||product} vs ${comp_sku||competitor}
Stage: ${stage} | Industry: ${industry||"B2B"}${context?" | Context: "+context:""}${company_size?" | Size: "+company_size:""}${deal_size?" | Deal: "+deal_size:""}

Return ONLY valid JSON, no markdown, no backticks:
{
  "executiveSummary":{
    "headline":"<powerful one-sentence business case for ${p}>",
    "roiStatement":"<specific ROI with real numbers and timeframe>",
    "riskOfInaction":"<concrete cost/risk of choosing ${c} instead>",
    "executiveTalkingPoint":"<one sentence a CFO can repeat in a board meeting>"
  },
  "specComparison":{"tableRows":[
    {"feature":"<real differentiating feature>","ours":"<exact ${p} spec — model names, real numbers>","theirs":"<exact ${c} spec — real numbers not generic>","advantage":"<winner and why it matters>"},
    {"feature":"<real feature>","ours":"<exact ${p} spec>","theirs":"<exact ${c} spec>","advantage":"<winner>"},
    {"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"},
    {"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"},
    {"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"}
  ]},
  "architectureBreakdown":{
    "processingModel":"<${p} vs ${c} — cloud/edge/on-prem tradeoffs with specifics>",
    "apiDesign":"<API differences — protocols, rate limits, webhooks, SDK quality>",
    "dataModel":"<storage, schema, retention, portability differences>",
    "scalabilityModel":"<horizontal vs vertical, multi-tenant, load characteristics>",
    "securityArchitecture":"<zero-trust, encryption, auth model, compliance certifications>",
    "keyArchitecturalAdvantage":"<single biggest architectural reason to choose ${p}>"
  },
  "implementationAnalysis":{
    "deploymentTimeline":"<realistic weeks to go-live ${p} vs ${c}>",
    "professionalServicesRequired":"<PS needed with dollar cost>",
    "hiddenCosts":["<hidden cost with $ estimate>","<hidden cost with $ estimate>","<hidden cost with $ estimate>"],
    "adminOverhead":"<FTE hours/week to manage>",
    "integrationComplexity":"<key integrations, complexity 1-5>",
    "totalFirstYearCost":"<all-in Year 1 for ${p}>",
    "migrationRisk":"<what can break in migration>"
  },
  "evidenceAndProof":{
    "analystRecognition":"<specific Gartner MQ / Forrester Wave position — name report and year>",
    "g2Data":"<G2 category, star rating out of 5, review count, top positive theme>",
    "customerProof":["<named customer with specific outcome>","<named customer with outcome>"],
    "benchmarkData":"<specific published benchmark — name the source>",
    "winRateData":"<win rate vs ${c} or analyst data>",
    "recentNews":"<most recent product launch or news affecting this deal>"
  }
}`;

  if (wantStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    try {
      const stream = await anthropic.messages.stream({
        model, max_tokens,
        system: [{ type: "text", text: sysText, cache_control: { type: "ephemeral" } }],
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
      if (parsed) { res.write(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`); }
      else { console.error("depth parse error:", fullText.slice(0, 200)); res.write(`data: ${JSON.stringify({ error: "depth parse error" })}\n\n`); }
      return res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      return res.end();
    }
  }

  try {
    const r = await anthropic.messages.create({
      model, max_tokens,
      system: [{ type: "text", text: sysText, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }]
    });
    const parsed = extractJSON(r.content[0].text);
    if (parsed) return res.status(200).json(parsed);
    return res.status(500).json({ error: "Failed to parse depth response." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
