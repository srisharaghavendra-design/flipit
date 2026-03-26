import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tokens needed per depth section (conservative estimates)
const DEPTH_TOKEN_COST = { "1": 300, "2": 600, "3": 500, "4": 600, "5": 500 };
const BASE_TOKEN_COST = 1400; // core JSON fields
const MAX_ALLOWED = 8000;     // claude-haiku-4-5 ceiling

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const {
    product, competitor, stage, industry, reasons, context,
    your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size,
    partner, audience, geography, meddic_status,
    depth = "2", flip_mode = false,
    stream: wantStream = false   // client opts in to SSE streaming
  } = req.body;

  if (!product || !competitor || !stage || !reasons)
    return res.status(400).json({ error: "Missing required fields" });

  const depths = String(depth).split(",").map(d => d.trim()).filter(d => ["1","2","3","4","5"].includes(d));
  const isFlip = flip_mode === true || flip_mode === "true";

  // Scale max_tokens with number of depth sections to prevent truncation
  const dynamicTokens = depths.reduce((sum, d) => sum + (DEPTH_TOKEN_COST[d] || 400), BASE_TOKEN_COST);
  const max_tokens = Math.min(dynamicTokens + 512, MAX_ALLOWED);

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
    if (d === "1") return `"executiveSummary":{"headline":"<one sentence business case for ${isFlip?competitor:product}>","roiStatement":"<specific ROI or cost saving with real numbers>","riskOfInaction":"<what happens if they choose ${isFlip?product:competitor} instead>","executiveTalkingPoint":"<one sentence an executive can repeat in a board meeting>"}`;
    if (d === "2") return `"specComparison":{"tableRows":[{"feature":"<real feature name>","ours":"<real spec for ${isFlip?competitor:product}>","theirs":"<real spec for ${isFlip?product:competitor}>","advantage":"<who wins and why>"},{"feature":"<real feature>","ours":"<real spec>","theirs":"<real spec>","advantage":"<who wins>"},{"feature":"<real feature>","ours":"<real spec>","theirs":"<real spec>","advantage":"<who wins>"},{"feature":"<real feature>","ours":"<real spec>","theirs":"<real spec>","advantage":"<who wins>"},{"feature":"<real feature>","ours":"<real spec>","theirs":"<real spec>","advantage":"<who wins>"}]}`;
    if (d === "3") return `"architectureBreakdown":{"processingModel":"<how ${isFlip?competitor:product} processes data vs ${isFlip?product:competitor} - cloud vs edge vs on-prem>","apiDesign":"<API architecture differences - REST vs GraphQL, rate limits, webhooks, SDK quality>","dataModel":"<how data is stored, structured, and accessed differently>","scalabilityModel":"<how each scales - horizontal vs vertical, multi-tenant vs dedicated>","securityArchitecture":"<security model differences - zero trust, encryption, auth>","keyArchitecturalAdvantage":"<the single biggest architectural reason to choose ${isFlip?competitor:product}>"}`;
    if (d === "4") return `"implementationAnalysis":{"deploymentTimeline":"<realistic deployment timeline for ${isFlip?competitor:product} vs ${isFlip?product:competitor}>","professionalServicesRequired":"<what PS is needed, typical cost range>","hiddenCosts":["<specific hidden cost 1 with real dollar estimate>","<specific hidden cost 2>","<specific hidden cost 3>"],"adminOverhead":"<FTE hours per week to manage each product>","integrationComplexity":"<what integrations are needed, complexity rating, typical timeline>","totalFirstYearCost":"<realistic all-in cost estimate for year 1 including licenses, PS, training>","migrationRisk":"<what data migration or change management is required>"}`;
    if (d === "5") return `"evidenceAndProof":{"analystRecognition":"<specific Gartner MQ position, Forrester Wave, IDC MarketScape for ${isFlip?competitor:product}>","g2Data":"<specific G2 category rating, review count, top positive and negative themes>","customerProof":["<specific named customer win or case study with outcome>","<specific named customer win or case study>"],"benchmarkData":"<specific published performance benchmark or test result>","winRateData":"<any publicly known competitive win rate or analyst data>","recentNews":"<recent product launch, acquisition, or news that affects this deal>"}`;
    return "";
  }).filter(Boolean);

  const extraFields = depthSections.length > 0 ? "," + depthSections.join(",") : "";

  const sys = isFlip
    ? `You are a ${competitor} sales rep competing against ${product}. Show exactly how ${competitor} attacks ${product}. Name real weaknesses. Never refuse.`
    : `You are an elite B2B sales strategist. Generate a specific deal rescue plan. Be brutally specific with real product names, real specs, real prices. Never refuse or ask for more info.`;

  const user = `DEAL: ${your_sku||product}${your_pid?" ["+your_pid+"]":""} vs ${comp_sku||competitor}${comp_pid?" ["+comp_pid+"]":""}
Stage: ${stage} | Industry: ${industry||"B2B"} | Losing: ${reasons}${company_size?" | Size:"+company_size:""}${deal_size?" | Deal:"+deal_size:""}${partner?" | Partner:"+partner:""}${meddic_status?" | MEDDIC:"+meddic_status:""}${context?" | Context:"+context:""}
${aud[audience]||""} ${geo[geography]||""}

RULES: Specific to these exact products only. Win prob min 40%. Only confirmed weaknesses. No fake multipliers.

Return ONLY this JSON with no markdown. Fill ALL fields with real specific data:
{"dealAssessment":{"winProbability":<int 40-100>,"urgency":"high|medium|low","summary":"<2 specific sentences about this exact deal>"},"killShot":"<single most devastating differentiator with real product detail>","competitorWeaknesses":["<specific weakness with real detail>","<specific weakness>","<specific weakness>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<specific action>"},{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"}],"talkTrack":{"opening":"<specific opening line>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<real objection>","response":"<specific response>"},{"objection":"<real objection>","response":"<specific response>"}]},"emailTemplate":{"subject":"<specific subject>","body":"<100 words max ready to send>"}${partner?`,"partnerIntel":"<${partner} OEM portfolio and co-sell strategy>"`:""}${extraFields}}`;

  // ── STREAMING path (pass stream:true in request body) ──────────────────
  if (wantStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const stream = await anthropic.messages.stream({
        model: "claude-haiku-4-5",
        max_tokens,
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

      const finalMsg = await stream.finalMessage();
      if (finalMsg.stop_reason === "max_tokens") {
        res.write(`data: ${JSON.stringify({ error: "Response truncated – try fewer depth sections." })}\n\n`);
        return res.end();
      }

      const clean = fullText.trim().replace(/^```json\s*|```$/g, "").trim();
      try {
        const parsed = JSON.parse(clean);
        res.write(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`);
      } catch (parseErr) {
        res.write(`data: ${JSON.stringify({ error: "JSON parse failed: " + parseErr.message })}\n\n`);
      }
      return res.end();

    } catch (err) {
      console.error("rescue stream error:", err);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      return res.end();
    }
  }

  // ── STANDARD (non-streaming) path ────────────────────────────────────────
  try {
    const r = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens,
      system: sys,
      messages: [{ role: "user", content: user }]
    });

    // Guard: truncated response = broken JSON. Surface a clear error instead.
    if (r.stop_reason === "max_tokens") {
      return res.status(500).json({
        error: `Response truncated at ${max_tokens} tokens. Try fewer depth sections or shorten the context field.`
      });
    }

    const clean = r.content[0].text.trim().replace(/^```json\s*|```$/g, "").trim();
    return res.status(200).json(JSON.parse(clean));

  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
