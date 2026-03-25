import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const DEPTH = {
    "1": "OUTPUT STYLE = BUSINESS VALUE ONLY: Use executive language. ROI, payback period, business outcomes. Zero technical terms. Every sentence must connect to revenue or cost.",
    "2": "OUTPUT STYLE = TECHNICAL SPECS: Name actual product features, real spec numbers, version differences, capability gaps between " + (your_sku||product) + " and " + (comp_sku||competitor) + ". No vague statements.",
    "3": "OUTPUT STYLE = ARCHITECTURE DEEP DIVE: Explain cloud vs on-premise trade-offs, API rate limits, data processing architecture, latency differences, security model differences between the two products.",
    "4": "OUTPUT STYLE = COST AND INTEGRATION: Break down hidden licensing fees, implementation timelines, professional services costs, admin overhead, migration complexity. Make the TCO case.",
    "5": "OUTPUT STYLE = EVIDENCE AND PROOF: Every claim needs a source. Cite G2 ratings, Gartner peer insights, analyst reports, public benchmarks, documented customer outcomes."
  };
  const depths = String(depth).split(",").map(d=>d.trim()).filter(d=>DEPTH[d]);
  const depthRule = depths.length ? depths.map(d=>DEPTH[d]).join("\n") : DEPTH["2"];
  const isFlip = flip_mode===true||flip_mode==="true";
  const geoCtx = {apac:"Include APAC data sovereignty and regional compliance angle.",india:"Include India data localization, MeitY, BIS certification angle.",emea:"Include GDPR and EU AI Act angle.",na:"Include FedRAMP and SOC2 angle.",me:"Include Middle East data residency and Arabic support angle."};
  const audCtx = {tdm:"Audience is a technical evaluator. Lead with specs and architecture.",bdm:"Audience is a business decision maker. Lead with outcomes and ROI.",cio:"Audience is CIO. Lead with security, compliance, and risk.",cto:"Audience is CTO. Lead with architecture, APIs, and roadmap.",cfo:"Audience is CFO. Lead with TCO, hidden costs, and payback.",vp_sales:"Audience is VP Sales. Lead with win rates and revenue impact.",end_user:"Audience is end user. Lead with ease of use and productivity.",procurement:"Audience is procurement. Lead with licensing terms and SLAs."};

  const prompt =
    depthRule + "\n\n" +
    (audCtx[audience] ? audCtx[audience]+"\n\n" : "") +
    (geoCtx[geography] ? geoCtx[geography]+"\n\n" : "") +
    (isFlip
      ? "You are a "+competitor+" sales rep. Show exactly how "+competitor+" attacks "+product+" in deals. Name "+product+"'s real weaknesses."
      : "You are an elite B2B sales strategist. Generate a deal rescue plan.") +
    "\n\nDEAL: "+(your_sku||product)+(your_pid?" ["+your_pid+"]":"")+" vs "+(comp_sku||competitor)+(comp_pid?" ["+comp_pid+"]":"")+" | Stage: "+stage+" | Industry: "+(industry||"B2B")+" | Losing: "+reasons+(company_size?" | Size: "+company_size:"")+(deal_size?" | Deal: "+deal_size:"")+(partner?" | Partner: "+partner:"")+(meddic_status?" | MEDDIC done: "+meddic_status:"")+(context?" | Context: "+context:"") +
    "\n\nRULES:\n- ZERO generic advice. Every point names real "+competitor+" vs "+(your_sku||product)+" specifics.\n- Win probability minimum 40%.\n- Only confirmed weaknesses. Omit if unsure.\n- No multipliers (3X/5X) without a real source.\n- STRICTLY follow the OUTPUT STYLE defined above in every field.\n\n" +
    'Respond with valid JSON only:\n{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"<2 sentences>"},"killShot":"<1 sentence real differentiator>","competitorWeaknesses":["<specific>","<specific>","<specific>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"}],"talkTrack":{"opening":"<specific>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<real>","response":"<specific>"},{"objection":"<real>","response":"<specific>"}]},"emailTemplate":{"subject":"<specific>","body":"<120 words max>"}'+(partner?',"partnerIntel":"<'+partner+' strategy>"':'')+'}';

  try {
    const r = await anthropic.messages.create({model:"claude-sonnet-4-5",max_tokens:2000,messages:[{role:"user",content:prompt}]});
    const clean = r.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({error:err.message});
  }
}
