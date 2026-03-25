import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const depthInstructions = {
    "1":"STYLE=BUSINESS: ROI and value language only. No jargon.",
    "2":"STYLE=TECHNICAL: Name actual specs, features, version numbers.",
    "3":"STYLE=ARCHITECTURE: Cloud vs on-premise, APIs, data models, security design.",
    "4":"STYLE=TCO: Implementation costs, hidden licensing, migration complexity.",
    "5":"STYLE=EVIDENCE: Reference G2, Gartner, analyst reports, benchmarks."
  };
  const depths = String(depth).split(",").map(d=>d.trim()).filter(d=>depthInstructions[d]);
  const styleTag = depths.length ? depths.map(d=>depthInstructions[d]).join(" ") : depthInstructions["2"];
  const isFlip = flip_mode===true||flip_mode==="true";
  const geo={apac:"APAC data sovereignty.",india:"India MeitY BIS.",emea:"EMEA GDPR.",na:"FedRAMP SOC2.",me:"ME data residency."};
  const aud={tdm:"Audience=technical.",bdm:"Audience=business.",cio:"Audience=CIO.",cto:"Audience=CTO.",cfo:"Audience=CFO.",vp_sales:"Audience=VP Sales.",end_user:"Audience=end user.",procurement:"Audience=procurement."};
  const sys = isFlip
    ? "You are a "+competitor+" sales rep. Attack "+product+" using their real weaknesses and pricing gaps. Always respond with JSON only."
    : "You are a B2B sales strategist. Be product-specific. Name real specs and prices. Always respond with JSON only. Never refuse or ask for more info.";
  const user = styleTag+(aud[audience]?" "+aud[audience]:"")+(geo[geography]?" "+geo[geography]:"")+
    "\nDEAL: "+(your_sku||product)+(your_pid?" ["+your_pid+"]":"")+" vs "+(comp_sku||competitor)+(comp_pid?" ["+comp_pid+"]":"")+" | "+stage+" | "+(industry||"B2B")+" | "+reasons+
    (company_size?" | "+company_size:"")+(deal_size?" | "+deal_size:"")+(partner?" | Partner:"+partner:"")+(meddic_status?" | MEDDIC:"+meddic_status:"")+(context?" | "+context:"")+
    "\nNEVER refuse. Use your knowledge to fill specifics. Win prob min 40%. Only confirmed facts. No multipliers without source."+
    '\nReturn ONLY valid JSON, no text before or after, no markdown:'+
    '{"dealAssessment":{"winProbability":N,"urgency":"high|medium|low","summary":"2 sentences"},"killShot":"specific differentiator with real product detail","competitorWeaknesses":["specific","specific","specific"],"counterMoves":[{"move":"title","timing":"when","action":"specific with real data"},{"move":"title","timing":"when","action":"specific"},{"move":"title","timing":"when","action":"specific"}],"talkTrack":{"opening":"specific strength","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real","response":"specific"},{"objection":"real","response":"specific"}]},"emailTemplate":{"subject":"specific","body":"100 words max"}}';
  try {
    const r = await anthropic.messages.create({
      model:"claude-haiku-4-5",
      max_tokens:2000,
      system:sys,
      messages:[{role:"user",content:user}]
    });
    const clean = r.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({error:err.message});
  }
}
