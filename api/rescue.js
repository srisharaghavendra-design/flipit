import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const DEPTH_MAP = { "1": "Business value and ROI only. Zero technical jargon. CEO/CFO audience.", "2": "Specific features, specs, real product names and versions. VP Sales audience.", "3": "Architecture differences: cloud vs on-premise, API limits, data models, scalability. Solutions Architect audience.", "4": "Integration complexity, implementation timelines, ALL hidden costs including licensing traps. IT Director/Procurement audience.", "5": "Every claim backed by G2 stats, Gartner ratings, analyst reports, case studies, benchmarks. Technical Evaluator audience." };
  const depthNums = String(depth).split(",").map(d => d.trim()).filter(d => DEPTH_MAP[d]);
  const depthInstruction = depthNums.map(d => "Level " + d + ": " + DEPTH_MAP[d]).join(" | ");
  const geoContext = { apac: "APAC region: address data sovereignty, latency, local support SLAs, regional compliance.", india: "India market: address data localization laws, GST, local data centers, BIS certification, Indian language support.", emea: "EMEA region: address GDPR compliance, data residency, EU AI Act, local language support.", na: "North America: address FedRAMP, SOC2, HIPAA where relevant, US-based support.", emea: "Middle East: address data residency, Arabic language support, local partner ecosystem." };
  const audienceContext = { tdm: "Technical Decision Maker: go deep on specs, architecture, integration complexity.", bdm: "Business Decision Maker: focus on business outcomes, ROI, time to value.", cio: "CIO: focus on security, compliance, scalability, vendor risk, total cost.", cto: "CTO: focus on architecture, API quality, technical roadmap, developer experience.", cfo: "CFO/Finance: focus on TCO, hidden costs, budget justification, ROI payback period.", vp_sales: "VP Sales: focus on win rates, sales cycle impact, rep enablement, revenue outcomes.", end_user: "End User/Champion: focus on ease of use, adoption rate, training time, day-to-day productivity.", procurement: "Procurement: focus on licensing terms, contract flexibility, SLAs, vendor stability." };
  const prompt = (flip_mode ? "FLIP MODE: You are a " + competitor + " sales rep. Show EXACTLY how " + competitor + " is trained to attack " + product + " in competitive deals. Be brutally honest about their playbook.\n\n" : "") +
    "DEAL SITUATION:\n" +
    "- Our product: " + product + (your_pid ? " (PID: " + your_pid + ")" : "") + "\n" +
    "- Competitor: " + competitor + (comp_pid ? " (PID: " + comp_pid + ")" : "") + "\n" +
    "- Deal stage: " + stage + "\n" +
    "- Industry: " + (industry || "B2B Technology") + "\n" +
    "- Why losing: " + reasons + "\n" +
    (deal_type ? "- Deal type: " + deal_type + "\n" : "") +
    (company_size ? "- Customer size: " + company_size + "\n" : "") +
    (deal_size ? "- Deal size: " + deal_size + "\n" : "") +
    (partner ? "- Channel partner: " + partner + " - analyze their OEM portfolio, financial incentives, and provide co-sell strategy\n" : "") +
    (prospect_company ? "- Prospect company: " + prospect_company + " - research their stated priorities, ESG commitments, digital transformation agenda and align plan to those\n" : "") +
    (tco_model ? "- TCO model requested: " + tco_model + " - include specific cost comparison using this framework\n" : "") +
    (context ? "- Additional context: " + context + "\n" : "") +
    "\nOUTPUT DEPTH: " + depthInstruction + "\n" +
    (audience && audienceContext[audience] ? "\nAUDIENCE: " + audienceContext[audience] + "\n" : "") +
    (geography && geoContext[geography] ? "\nGEOGRAPHY: " + geoContext[geography] + "\n" : "") +
    "\nCRITICAL RULES:\n" +
    "1. SKU-LEVEL SPECIFICITY: Compare " + (your_sku || product) + " vs " + (comp_sku || competitor) + " - not parent companies in general\n" +
    "2. NO GENERIC ADVICE: Every point must be uniquely about these specific products\n" +
    "3. WIN PROBABILITY MINIMUM 40%: A rep taking action always has a fighting chance\n" +
    "4. ACCURACY FIRST: Only state weaknesses you are confident are accurate - omit if unsure\n" +
    "5. NO FAKE MULTIPLIERS: Never use 3X/5X/10X claims without a published source\n" +
    "6. PID AWARENESS: If PIDs provided, reference them in technical comparisons\n" +
    "\nRespond ONLY with valid JSON, no markdown, no preamble:\n" +
    '{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 sentences specific to these products and stage"},' +
    '"killShot":"single most devastating product-specific differentiator with real feature names or data",' +
    '"competitorWeaknesses":["specific documented weakness","specific documented weakness","specific documented weakness"],' +
    '"counterMoves":[{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"}],' +
    '"talkTrack":{"opening":"opening line referencing specific product strength","keyMessages":["specific message","specific message","specific message"],"objectionHandlers":[{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"}]},' +
    '"emailTemplate":{"subject":"specific subject line","body":"150-200 words ready to send only placeholder is [Name]"}' +
    (partner ? ',"partnerIntel":"analysis of ' + partner + ' OEM portfolio incentives and co-sell strategy"' : '') +
    (company_size === "smb" || company_size === "mid" ? ',"sizeRecommendation":"product fit advisory with alternative SKU if oversized"' : '') +
    '}';
  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 2500, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
