import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const depthMap = {
    "1": "BUSINESS VALUE DEPTH: Focus only on business outcomes, ROI, time-to-value, executive talking points. Zero technical jargon.",
    "2": "TECHNICAL SPECS DEPTH: Include specific product features, real version numbers, actual capability differences. Name actual specs.",
    "3": "ARCHITECTURE DEPTH: Cloud vs on-premise, API rate limits, data processing models, latency, scalability ceilings, security architecture.",
    "4": "COST AND INTEGRATION DEPTH: Total cost of ownership breakdown. Implementation timelines, professional services fees, hidden licensing costs, admin overhead.",
    "5": "PROOF AND EVIDENCE DEPTH: Back every claim with real data. G2 stats, Gartner ratings, analyst reports, documented case studies, benchmarks."
  };
  const depths = String(depth).split(",").map(d => d.trim()).filter(d => depthMap[d]);
  const depthInstructions = depths.length > 0 ? depths.map(d => depthMap[d]).join("\n") : depthMap["2"];
  const isFlip = flip_mode === true || flip_mode === "true";
  const geoMap = {apac:"APAC: data sovereignty, latency to regional DCs, local support SLAs.",india:"India: data localization, MeitY guidelines, BIS certification, rupee pricing.",emea:"EMEA: GDPR, data residency, EU AI Act.",na:"NA: FedRAMP, SOC2, HIPAA.",me:"ME: data residency laws, Arabic support, local partner ecosystem."};
  const audienceMap = {tdm:"Technical evaluator — go deep on specs, architecture, integration.",bdm:"Business decision maker — outcomes, ROI, time to value.",cio:"CIO — security, compliance, vendor risk, scalability.",cto:"CTO — architecture, APIs, technical roadmap.",cfo:"CFO — TCO, hidden costs, payback period.",vp_sales:"VP Sales — win rates, revenue impact, rep enablement.",end_user:"End user — ease of use, adoption, training time.",procurement:"Procurement — licensing terms, SLAs, contract flexibility."};

  const prompt = `You are an elite B2B sales strategist with encyclopedic product knowledge.

${isFlip ? `FLIP MODE: You are a ${competitor} sales rep. Show EXACTLY how ${competitor} attacks ${product}. Name specific ${product} weaknesses, pricing vulnerabilities, and limitations that ${competitor} exploits in deals.` : `Generate a highly specific deal rescue plan for ${product} vs ${competitor}.`}

DEAL:
- Our product: ${product}${your_pid ? ` (PID: ${your_pid})` : ""}
- Competitor: ${competitor}${comp_pid ? ` (PID: ${comp_pid})` : ""}
- Stage: ${stage} | Industry: ${industry || "B2B Tech"} | Losing because: ${reasons}${company_size ? ` | Size: ${company_size}` : ""}${deal_size ? ` | Deal: ${deal_size}` : ""}${partner ? ` | Partner: ${partner}` : ""}${meddic_status ? ` | MEDDIC done: ${meddic_status}` : ""}${prospect_company ? ` | Prospect: ${prospect_company} — align to their ESG and digital priorities` : ""}${tco_model ? ` | TCO model: ${tco_model}` : ""}${context ? ` | Context: ${context}` : ""}

DEPTH REQUIREMENTS — MANDATORY:
${depthInstructions}
${audience && audienceMap[audience] ? `\nAUDIENCE: ${audienceMap[audience]}` : ""}${geography && geoMap[geography] ? `\nGEO: ${geoMap[geography]}` : ""}

RULES:
1. ZERO GENERIC ADVICE — every point specific to ${your_sku || product} vs ${comp_sku || competitor}
2. NAME REAL SPECS AND FEATURES — example: "Room Bar Pro uses on-device NPU for AI, Studio X50 requires Logitech cloud"
3. WIN PROBABILITY MIN 40%
4. ONLY confirmed weaknesses — omit if unsure
5. NO fake multipliers without published source

JSON only, no markdown:
{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 sentences specific to these products at ${stage}"},"killShot":"devastating differentiator with real spec or price data","competitorWeaknesses":["specific weakness real detail","specific weakness real detail","specific weakness real detail"],"counterMoves":[{"move":"title","timing":"when","action":"specific action with real product data"},{"move":"title","timing":"when","action":"specific action with real product data"},{"move":"title","timing":"when","action":"specific action with real product data"},{"move":"title","timing":"when","action":"specific action with real product data"}],"talkTrack":{"opening":"opening naming specific strength or competitor weakness","keyMessages":["specific with product detail","specific with product detail","specific with product detail"],"objectionHandlers":[{"objection":"real objection about ${competitor}","response":"specific response with ${product} advantage"},{"objection":"real objection","response":"specific"},{"objection":"real objection","response":"specific"}]},"emailTemplate":{"subject":"specific subject","body":"150-200 words ready to send placeholder [Name] only"}${partner ? `,"partnerIntel":"${partner} OEM portfolio, incentives, 3 co-sell strategies"` : ""}${company_size === "smb" || company_size === "mid" ? `,"sizeRecommendation":"product fit check with alternative SKU if oversized"` : ""}}`;

  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
