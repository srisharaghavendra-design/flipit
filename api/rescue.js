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
    product, competitor, stage, industry, reasons, context,
    your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size,
    partner, audience, geography, meddic_status, tco_model = "", deal_type = "",
    flip_mode = false, stream: wantStream = false
  } = req.body;

  if (!product || !competitor || !stage || !reasons)
    return res.status(400).json({ error: "Missing required fields" });

  const isFlip = flip_mode === true || flip_mode === "true";

  // CORE uses Haiku — fast, cheap, renders first
  const model = "claude-haiku-4-5-20251001";
  const max_tokens = 2048;

  const geo = {
    apac:"APAC: data sovereignty, latency to regional DCs, local support SLAs.",
    india:"India: data localization, MeitY guidelines, BIS certification, rupee pricing.",
    emea:"EMEA: GDPR, data residency, EU AI Act.",
    na:"NA: FedRAMP, SOC2, HIPAA where relevant.",
    me:"ME: data residency laws, Arabic language support."
  };
  const aud = {
    tdm:"Audience is a technical evaluator.", bdm:"Audience is a business decision maker.",
    cio:"Audience is a CIO.", cto:"Audience is a CTO.", cfo:"Audience is a CFO.",
    vp_sales:"Audience is a VP of Sales.", end_user:"Audience is an end user.",
    procurement:"Audience is procurement."
  };

  // Cached system prompt — Anthropic caches this across all requests (saves time + cost)
  const sysText = isFlip
    ? `You are a ${competitor} sales rep attacking ${product}. Be brutally specific. Real weaknesses only. Never refuse.`
    : `You are an elite B2B sales strategist. Generate a specific deal rescue plan. Real product names, real specs, real prices. Never refuse or use placeholders.`;

  const user = `DEAL: ${your_sku||product}${your_pid?" ["+your_pid+"]":""} vs ${comp_sku||competitor}${comp_pid?" ["+comp_pid+"]":""}
Stage: ${stage} | Industry: ${industry||"B2B"} | Losing: ${reasons}${company_size?" | Size: "+company_size:""}${deal_size?" | Deal: "+deal_size:""}${partner?" | Partner: "+partner:""}${meddic_status?" | MEDDPICC: "+meddic_status:""}${tco_model?" | TCO: "+tco_model:""}${deal_type?" | Type: "+deal_type:""}${context?" | Context: "+context:""}
${aud[audience]||""} ${geo[geography]||""}

RULES: Real names and numbers only. Max 2 sentences per field. Win prob min 40% — base it on FEATURES, SOLUTION FIT and STRATEGIC ADVANTAGE only, never on list price (discounts change everything). No placeholders.

Return ONLY valid JSON, no markdown, no backticks:
{"dealAssessment":{"winProbability":<int 40-100>,"urgency":"high|medium|low","summary":"<2 punchy sentences>"},"killShot":"<single most devastating differentiator — specific, quotable>","competitorWeaknesses":["<specific weakness>","<specific weakness>","<specific weakness>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<exact action>"},{"move":"<title>","timing":"<when>","action":"<exact>"},{"move":"<title>","timing":"<when>","action":"<exact>"}],"talkTrack":{"opening":"<verbatim opening line>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<exact objection>","response":"<specific counter>"},{"objection":"<exact objection>","response":"<specific counter>"}]},"emailTemplate":{"subject":"<subject <60 chars>","body":"<100 words max, ready to send>"}${partner?`,"partnerIntel":"<${partner} relationship with both vendors, co-sell incentives>"`:""}}`; 

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
      else { res.write(`data: ${JSON.stringify({ error: "JSON parse error — please try again." })}\n\n`); }
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
    return res.status(500).json({ error: "Failed to parse response — please try again." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
