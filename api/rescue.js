import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const depthMap = {"1":"Business value and ROI only. Zero jargon.","2":"Specific product features, real specs, version differences.","3":"Architecture: cloud vs on-premise, API limits, data models, security.","4":"TCO: implementation costs, hidden licensing, admin overhead, migration.","5":"Evidence: G2 stats, Gartner data, analyst reports, real benchmarks."};
  const depths = String(depth).split(",").map(d=>d.trim()).filter(d=>depthMap[d]);
  const depthText = depths.length ? depths.map(d=>"DEPTH "+d+": "+depthMap[d]).join(" | ") : "DEPTH 2: "+depthMap["2"];
  const isFlip = flip_mode===true||flip_mode==="true";
  const geo = {apac:"APAC data sovereignty and local compliance.",india:"India: data localization, MeitY, BIS certification.",emea:"EMEA: GDPR, EU AI Act.",na:"NA: FedRAMP, SOC2.",me:"ME: data residency, Arabic support."};
  const aud = {tdm:"deep technical specs",bdm:"business outcomes ROI",cio:"security compliance risk",cto:"architecture APIs roadmap",cfo:"TCO hidden costs payback",vp_sales:"win rates revenue",end_user:"ease of use adoption",procurement:"licensing SLAs terms"};
  const sys = isFlip
    ? "You are a "+competitor+" sales rep. Show exactly how "+competitor+" attacks "+product+" - name real "+product+" weaknesses and limitations."
    : "You are an elite B2B sales strategist. Be brutally specific - name real product specs, real prices, real feature gaps.";
  const user = "DEAL: "+product+(your_pid?" PID:"+your_pid:"")+" vs "+competitor+(comp_pid?" PID:"+comp_pid:"")+" | Stage:"+stage+" | Industry:"+(industry||"B2B")+" | Losing:"+reasons+(company_size?" | Size:"+company_size:"")+(deal_size?" | Deal:"+deal_size:"")+(partner?" | Partner:"+partner:"")+(meddic_status?" | MEDDIC:"+meddic_status:"")+(context?" | Context:"+context:"")+(audience&&aud[audience]?" | Audience:"+aud[audience]:"")+(geography&&geo[geography]?" | Geo:"+geo[geography]:"")+
    "\n"+depthText+
    "\nRULES: Every point specific to "+(your_sku||product)+" vs "+(comp_sku||competitor)+". Min win prob 40%. Only confirmed weaknesses. No fake stats."+
    '\nJSON only no markdown: {"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 specific sentences"},"killShot":"real spec or price differentiator","competitorWeaknesses":["specific detail","specific detail","specific detail"],"counterMoves":[{"move":"title","timing":"when","action":"specific with real data"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"}],"talkTrack":{"opening":"specific strength or weakness","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real","response":"specific"},{"objection":"real","response":"specific"},{"objection":"real","response":"specific"}]},"emailTemplate":{"subject":"specific","body":"150 words ready to send"}'+
    (partner?',"partnerIntel":"'+partner+' OEM portfolio and co-sell strategy"':'')+
    (company_size==="smb"||company_size==="mid"?',"sizeRecommendation":"product fit and alternative SKU"':'')+
    '}';
  try {
    const r = await anthropic.messages.create({model:"claude-sonnet-4-5",max_tokens:4096,system:sys,messages:[{role:"user",content:user}]});
    const clean = r.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({error:err.message});
  }
}
