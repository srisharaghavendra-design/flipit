import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const depthInstructions = {
    "1":"OUTPUT=BUSINESS VALUE: Use exec language. ROI, cost savings, time to value only. Zero technical terms.",
    "2":"OUTPUT=TECHNICAL SPECS: Name actual features, version numbers, real capability differences. Be feature-specific.",
    "3":"OUTPUT=ARCHITECTURE: Explain how each is built differently. Cloud vs on-premise, API limits, data location, security model, scalability.",
    "4":"OUTPUT=TCO: Break down total cost. Implementation fees, hidden licensing, admin cost, migration timeline.",
    "5":"OUTPUT=EVIDENCE: Every claim needs a source. Reference G2, Gartner, analyst reports, published benchmarks."
  };
  const depths = String(depth).split(",").map(d=>d.trim()).filter(d=>depthInstructions[d]);
  const activeDepth = depths.length ? depths.map(d=>depthInstructions[d]).join(" ") : depthInstructions["2"];
  const isFlip = flip_mode===true||flip_mode==="true";
  const geo = {apac:"APAC data sovereignty.",india:"India: MeitY, BIS, data localization.",emea:"EMEA: GDPR, EU AI Act.",na:"FedRAMP, SOC2.",me:"ME data residency, Arabic."};
  const aud = {tdm:"Audience: technical.",bdm:"Audience: business buyer.",cio:"Audience: CIO security.",cto:"Audience: CTO architecture.",cfo:"Audience: CFO TCO.",vp_sales:"Audience: VP Sales.",end_user:"Audience: end user.",procurement:"Audience: procurement."};
  const sys = isFlip ? "You are a "+competitor+" rep. Attack "+product+" with their real weaknesses." : "You are an elite B2B sales strategist. Be specific - real specs, real prices, real gaps.";
  const user = activeDepth+(aud[audience]?" "+aud[audience]:"")+(geo[geography]?" "+geo[geography]:"")+
    "\nDEAL: "+product+(your_pid?" ["+your_pid+"]":"")+" vs "+competitor+(comp_pid?" ["+comp_pid+"]":"")+" | "+stage+" | "+(industry||"B2B")+" | Losing: "+reasons+
    (company_size?" | "+company_size:"")+(deal_size?" | "+deal_size:"")+(partner?" | Partner:"+partner:"")+(meddic_status?" | MEDDIC:"+meddic_status:"")+(context?" | "+context:"")+
    "\nRULES: Specific to "+(your_sku||product)+" vs "+(comp_sku||competitor)+". Win prob min 40%. Only confirmed weaknesses."+
    '\nJSON only: {"dealAssessment":{"winProbability":<int>,"urgency":"high|medium|low","summary":"<2 sentences>"},"killShot":"<specific differentiator>","competitorWeaknesses":["<specific>","<specific>","<specific>"],"counterMoves":[{"move":"<t>","timing":"<w>","action":"<specific>"},{"move":"<t>","timing":"<w>","action":"<specific>"},{"move":"<t>","timing":"<w>","action":"<specific>"}],"talkTrack":{"opening":"<specific>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<real>","response":"<specific>"},{"objection":"<real>","response":"<specific>"}]},"emailTemplate":{"subject":"<specific>","body":"<100 words max>"}}';
  try {
    const r = await anthropic.messages.create({model:"claude-haiku-4-5",max_tokens:4096,system:sys,messages:[{role:"user",content:user}]});
    const clean = r.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({error:err.message});
  }
}
