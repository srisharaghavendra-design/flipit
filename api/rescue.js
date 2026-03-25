import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const DEPTH = {
    "1": "Business value and ROI only. Executive audience. Zero technical jargon.",
    "2": "Specific features, real specs, actual capability differences. Name exact model numbers and feature names.",
    "3": "Architecture: cloud vs on-premise, API limits, data processing, latency, scalability. How are they built differently?",
    "4": "Cost and integration: TCO breakdown, hidden fees, implementation time, licensing traps, admin overhead.",
    "5": "Proof and evidence: G2 stats, Gartner ratings, analyst findings, customer case studies, benchmarks."
  };
  const depths = String(depth).split(",").map(d => d.trim()).filter(d => DEPTH[d]);
  const depthReq = depths.map(d => DEPTH[d]).join(" AND ");
  const isFlip = flip_mode === true || flip_mode === "true";
  const lines = [
    isFlip ? "You are a " + competitor + " sales rep showing how " + competitor + " attacks " + product + " in deals." : "You are an elite B2B sales strategist.",
    "DEAL: " + product + (your_pid ? " PID:" + your_pid : "") + " vs " + competitor + (comp_pid ? " PID:" + comp_pid : "") + " | " + stage + " | " + (industry || "B2B") + " | Losing: " + reasons + (company_size ? " | " + company_size : "") + (deal_size ? " | " + deal_size : "") + (partner ? " | Partner:" + partner : "") + (meddic_status ? " | MEDDIC:" + meddic_status : "") + (context ? " | " + context : ""),
    "DEPTH REQUIRED: " + (depthReq || DEPTH["2"]) + (audience ? " | Audience:" + audience : "") + (geography ? " | Geo:" + geography : ""),
    "RULES: Every point specific to " + (your_sku || product) + " vs " + (comp_sku || competitor) + ". Real feature names and specs. Win prob min 40%. Only confirmed weaknesses. No fake stats.",
    'Return JSON only: {"dealAssessment":{"winProbability":65,"urgency":"high","summary":"specific 2 sentences"},"killShot":"specific differentiator with real feature names","competitorWeaknesses":["real specific weakness","real specific weakness","real specific weakness"],"counterMoves":[{"move":"title","timing":"when","action":"specific with real data"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"}],"talkTrack":{"opening":"specific opening","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real objection","response":"specific"},{"objection":"real","response":"specific"},{"objection":"real","response":"specific"}]},"emailTemplate":{"subject":"specific","body":"150 words ready to send [Name] only"}' + (partner ? ',"partnerIntel":"' + partner + ' OEM portfolio and co-sell strategy"' : "") + (company_size === "smb" || company_size === "mid" ? ',"sizeRecommendation":"right-size with alternative SKU"' : "") + "}"
  ];
  const prompt = lines.join("\n");
  try {
    const r = await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 2048, messages: [{ role: "user", content: prompt }] });
    const clean = r.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
