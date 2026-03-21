import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { product, competitor, stage, industry, reasons, context, your_sku, comp_sku } = req.body;
  if (!product || !competitor || !stage || !reasons) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const prompt = `You are an elite B2B sales strategist. A sales rep is losing a deal and needs a rescue plan NOW.

DEAL SITUATION:
- Our product: ${product}${your_sku ? ` (${your_sku})` : ""}
- Competitor: ${competitor}${comp_sku ? ` (${comp_sku})` : ""}
- Deal stage: ${stage}
- Industry: ${industry || "B2B SaaS"}
- Why we are losing: ${reasons}
${context ? `- Additional context: ${context}` : ""}

Respond ONLY with a JSON object (no markdown, no preamble) in this exact structure:
{
  "dealAssessment": { "winProbability": <0-100>, "urgency": "<high|medium|low>", "summary": "<2 sentences>" },
  "killShot": "<1-2 sentence punchy differentiator>",
  "competitorWeaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "counterMoves": [
    { "move": "<title>", "timing": "<when>", "action": "<what to do>" },
    { "move": "<title>", "timing": "<when>", "action": "<what to do>" },
    { "move": "<title>", "timing": "<when>", "action": "<what to do>" }
  ],
  "talkTrack": {
    "opening": "<strong opening line>",
    "keyMessages": ["<msg 1>", "<msg 2>", "<msg 3>"],
    "objectionHandlers": [
      { "objection": "<objection>", "response": "<response>" },
      { "objection": "<objection>", "response": "<response>" }
    ]
  },
  "emailTemplate": { "subject": "<subject>", "body": "<150-200 words, ready to send>" }
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = response.content[0].text.trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (err) {
    console.error("rescue error:", err);
    return res.status(500).json({ error: err.message });
  }
}
