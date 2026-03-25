import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, company_size, deal_size, partner, depth = 2, flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const DEPTH = { 1: "Business value ROI only. Zero jargon. CEO/CFO.", 2: "Specific features specs real product names. VP Sales.", 3: "Architecture cloud vs on-premise API limits data models. Solutions Architect.", 4: "Integration complexity implementation timelines ALL hidden costs. IT Director.", 5: "Every claim backed by G2 Gartner analyst reports benchmarks. Technical Evaluator." };
  const prompt = (flip_mode ? "FLIP MODE: You are a " + competitor + " rep. Show how " + competitor + " attacks " + product + " in deals.\n\n" : "") +
    "DEAL: " + product + " vs " + competitor + " | Stage: " + stage + " | Industry: " + (industry||"B2B Tech") + " | Losing: " + reasons +
    (company_size ? " | Company: "+company_size : "") + (deal_size ? " | Deal: "+deal_size : "") +
    (partner ? " | Partner: "+partner+". Analyze their OEM portfolio incentives and co-sell strategy." : "") +
    (context ? " | Context: "+context : "") +
    "\n\nDEPTH " + depth + ": " + (DEPTH[depth]||DEPTH[2]) +
    "\n\nRULES: Product-specific only. Win probability min 40%. Only confirmed weaknesses. No fake multipliers." +
    "\n\nRespond ONLY valid JSON: { \"dealAssessment\": {\"winProbability\":<40-100>,\"urgency\":\"high|medium|low\",\"summary\":\"2 sentences\"}, \"killShot\":\"specific differentiator\", \"competitorWeaknesses\":[\"s1\",\"s2\",\"s3\"], \"counterMoves\":[{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"}], \"talkTrack\":{\"opening\":\"str\",\"keyMessages\":[\"m1\",\"m2\",\"m3\"],\"objectionHandlers\":[{\"objection\":\"o\",\"response\":\"r\"},{\"objection\":\"o\",\"response\":\"r\"},{\"objection\":\"o\",\"response\":\"r\"}]}, \"emailTemplate\":{\"subject\":\"s\",\"body\":\"150-200 words\"} }";
  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
