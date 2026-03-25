import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const isFlip = flip_mode === true || flip_mode === "true";
  const depthLabel = {"1":"business value and ROI only","2":"specific features and technical specs","3":"architecture and infrastructure differences","4":"integration complexity and total cost of ownership","5":"evidence from G2, Gartner, analyst reports"}[String(depth).split(",")[0]] || "specific features and technical specs";
  const prompt = `You are an elite B2B sales strategist. Generate a ${isFlip ? "competitor attack playbook showing how "+competitor+" beats "+product : "deal rescue plan for "+product+" vs "+competitor}.
DEAL: ${your_sku||product} (${your_pid||"no PID"}) vs ${comp_sku||competitor} (${comp_pid||"no PID"}) | Stage: ${stage} | Industry: ${industry||"B2B"} | Losing: ${reasons}${company_size?" | Size:"+company_size:""}${deal_size?" | Deal:"+deal_size:""}${partner?" | Partner:"+partner:""}${meddic_status?" | MEDDIC done:"+meddic_status:""}${geography?" | Region:"+geography:""}${audience?" | Audience:"+audience:""}${context?" | Context:"+context:""}
Depth: ${depthLabel}. SKU-level specifics only. Win probability min 40%. Only confirmed weaknesses. No fake stats.
Respond ONLY in this exact JSON format:
{"dealAssessment":{"winProbability":65,"urgency":"high","summary":"2 specific sentences"},"killShot":"one specific differentiator","competitorWeaknesses":["specific weakness 1","specific weakness 2","specific weakness 3"],"counterMoves":[{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"}],"talkTrack":{"opening":"specific opening line","keyMessages":["message 1","message 2","message 3"],"objectionHandlers":[{"objection":"objection 1","response":"response 1"},{"objection":"objection 2","response":"response 2"}]},"emailTemplate":{"subject":"subject line","body":"150 word email body ready to send"}${partner?',"partnerIntel":"partner analysis"':""}}`;
  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
