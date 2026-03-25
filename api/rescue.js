import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const depths = String(depth).split(",").map(d => d.trim());
  const depthText = depths.map(d => ({ "1":"Business Value: ROI and exec talking points only.", "2":"Technical Specs: specific features, real product names, capability differences.", "3":"Architecture: cloud vs on-premise, API limits, data models, scalability.", "4":"Cost & Integration: implementation timelines, hidden costs, licensing traps, TCO.", "5":"Proof & Evidence: G2 stats, Gartner ratings, analyst data, benchmarks." }[d] || "")).filter(Boolean).join(" ");
  const audienceMap = { tdm:"Technical evaluator: deep specs and architecture.", bdm:"Business decision maker: outcomes and ROI.", cio:"CIO: security compliance vendor risk.", cto:"CTO: architecture APIs roadmap.", cfo:"CFO: TCO hidden costs payback period.", vp_sales:"VP Sales: win rates revenue impact.", end_user:"End user: ease of use adoption.", procurement:"Procurement: licensing terms SLAs." };
  const geoMap = { apac:"APAC region: data sovereignty latency local support.", india:"India market: data localization MeitY guidelines local data centers BIS certification.", emea:"EMEA: GDPR data residency EU AI Act.", na:"North America: FedRAMP SOC2 HIPAA.", me:"Middle East: data residency Arabic support." };
  const isFlip = flip_mode === true || flip_mode === "true";

  const prompt = (isFlip ? `You are a ${competitor} sales rep. Show EXACTLY how ${competitor} attacks ${product} in competitive deals.` : `You are an elite B2B sales strategist generating a deal rescue plan.`) +
    `\n\nDEAL: ${product}${your_pid?" (PID:"+your_pid+")":""} vs ${competitor}${comp_pid?" (PID:"+comp_pid+")":""} | Stage: ${stage} | Industry: ${industry||"B2B Tech"} | Losing: ${reasons}${company_size?" | Size:"+company_size:""}${deal_size?" | Deal:"+deal_size:""}${partner?" | Partner:"+partner:""}${meddic_status?" | MEDDIC completed:"+meddic_status:""}${prospect_company?" | Prospect:"+prospect_company+" align to their ESG/priorities":""}${context?" | Context:"+context:""}\nDEPTH: ${depthText||"Technical Specs: specific features real product names."}${audienceMap[audience]?" AUDIENCE:"+audienceMap[audience]:""}${geoMap[geography]?" GEO:"+geoMap[geography]:""}\nRULES: SKU-level specificity. Win probability min 40%. Only confirmed weaknesses. No fake multipliers. Zero generic advice.\n\nRespond ONLY valid JSON:\n{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 specific sentences"},"killShot":"specific differentiator with real product names","competitorWeaknesses":["specific","specific","specific","specific"],"counterMoves":[{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"}],"talkTrack":{"opening":"specific opening","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real","response":"specific"},{"objection":"real","response":"specific"},{"objection":"real","response":"specific"}]},"emailTemplate":{"subject":"specific","body":"150 words ready to send"}${partner?',"partnerIntel":"partner OEM analysis co-sell strategy"':""}${company_size==="smb"||company_size==="mid"?',"sizeRecommendation":"product fit check alternative SKU if needed"':""}}`;

  // Set streaming headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }]
    });

    let fullText = "";
    stream.on("text", (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    });

    await stream.finalMessage();
    res.write(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
    res.end();
  } catch (err) {
    console.error("rescue error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}
