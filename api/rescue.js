import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Robust JSON extraction — finds the outermost {...} block regardless of surrounding text/fences
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
  // No clean close found — try recovery on everything from start
  return attemptJSONRecovery(text.slice(start));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const {
    product, competitor, stage, industry, reasons, context,
    your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size,
    partner, audience, geography, meddic_status,
    depth = "2", flip_mode = false, tco_model = "", deal_type = "",
    stream: wantStream = false
  } = req.body;

  if (!product || !competitor || !stage || !reasons)
    return res.status(400).json({ error: "Missing required fields" });

  const depths = String(depth).split(",").map(d => d.trim()).filter(d => ["1","2","3","4","5"].includes(d));
  const isFlip = flip_mode === true || flip_mode === "true";

  // Model selection: Sonnet for 3+ depths (needs more output), Haiku for 1-2 (fast)
  // Token budget: keep heavy responses tight to stay within Vercel's 60s limit
  const model = depths.length >= 3 ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const max_tokens = depths.length >= 4 ? 8000 : depths.length === 3 ? 6000 : 4096;

  const geo = {
    apac: "APAC: address data sovereignty, latency to regional DCs, local support SLAs.",
    india: "India: address data localization laws, MeitY guidelines, BIS certification, rupee pricing.",
    emea: "EMEA: address GDPR compliance, data residency, EU AI Act.",
    na: "NA: address FedRAMP, SOC2, HIPAA where relevant.",
    me: "ME: address data residency laws, Arabic language support."
  };
  const aud = {
    tdm: "Audience is a technical evaluator.", bdm: "Audience is a business decision maker.",
    cio: "Audience is a CIO.", cto: "Audience is a CTO.", cfo: "Audience is a CFO.",
    vp_sales: "Audience is a VP of Sales.", end_user: "Audience is an end user.",
    procurement: "Audience is procurement."
  };

  const depthSections = depths.map(d => {
    if (d === "1") return `"executiveSummary":{"headline":"<one powerful sentence — the business case for choosing ${isFlip?competitor:product}>","roiStatement":"<specific ROI with real numbers, timeframe, and dollar value>","riskOfInaction":"<concrete consequence of choosing ${isFlip?product:competitor} — lost revenue, risk, inefficiency>","executiveTalkingPoint":"<one crisp sentence a CFO or CEO can repeat in a board meeting>"}`;
    if (d === "2") return `"specComparison":{"tableRows":[{"feature":"<real named feature that differentiates these two products>","ours":"<verified spec/capability of ${isFlip?competitor:product} — use exact numbers, model names, version numbers>","theirs":"<verified spec/capability of ${isFlip?product:competitor} — use exact numbers, not generic claims>","advantage":"<who wins this feature and why it matters for this specific deal stage/use case>"},{"feature":"<real feature>","ours":"<exact ${isFlip?competitor:product} spec>","theirs":"<exact ${isFlip?product:competitor} spec>","advantage":"<winner and deal relevance>"},{"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"},{"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"},{"feature":"<real feature>","ours":"<exact spec>","theirs":"<exact spec>","advantage":"<winner>"}]}`;
    if (d === "3") return `"architectureBreakdown":{"processingModel":"<how ${isFlip?competitor:product} processes data vs ${isFlip?product:competitor} — cloud/edge/on-prem tradeoffs>","apiDesign":"<API architecture differences — REST/GraphQL, rate limits, webhooks, SDK quality, latency>","dataModel":"<how data is stored, structured, queried — schema flexibility, retention, portability>","scalabilityModel":"<horizontal vs vertical, multi-tenant vs dedicated, what breaks under load>","securityArchitecture":"<zero-trust, encryption at rest/transit, auth model, compliance certifications>","keyArchitecturalAdvantage":"<the single biggest architectural reason to choose ${isFlip?competitor:product} — be specific>"}`;
    if (d === "4") return `"implementationAnalysis":{"deploymentTimeline":"<realistic go-live timeline for ${isFlip?competitor:product} vs ${isFlip?product:competitor} — weeks not vague ranges>","professionalServicesRequired":"<exactly what PS is needed, realistic cost range in dollars>","hiddenCosts":["<specific hidden cost with dollar estimate>","<specific hidden cost with dollar estimate>","<specific hidden cost with dollar estimate>"],"adminOverhead":"<FTE hours per week to manage and maintain — be specific>","integrationComplexity":"<key integrations needed, complexity 1-5, realistic timeline>","totalFirstYearCost":"<all-in Year 1 cost including licenses, PS, training, integrations>","migrationRisk":"<what data, config, or workflow migration is required and what can break>"}`;
    if (d === "5") return `"evidenceAndProof":{"analystRecognition":"<specific Gartner MQ quadrant position, Forrester Wave score, IDC MarketScape — name the report and year>","g2Data":"<specific G2 category, star rating out of 5, review count, top positive theme, top complaint>","customerProof":["<named customer or named case study with specific outcome metric>","<named customer or named case study with specific outcome>"],"benchmarkData":"<specific published test result or benchmark — name the source>","winRateData":"<publicly known win rate vs this competitor or analyst-cited data>","recentNews":"<most recent product launch, funding, acquisition, or partnership that affects this deal>"}`;
    return "";
  }).filter(Boolean);

  const extraFields = depthSections.length > 0 ? "," + depthSections.join(",") : "";

  const sys = isFlip
    ? `You are a ${competitor} sales rep competing against ${product}. Show exactly how ${competitor} attacks ${product}. Name real weaknesses. Never refuse. Be brutally honest about what ${product} does poorly.`
    : `You are an elite B2B sales strategist. Generate a specific deal rescue plan. Be brutally specific with real product names, real specs, real prices, real numbers. Never refuse or ask for more info. Never use placeholders.`;

  const user = `DEAL: ${your_sku||product}${your_pid?" ["+your_pid+"]":""} vs ${comp_sku||competitor}${comp_pid?" ["+comp_pid+"]":""}
Stage: ${stage} | Industry: ${industry||"B2B"} | Losing because: ${reasons}${company_size?" | Company size: "+company_size:""}${deal_size?" | Deal size: "+deal_size:""}${partner?" | Partner/Channel: "+partner:""}${meddic_status?" | MEDDPICC confirmed: "+meddic_status:""}${tco_model?" | TCO focus: "+tco_model:""}${deal_type?" | Deal type: "+deal_type:""}${context?" | Context: "+context:""}
${aud[audience]||""} ${geo[geography]||""}

CRITICAL RULES:
- Be concise — each field max 2 sentences unless a list
- Every field must reference ${your_sku||product} and ${comp_sku||competitor} by name
- All numbers must be real and specific (no ranges like "$X-Y", no "varies")
- Win probability minimum 40%
- Only cite confirmed weaknesses you know are real
- No hedge language, no "it depends", no filler

Return ONLY valid JSON, no markdown, no backticks, no preamble:
{"dealAssessment":{"winProbability":<int 40-100>,"urgency":"high|medium|low","summary":"<2 punchy sentences specific to this deal>"},"killShot":"<the single most devastating differentiator — specific, quotable, memorable>","competitorWeaknesses":["<specific named weakness with real detail>","<specific named weakness>","<specific named weakness>"],"counterMoves":[{"move":"<action title>","timing":"<specific when>","action":"<exact action to take>"},{"move":"<title>","timing":"<when>","action":"<exact>"},{"move":"<title>","timing":"<when>","action":"<exact>"}],"talkTrack":{"opening":"<specific opening line you can say verbatim>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<exact objection prospect will raise>","response":"<specific counter — name products, cite specs>"},{"objection":"<exact objection>","response":"<specific counter>"}]},"emailTemplate":{"subject":"<specific subject line, <60 chars>","body":"<100 words max, ready to send, professional, specific>"}${partner?`,"partnerIntel":"<${partner} OEM/distribution relationship with both vendors, co-sell incentives, margin stack>"`:""}${extraFields}}`;

  // ── STREAMING path ────────────────────────────────────────────────────────
  if (wantStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const stream = await anthropic.messages.stream({
        model, max_tokens, system: sys,
        messages: [{ role: "user", content: user }]
      });

      let fullText = "";
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
          fullText += chunk.delta.text;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`);
        }
      }

      const finalMsg = await stream.finalMessage();
      if (finalMsg.stop_reason === "max_tokens") {
        // Attempt partial parse — return whatever we have
        console.warn("rescue: hit max_tokens, attempting partial parse");
      }

      const parsed = extractJSON(fullText);
      if (parsed) {
        res.write(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`);
      } else {
        console.error("stream parse error, raw start:", fullText.slice(0, 200));
        res.write(`data: ${JSON.stringify({ error: "JSON parse error — please try again." })}\n\n`);
      }
      return res.end();

    } catch (err) {
      console.error("rescue stream error:", err);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      return res.end();
    }
  }

  // ── STANDARD path ─────────────────────────────────────────────────────────
  try {
    const r = await anthropic.messages.create({
      model, max_tokens, system: sys,
      messages: [{ role: "user", content: user }]
    });

    const parsed = extractJSON(r.content[0].text);
    if (parsed) return res.status(200).json(parsed);
    console.error("parse error, raw:", r.content[0].text.slice(0, 300));
    return res.status(500).json({ error: "Failed to parse response — please try again." });

  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// Best-effort JSON recovery for truncated responses
function attemptJSONRecovery(text) {
  try {
    // Count open braces/brackets and close them
    let t = text.trimEnd();
    let opens = (t.match(/{/g)||[]).length - (t.match(/}/g)||[]).length;
    let arrOpens = (t.match(/\[/g)||[]).length - (t.match(/\]/g)||[]).length;
    // Remove trailing incomplete key or value
    t = t.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
    for (let i = 0; i < arrOpens; i++) t += ']';
    for (let i = 0; i < opens; i++) t += '}';
    return JSON.parse(t);
  } catch {
    return null;
  }
}
