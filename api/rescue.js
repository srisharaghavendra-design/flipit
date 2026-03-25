import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const depths = String(depth).split(",").map(d => d.trim());
  const depthText = depths.map(d => ({"1":"Business Value: ROI and exec talking points only.","2":"Technical Specs: specific features, real product names, capability differences.","3":"Architecture: cloud vs on-premise, API limits, data models, scalability.","4":"Cost & Integration: implementation timelines, hidden costs, licensing traps, TCO.","5":"Proof & Evidence: G2 stats, Gartner ratings, analyst data, benchmarks."}[d]||"")).filter(Boolean).join(" ");
  const audienceMap = {tdm:"Technical evaluator: deep specs.",bdm:"Business decision maker: outcomes and ROI.",cio:"CIO: security compliance vendor risk.",cto:"CTO: architecture APIs roadmap.",cfo:"CFO: TCO hidden costs payback.",vp_sales:"VP Sales: win rates revenue.",end_user:"End user: ease of use adoption.",procurement:"Procurement: licensing SLAs."};
  const geoMap = {apac:"APAC: data sovereignty latency local support.",india:"India: data localization MeitY guidelines BIS certification.",emea:"EMEA: GDPR data residency.",na:"North America: FedRAMP SOC2 HIPAA.",me:"Middle East: data residency Arabic support."};
  const isFlip = flip_mode === true || flip_mode === "true";
  const prompt = (isFlip ? "You are a "+competitor+" sales rep. Show EXACTLY how "+competitor+" attacks "+product+" in deals.\n\n" : "You are an elite B2B sales strategist.\n\n") +
    "DEAL: "+product+(your_pid?" (PID:"+your_pid+")":"")+" vs "+competitor+(comp_pid?" (PID:"+comp_pid+")":"")+" | Stage: "+stage+" | Industry: "+(industry||"B2B Tech")+" | Losing: "+reasons+(company_size?" | Size:"+company_size:"")+(deal_size?" | Deal:"+deal_size:"")+(partner?" | Partner:"+partner:"")+(meddic_status?" | MEDDIC:"+meddic_status:"")+(prospect_company?" | Prospect:"+prospect_company+" align to their ESG/priorities":"")+(context?" | Context:"+context:"")+"\nDEPTH: "+(depthText||"Technical Specs.")+(audienceMap[audience]?" AUDIENCE:"+audienceMap[audience]:"")+(geoMap[geography]?" GEO:"+geoMap[geography]:"")+"\nRULES: SKU-level only. Win prob min 40%. Only confirmed weaknesses. No fake multipliers. Zero generic advice.\n\nRespond ONLY valid JSON no markdown:\n"+
    '{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 specific sentences"},"killShot":"specific differentiator","competitorWeaknesses":["specific","specific","specific","specific"],"counterMoves":[{"move":"t","timing":"w","action":"a"},{"move":"t","timing":"w","action":"a"},{"move":"t","timing":"w","action":"a"},{"move":"t","timing":"w","action":"a"}],"talkTrack":{"opening":"specific","keyMessages":["s","s","s"],"objectionHandlers":[{"objection":"o","response":"r"},{"objection":"o","response":"r"},{"objection":"o","response":"r"}]},"emailTemplate":{"subject":"s","body":"150 words ready to send"}'+
    (partner?',"partnerIntel":"partner OEM analysis co-sell"':"")+
    (company_size==="smb"||company_size==="mid"?',"sizeRecommendation":"product fit check alternative SKU"':"")+
    '}';
  try {
    const response = await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
