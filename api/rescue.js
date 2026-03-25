import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, deal_type, tco_model, prospect_company, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const depths = String(depth).split(",").map(d=>d.trim());
  const depthText = depths.map(d => ({
    "1":"L1 Business: ROI and value only, zero jargon, executive audience.",
    "2":"L2 Technical: specific features, real product names, specs, capability differences.",
    "3":"L3 Architecture: cloud vs on-premise, API limits, data models, scalability constraints.",
    "4":"L4 Integration: implementation timelines, hidden costs, licensing traps, TCO.",
    "5":"L5 Evidence: back every claim with G2 stats, Gartner ratings, analyst data, benchmarks."
  }[d] || "")).filter(Boolean).join(" ");

  const audienceMap = {tdm:"Technical evaluator: go deep on specs and architecture.",bdm:"Business decision maker: focus on outcomes and ROI.",cio:"CIO: security, compliance, vendor risk, scalability.",cto:"CTO: architecture, APIs, roadmap, technical debt.",cfo:"CFO: TCO, hidden costs, payback period.",vp_sales:"VP Sales: win rates, revenue impact.",end_user:"End user: ease of use, adoption, daily productivity.",procurement:"Procurement: licensing terms, SLAs, vendor stability."};
  const geoMap = {apac:"APAC: data sovereignty, latency, local support, regional compliance.",india:"India: data localization, MeitY guidelines, local data centers, BIS certification, Indian language support.",emea:"EMEA: GDPR, data residency, EU AI Act.",na:"North America: FedRAMP, SOC2, HIPAA.",me:"Middle East: data residency, Arabic support, local ecosystem."};

  const isFlip = flip_mode === true || flip_mode === "true";

  const systemPrompt = isFlip
    ? `You are a ${competitor} sales rep. Show EXACTLY how ${competitor} attacks ${product} in competitive deals. Be brutally specific about their playbook, attack angles, and objection strategies against ${product}.`
    : `You are an elite B2B sales strategist. Generate a specific deal rescue plan for ${product} vs ${competitor}.`;

  const userPrompt = `DEAL: ${product}${your_pid?" (PID:"+your_pid+")":""} vs ${competitor}${comp_pid?" (PID:"+comp_pid+")":""} | Stage: ${stage} | Industry: ${industry||"B2B Tech"} | Losing: ${reasons}${company_size?" | Size:"+company_size:""}${deal_size?" | Deal:"+deal_size:""}${partner?" | Partner:"+partner:""}${audience?" | Audience:"+audience:""}${geography?" | Geo:"+geography:""}${deal_type?" | Type:"+deal_type:""}${tco_model?" | TCO:"+tco_model:""}${prospect_company?" | Prospect co:"+prospect_company+" (align to their ESG/digital transformation priorities)":""}${context?" | Context:"+context:""}

DEPTH: ${depthText||"L2 Technical: specific features, real product names, specs."}
${audienceMap[audience]||""}
${geoMap[geography]||""}

RULES:
1. Compare ${your_sku||product} vs ${comp_sku||competitor} specifically - SKU level not company level
2. Win probability MINIMUM 40%
3. Only state weaknesses you are CONFIDENT are accurate - omit if unsure
4. NO fake multipliers (3X/5X) without a published source
5. Every point must be specific to THESE products - zero generic advice

Respond ONLY valid JSON no markdown:
{"dealAssessment":{"winProbability":<40-100>,"urgency":"high|medium|low","summary":"2 sentences specific to ${isFlip?competitor+" attacking "+product:product+" vs "+competitor} at ${stage}"},"killShot":"<${isFlip?"their most devastating attack against "+product:"your single best differentiator vs "+competitor}>","competitorWeaknesses":["<${isFlip?"vuln of "+product+" they exploit":"weakness of "+competitor}> specific","<specific>","<specific>","<specific>"],"counterMoves":[{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"},{"move":"title","timing":"when","action":"specific action"}],"talkTrack":{"opening":"specific opening","keyMessages":["specific","specific","specific"],"objectionHandlers":[{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"},{"objection":"real objection","response":"specific response"}]},"emailTemplate":{"subject":"specific subject","body":"150 words ready to send only placeholder [Name]"}${partner?',"partnerIntel":"'+partner+' OEM analysis and co-sell strategy"':""}${company_size==="smb"||company_size==="mid"?',"sizeRecommendation":"product fit check with alternative SKU if needed"':""}}
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1800,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt
    });
    const clean = response.content[0].text.trim().replace(/```json|```/g,"").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
