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
    "\n\nRULES: 1. Product-specific only real knowledge of " + competitor + ". 2. Compare " + (your_sku||product) + " vs " + (comp_sku||competitor) + " specifically. 3. Win probability min 40%. 4. Only confirmed weaknesses omit if unsure. 5. No fake multipliers without source." +
    "\n\nRespond ONLY valid JSON: { \"dealAssessment\": {\"winProbability\":<40-100>,\"urgency\":\"high|medium|low\",\"summary\":\"2 sentences\"}, \"killShot\":\"specific differentiator\", \"competitorWeaknesses\":[\"s1\",\"s2\",\"s3\"], \"counterMoves\":[{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"},{\"move\":\"t\",\"timing\":\"w\",\"action\":\"a\"}], \"talkTrack\":{\"opening\":\"str\",\"keyMessages\":[\"m1\",\"m2\",\"m3\"],\"objectionHandlers\":[{\"objection\":\"o\",\"response\":\"r\"},{\"objection\":\"o\",\"response\":\"r\"},{\"objection\":\"o\",\"response\":\"r\"}]}, \"emailTemplate\":{\"subject\":\"s\",\"body\":\"150-200 words\"}" +
    (partner ? ", \"partnerIntel\":\"partner analysis\"" : "") + " }";
  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, company_size, deal_size, partner, depth = 2, flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });
  const DEPTH = { 1: "Business value and ROI only. Zero jargon. CEO/CFO audience.", 2: "Specific features, specs, real product names and versions. VP Sales audience.", 3: "Architecture: cloud vs on-premise, API limits, data models, scalability. Solutions Architect.", 4: "Integration complexity, implementation timelines, ALL hidden costs. IT Director/Procurement.", 5: "Every claim backed by G2, Gartner, analyst reports, real benchmarks. Technical Evaluator." };
  const prompt = (flip_mode ? "FLIP MODE: You are a "+competitor+" rep. Show exactly how "+competitor+" attacks "+product+" in deals.\n\n" : "") +
    "DEAL: "+product+" vs "+competitor+" | Stage: "+stage+" | Industry: "+(industry||"B2B Tech")+" | Losing: "+reasons+
    (company_size ? " | Company size: "+company_size : "")+(deal_size ? " | Deal size: "+deal_size : "")+
    (partner ? " | Channel partner: "+partner+". Include partner OEM portfolio analysis and co-sell strategy." : "")+
    (context ? " | Context: "+context : "")+
    "\n\nDEPTH LEVEL "+depth+": "+(DEPTH[depth]||DEPTH[2])+
    "\n\nCRITICAL RULES:\n1. Product-specific only — real knowledge of "+competitor+" actual pricing, documented weaknesses, specific gaps. Zero generic advice.\n2. Compare "+（your_sku||product)+" vs "+(comp_sku||competitor)+" specifically — not parent companies.\n3. Win probability minimum 40% — rep taking action always has a chance.\n4. Only state weaknesses you are confident are accurate. Omit if unsure.\n5. No multipliers like 3X or 5X without a published source.\n\nRespond ONLY valid JSON no markdown:\n{\n  \"dealAssessment\": {\"winProbability\": <40-100>, \"urgency\": \"<high|medium|low>\", \"summary\": \"<2 sentences specific to these products>\"},\n  \"killShot\": \"<specific differentiator with real product names and data>\",\n  \"competitorWeaknesses\": [\"<specific>\", \"<specific>\", \"<specific>\"],\n  \"counterMoves\": [\n    {\"move\": \"<title>\", \"timing\": \"<when>\", \"action\": \"<specific>\"},\n    {\"move\": \"<title>\", \"timing\": \"<when>\", \"action\": \"<specific>\"},\n    {\"move\": \"<title>\", \"timing\": \"<when>\", \"action\": \"<specific>\"},\n    {\"move\": \"<title>\", \"timing\": \"<when>\", \"action\": \"<specific>\"}\n  ],\n  \"talkTrack\": {\n    \"opening\": \"<specific product strength by name>\",\n    \"keyMessages\": [\"<specific>\", \"<specific>\", \"<specific>\"],\n    \"objectionHandlers\": [\n      {\"objection\": \"<real objection>\", \"response\": \"<specific response>\"},\n      {\"objection\": \"<real objection>\", \"response\": \"<specific response>\"},\n      {\"objection\": \"<real objection>\", \"response\": \"<specific response>\"}\n    ]\n  },\n  \"emailTemplate\": {\"subject\": \"<specific subject>\", \"body\": \"<150-200 words ready to send>\"}"+(partner ? ",\n  \"partnerIntel\": \"<"+partner+" OEM portfolio, incentives, co-sell strategy>\"" : "")+(company_size==="smb"||company_size==="mid" ? ",\n  \"sizeRecommendation\": \"<product fit advisory with alternative SKU>\"" : "")+"\n}";
  try {
    const response = await anthropic.messages.create({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
