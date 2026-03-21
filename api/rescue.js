import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getCompetitorIntel(competitorName) {
  if (!competitorName) return null;
  const { data, error } = await supabase
    .from("competitor_intel")
    .select("*")
    .ilike("competitor_name", `%${competitorName.toLowerCase().trim()}%`)
    .limit(1)
    .single();
  if (error || !data) return null;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku } = req.body;
  if (!product || !competitor || !stage || !reasons) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const intel = await getCompetitorIntel(competitor);
  let intelBlock = "";
  if (intel) {
    intelBlock = `
VERIFIED COMPETITOR INTELLIGENCE ON ${intel.competitor_name.toUpperCase()}:
- Weaknesses: ${intel.weaknesses || "N/A"}
- Common objections they raise: ${intel.common_objections || "N/A"}
- Our key differentiators: ${intel.our_differentiators || "N/A"}
- Proven talk tracks: ${intel.talk_tracks || "N/A"}
- Pricing intel: ${intel.pricing_intel || "N/A"}
- Win themes: ${intel.win_themes || "N/A"}
Use this intel to make every section of the plan highly specific and weaponized.
`;
  }

  const prompt = `You are an elite B2B sales strategist. A sales rep is losing a deal and needs a rescue plan NOW.

DEAL SITUATION:
- Our product: ${product}${your_sku ? ` (${your_sku})` : ""}
- Competitor: ${competitor}${comp_sku ? ` (${comp_sku})` : ""}
- Deal stage: ${stage}
- Industry: ${industry || "B2B SaaS"}
- Why we are losing: ${reasons}
${context ? `- Additional context: ${context}` : ""}
${intelBlock}

Respond ONLY with a JSON object (no markdown, no preamble) in this exact structure:
{
  "dealAssessment": {
    "winProbability": <number 0-100>,
    "urgency": "<high|medium|low>",
    "summary": "<2 sentence honest assessment>"
  },
  "killShot": "<single most powerful differentiator, 1-2 sentences, punchy>",
  "competitorWeaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "counterMoves": [
    { "move": "<action title>", "timing": "<when>", "action": "<specific what to do>" },
    { "move": "<action title>", "timing": "<when>", "action": "<specific what to do>" },
    { "move": "<action title>", "timing": "<when>", "action": "<specific what to do>" }
  ],
  "talkTrack": {
    "opening": "<strong opening line for next call>",
    "keyMessages": ["<message 1>", "<message 2>", "<message 3>"],
    "objectionHandlers": [
      { "objection": "<likely objection>", "response": "<response>" },
      { "objection": "<likely objection>", "response": "<response>" }
    ]
  },
  "emailTemplate": {
    "subject": "<subject line>",
    "body": "<email body, 150-200 words, no placeholders, ready to send>"
  }
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content[0].text.trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    const data = JSON.parse(clean);
    return res.status(200).json(data);
  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
