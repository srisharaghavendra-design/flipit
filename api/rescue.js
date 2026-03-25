import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku, your_pid, comp_pid, company_size, deal_size, partner, audience, geography, meddic_status, depth = "2", flip_mode = false } = req.body;
  if (!product || !competitor || !stage || !reasons) return res.status(400).json({ error: "Missing required fields" });

  const isFlip = flip_mode === true || flip_mode === "true";

  const depthInstructions = {
    "1": "Write at BUSINESS VALUE level: ROI numbers, business outcomes, payback periods, executive language only. No technical terms.",
    "2": "Write at TECHNICAL SPECS level: name actual product features, real version numbers, specific capability gaps between " + (your_sku||product) + " and " + (comp_sku||competitor) + ". Example: 'Room Bar Pro has 4K 120° FOV vs Studio X50's 4K 90° FOV'.",
    "3": "Write at ARCHITECTURE level: explain HOW each product works differently. On-device vs cloud processing, API rate limits, data flow, latency sources, scalability ceilings, security model.",
    "4": "Write at COST & INTEGRATION level: break down ALL costs including hidden ones. Implementation days, PS fees, admin FTE, license traps, integration complexity with existing stack.",
    "5": "Write at PROOF & EVIDENCE level: cite real data for every claim. G2 ratings with scores, Gartner MQ positions, analyst quotes, customer win rates, documented case studies."
  };

  const depths = String(depth).split(",").map(d => d.trim()).filter(d => depthInstructions[d]);
  const activeDepth = depths.length ? depths.map(d => depthInstructions[d]).join(" ALSO: ") : depthInstructions["2"];

  const geo = { apac:"APAC context: data sovereignty, latency, local DCs, regional compliance.", india:"India context: data localization, MeitY, BIS cert, rupee pricing.", emea:"EMEA context: GDPR, data residency, EU AI Act.", na:"NA context: FedRAMP, SOC2, HIPAA.", me:"ME context: data residency laws, Arabic support." };
  const aud = { tdm:"audience is a Technical Decision Maker — go deep on specs and architecture", bdm:"audience is a Business Decision Maker — focus on outcomes and ROI", cio:"audience is a CIO — lead with security, compliance and risk", cto:"audience is a CTO — lead with architecture and roadmap", cfo:"audience is a CFO — lead with TCO and payback", vp_sales:"audience is a VP Sales — lead with win rates and revenue impact", end_user:"audience is an End User — focus on ease of use and daily productivity", procurement:"audience is Procurement — focus on licensing terms and SLAs" };

  const sys = isFlip
    ? `You are a ${competitor} sales rep. Your job is to show the EXACT playbook ${competitor} uses to attack ${product} deals. Be brutal and specific.`
    : `You are an elite B2B sales strategist. Generate a razor-sharp deal rescue plan. ${activeDepth}`;

  const user = [
    `DEAL: ${product}${your_pid?" ["+your_pid+"]":""} vs ${competitor}${comp_pid?" ["+comp_pid+"]":""}`,
    `Stage: ${stage} | Industry: ${industry||"B2B"} | Losing because: ${reasons}`,
    company_size ? `Customer size: ${company_size}` : "",
    deal_size ? `Deal size: ${deal_size}` : "",
    partner ? `Channel partner: ${partner}` : "",
    meddic_status ? `MEDDIC completed: ${meddic_status}` : "",
    context ? `Context: ${context}` : "",
    audience && aud[audience] ? `Note: ${aud[audience]}` : "",
    geography && geo[geography] ? geo[geography] : "",
    "",
    `DEPTH REQUIREMENT: ${activeDepth}`,
    "",
    "RULES:",
    `1. Every point must be specific to ${your_sku||product} vs ${comp_sku||competitor} — zero generic advice`,
    "2. Win probability minimum 40%",
    "3. Only state weaknesses you are CERTAIN are accurate",
    "4. No fake multipliers without a real source",
    "",
    'Return ONLY this JSON:',
    '{"score":{"winProbability":<40-100>,"urgency":"high|medium|low","why":"1 sentence specific diagnosis"}',
    ',"kill":"<the single most devastating differentiator — real spec or real price data>"',
    ',"theirWeaknesses":["<specific real weakness>","<specific real weakness>","<specific real weakness>"]',
    ',"moves":[{"what":"<action>","when":"<timing>","how":"<specific execution with product data>"},{"what":"<action>","when":"<timing>","how":"<specific>"},{"what":"<action>","when":"<timing>","how":"<specific>"}]',
    ',"talk":{"open":"<opening line naming specific feature or weakness>","msgs":["<specific>","<specific>","<specific>"],"objections":[{"q":"<real objection>","a":"<specific rebuttal>"},{"q":"<real objection>","a":"<specific rebuttal>"}]}',
    ',"email":{"sub":"<specific subject>","body":"<120 words max, ready to send, only [Name] as placeholder>"}',
    partner ? `,"partner":"<${partner} OEM portfolio, their incentive, 2 co-sell tactics>"` : "",
    '}'
  ].filter(Boolean).join("\n");

  try {
    const r = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: sys,
      messages: [{ role: "user", content: user }]
    });
    const clean = r.content[0].text.trim().replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
