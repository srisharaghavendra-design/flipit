import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const depthInstructions = {
    "1": "OUTPUT STYLE = BUSINESS VALUE ONLY: Use executive language. Focus on ROI, cost savings, time to value. Zero technical terms. Audience is CEO/CFO/Board.",
    "2": "OUTPUT STYLE = TECHNICAL SPECS: Name actual product features, version numbers, and capability differences. Example: 'Room Bar Pro has 4K 120° FOV vs Studio X50 4K 90° FOV'. Be feature-specific.",
    "3": "OUTPUT STYLE = ARCHITECTURE DEEP DIVE: Explain how each product is built differently. Cloud vs on-premise, API rate limits, data processing location, security model, scalability ceilings.",
    "4": "OUTPUT STYLE = COST AND INTEGRATION: Break down total cost of ownership. Name implementation fees, hidden licensing, admin FTE cost, integration complexity, migration timeline.",
    "5": "OUTPUT STYLE = EVIDENCE AND PROOF: Every claim needs a source. Reference G2 ratings, Gartner peer scores, analyst reports by name, published benchmarks, documented case studies."
  };

  const depths = String(depth).split(",").map(d => d.trim()).filter(d => depthInstructions[d]);
  const activeDepth = depths.length ? depths.map(d => depthInstructions[d]).join("\n") : depthInstructions["2"];
  const isFlip = flip_mode === true || flip_mode === "true";

  const geoCtx = {apac:"Address APAC data sovereignty, latency, local support SLAs.",india:"Address India: data localization, MeitY, BIS certification, rupee context.",emea:"Address EMEA: GDPR, EU AI Act, data residency.",na:"Address NA: FedRAMP, SOC2, HIPAA.",me:"Address ME: data residency, Arabic support."};
  const audCtx = {tdm:"Audience=technical evaluator, maximize spec depth.",bdm:"Audience=business buyer, maximize ROI and outcomes.",cio:"Audience=CIO, focus security compliance vendor risk.",cto:"Audience=CTO, focus architecture and APIs.",cfo:"Audience=CFO, focus TCO and payback.",vp_sales:"Audience=VP Sales, focus win rates and revenue.",end_user:"Audience=end user, focus ease of use.",procurement:"Audience=procurement, focus contract terms and SLAs."};

  const system = isFlip
    ? `You are a ${competitor} sales rep in a competitive deal. Show EXACTLY how you attack ${product}: their real weaknesses, pricing vulnerabilities, architectural limitations.`
    : `You are an elite B2B sales strategist. Generate a specific rescue plan for ${product} vs ${competitor}.`;

  const user = `${activeDepth}
${audCtx[audience]||""}
${geoCtx[geography]||""}

DEAL: ${product}${your_pid?" ["+your_pid+"]":""} vs ${competitor}${comp_pid?" ["+comp_pid+"]":""}
Stage: ${stage} | Industry: ${industry||"B2B"} | Losing: ${reasons}
${company_size?"Size: "+company_size+" | ":""}${deal_size?"Deal: "+deal_size+" | ":""}${partner?"Partner: "+partner+" | ":""}${meddic_status?"MEDDIC done: "+meddic_status+" | ":""}${context?"Context: "+context:""}

MANDATORY RULES:
- Every point SPECIFIC to ${your_sku||product} vs ${comp_sku||competitor} - zero generic advice
- Win probability minimum 40%
- Only state weaknesses you are CERTAIN are accurate
- No multipliers (3X, 5X) without real published source

Respond with JSON only, no markdown:
{"dealAssessment":{"winProbability":<int>,"urgency":"high|medium|low","summary":"<2 sentences>"},"killShot":"<specific differentiator>","competitorWeaknesses":["<specific>","<specific>","<specific>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"},{"move":"<title>","timing":"<when>","action":"<specific>"}],"talkTrack":{"opening":"<specific>","keyMessages":["<specific>","<specific>","<specific>"],"objectionHandlers":[{"objection":"<real>","response":"<specific>"},{"objection":"<real>","response":"<specific>"},{"objection":"<real>","response":"<specific>"}]},"emailTemplate":{"subject":"<specific>","body":"<150 words>"}}`;

  try {
    const r = await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 3000, system, messages: [{ role: "user", content: user }] });
    const clean = r.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
