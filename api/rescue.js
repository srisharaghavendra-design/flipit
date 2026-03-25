import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, meddic_status, depth = "2", flip_mode = false, nl_input, use_nl } = req.body;

  // Natural language mode — generate plan directly from description
  if (use_nl && nl_input) {
    const nlPrompt = `You are an elite B2B sales strategist. A sales rep described their deal situation in plain English:

"${nl_input}"

Extract the competitive situation and generate a deal rescue plan. Infer the products, stage, and issues from the description.

RULES: Be specific to the products mentioned. Win probability min 40%. Only confirmed weaknesses.

Respond ONLY valid JSON no markdown:
{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 specific sentences about this deal"},"killShot":"specific differentiator based on the products mentioned","competitorWeaknesses":["specific weakness","specific weakness","specific weakness"],"counterMoves":[{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"}],"talkTrack":{"opening":"specific opening line","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"}]},"emailTemplate":{"subject":"specific subject","body":"150 words ready to send only placeholder [Name]"}}`;
    try {
      const response = await anthropic.messages.create({ model: "claude-haiku-4-5", max_tokens: 2500, messages: [{ role: "user", content: nlPrompt }] });
      const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
      return res.status(200).json(JSON.parse(clean));
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const depths = String(depth).split(",").map(d => d.trim());
  const depthInstructions = {
    "1": "BUSINESS VALUE DEPTH: Focus only on business outcomes, ROI, time-to-value, cost savings, revenue impact. No technical specs. Use language a CEO or CFO would appreciate. Example: instead of 'lower latency', say 'your team spends 40% less time on IT support calls'.",
    "2": "TECHNICAL SPECS DEPTH: Include specific product features, real model numbers, version differences, capability comparisons. Example: 'Room Bar Pro has a dedicated NPU for on-device AI vs Poly Studio X50 which relies on cloud processing — meaning it works even when internet is slow'.",
    "3": "ARCHITECTURE DEPTH: Explain HOW the products are built differently. Cloud-native vs on-premise, microservices vs monolith, API rate limits, data processing models, multi-tenancy, containerization, failover architecture. Include actual technical constraints like API call limits, storage caps, processing bottlenecks.",
    "4": "COST AND INTEGRATION DEPTH: Break down TOTAL cost of ownership — not just license fees. Include implementation partner fees, admin salary requirements, training costs, integration development hours, maintenance overhead, hidden licensing tiers. Name specific gotchas like 'Salesforce charges extra for API calls above 15k/day on Enterprise'.",
    "5": "PROOF AND EVIDENCE DEPTH: Back EVERY claim with a real source. G2 review statistics with review count, Gartner Magic Quadrant positioning and year, Forrester Wave scores, IDC reports, Frost & Sullivan rankings, specific customer case studies with company names and measurable outcomes, publicly available benchmark data."
  };
  const depthText = depths.map(d => depthInstructions[d] || "").filter(Boolean).join("\n\n");

  const audienceMap = {
    tdm: "AUDIENCE - Technical Decision Maker: Go deep on specs, architecture, integration complexity, security posture, API capabilities, and deployment requirements.",
    bdm: "AUDIENCE - Business Decision Maker: Focus on business outcomes, competitive win rates, time to value, total cost, and strategic fit.",
    cio: "AUDIENCE - CIO: Emphasize security certifications, compliance (ISO27001, SOC2, GDPR), vendor stability, scalability roadmap, and risk mitigation.",
    cto: "AUDIENCE - CTO: Focus on API quality, architecture decisions, technical debt implications, developer experience, and long-term platform scalability.",
    cfo: "AUDIENCE - CFO/Finance: All costs including hidden fees, 3-year TCO comparison, ROI calculation, budget predictability, and payback period.",
    vp_sales: "AUDIENCE - VP Sales: Win rate impact, sales cycle length, rep enablement quality, competitive displacement success stories, and revenue outcomes.",
    end_user: "AUDIENCE - End User/Champion: Ease of use, daily workflow impact, learning curve, support quality, adoption rates from similar users.",
    procurement: "AUDIENCE - Procurement: Contract flexibility, SLA terms, penalty clauses, vendor financial stability, renewal terms, and total commitment required."
  };

  const geoMap = {
    apac: "GEOGRAPHY - APAC: Address data sovereignty laws, regional latency (mention specific ms targets), local language support, regional support SLAs, APAC-specific certifications.",
    india: "GEOGRAPHY - India: Address data localization under DPDP Act, MeitY empanelment, local data centers (Mumbai/Hyderabad/Chennai), BIS certification, GST implications, Indian language support.",
    emea: "GEOGRAPHY - EMEA: Address GDPR Article 28 compliance, data residency requirements, EU AI Act implications, local DPA requirements, right to erasure capabilities.",
    na: "GEOGRAPHY - North America: Address FedRAMP authorization level, SOC2 Type II, HIPAA BAA availability, ITAR compliance if relevant, US-based support SLA.",
    me: "GEOGRAPHY - Middle East: Address data residency in-country, Arabic language support, local cloud region availability, government security certifications."
  };

  const isFlip = flip_mode === true || flip_mode === "true";

  const systemContext = isFlip
    ? `You are a ${competitor} sales rep competing against ${product}. Your job is to show exactly how ${competitor} is trained to attack ${product} in competitive deals.`
    : `You are an elite B2B sales strategist helping a ${product} rep rescue a deal against ${competitor}.`;

  const prompt = `${systemContext}

DEAL SITUATION:
- Our product: ${product}${your_pid ? ` (PID: ${your_pid})` : ""}
- Competitor: ${competitor}${comp_pid ? ` (PID: ${comp_pid})` : ""}
- Deal stage: ${stage}
- Industry: ${industry || "B2B Technology"}
- Why losing: ${reasons}${company_size ? `\n- Customer size: ${company_size}` : ""}${deal_size ? `\n- Deal size: ${deal_size}` : ""}${partner ? `\n- Channel partner: ${partner} — analyze their OEM portfolio and financial incentives` : ""}${meddic_status ? `\n- MEDDPICC confirmed: ${meddic_status} — tailor advice to fill the GAPS not listed here` : ""}${prospect_company ? `\n- Prospect company: ${prospect_company} — align plan to their publicly stated priorities (ESG, digital transformation, etc)` : ""}${tco_model ? `\n- TCO model requested: ${tco_model}` : ""}${context ? `\n- Additional context: ${context}` : ""}

${depthText || depthInstructions["2"]}

${audienceMap[audience] || ""}
${geoMap[geography] || ""}

CRITICAL RULES:
1. Compare ${your_sku || product} vs ${comp_sku || competitor} at SKU level — not parent companies
2. Every point must be UNIQUELY about these specific products — zero generic advice
3. Win probability MINIMUM 40%
4. Only state weaknesses you are CONFIDENT are accurate — omit if unsure
5. NO fake multipliers (3X/5X) without a published source with year
6. MEDDPICC gap analysis: if meddic_status shows missing items, include specific actions to close those gaps

Respond ONLY valid JSON no markdown:
{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 sentences specific to ${isFlip ? competitor + " vs " + product : product + " vs " + competitor} at ${stage}"},"killShot":"${isFlip ? "their most devastating attack on " + product : "single best differentiator vs " + competitor} — with real product names and specific data","competitorWeaknesses":["specific with detail","specific with detail","specific with detail","specific with detail"],"counterMoves":[{"move":"title","timing":"when","action":"specific action with product names"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"}],"talkTrack":{"opening":"opening line referencing specific product capability","keyMessages":["specific message with product name","specific","specific"],"objectionHandlers":[{"objection":"real objection this prospect will raise","response":"specific response using product advantages"},{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"}]},"emailTemplate":{"subject":"specific subject referencing their pain","body":"150-200 words ready to send only placeholder [Name]"}${partner ? `,"partnerIntel":"${partner} OEM portfolio analysis, financial incentives, and co-sell strategy"` : ""}${company_size === "smb" || company_size === "mid" ? `,"sizeRecommendation":"product fit check — flag if oversized and suggest correct SKU"` : ""}}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }]
    });
    const clean = response.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
