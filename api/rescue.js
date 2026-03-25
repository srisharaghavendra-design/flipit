import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, tco_model, prospect_company, meddic_status, context, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const isFlip = flip_mode === true || flip_mode === "true";
  const depthLabel = {"1":"business value and ROI only","2":"specific technical features and real specs","3":"architectural differences cloud vs on-premise API limits","4":"TCO hidden costs implementation timelines","5":"backed by G2 Gartner analyst data"}[String(depth).split(",")[0]] || "specific technical features";
  const geo = {"apac":"APAC data sovereignty local support","india":"India MeitY data localization BIS","emea":"EMEA GDPR data residency","na":"NA FedRAMP SOC2","me":"ME data residency Arabic support"}[geography] || "";
  const aud = {"tdm":"technical evaluator","bdm":"business decision maker","cio":"CIO security compliance","cto":"CTO architecture","cfo":"CFO TCO costs","vp_sales":"VP Sales","end_user":"end user ease of use","procurement":"procurement licensing"}[audience] || "";
  const p = (isFlip
    ? `You are a ${competitor} rep. Show how ${competitor} attacks ${product}. Be specific.`
    : `Elite B2B sales strategist. Rescue plan for ${product} vs ${competitor}.`) +
    ` Deal: ${product}${your_pid?" PID:"+your_pid:""} vs ${competitor}${comp_pid?" PID:"+comp_pid:""}. Stage:${stage}. Industry:${industry||"B2B"}. Losing:${reasons}.${company_size?" Size:"+company_size+".":""}${deal_size?" Deal:"+deal_size+".":""}${partner?" Partner:"+partner+".":""}${meddic_status?" MEDDIC:"+meddic_status+".":""}${prospect_company?" Prospect:"+prospect_company+".":""}${tco_model?" TCO:"+tco_model+".":""}${context?" Context:"+context+".":" "}Depth:${depthLabel}.${aud?" Audience:"+aud+".":""}${geo?" Geo:"+geo+".":" "}Rules:SKU-specific only.Win prob min 40%.Only confirmed weaknesses.No fake stats.\nJSON only:\n{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 sentences"},"killShot":"specific differentiator with real data","competitorWeaknesses":["specific","specific","specific"],"counterMoves":[{"move":"t","timing":"w","action":"specific"},{"move":"t","timing":"w","action":"specific"},{"move":"t","timing":"w","action":"specific"},{"move":"t","timing":"w","action":"specific"}],"talkTrack":{"opening":"specific","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real","response":"specific"},{"objection":"real","response":"specific"},{"objection":"real","response":"specific"}]},"emailTemplate":{"subject":"specific","body":"120 words [Name] only"}${partner?',"partnerIntel":"co-sell strategy"':""}${company_size==="smb"||company_size==="mid"?',"sizeRecommendation":"alternative SKU if oversized"':""}}`;
  try {
    const r = await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 2048, messages: [{ role: "user", content: p }] });
    const clean = r.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
