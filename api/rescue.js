export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { product, competitor, stage, industry, reasons, context } = req.body;

  if (!product || !competitor || !stage || !reasons) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const prompt = `You are an elite enterprise sales strategist with 20+ years experience rescuing lost B2B deals. Deep expertise in competitive sales tactics, negotiation psychology, and enterprise buyer behavior across industries.

Deal situation:
- Product being sold: ${product}
- Competitor threatening the deal: ${competitor}
- Current deal stage: ${stage}
- Industry: ${industry || 'B2B Technology'}
- Why we are losing: ${reasons}
${context ? `- Additional context: ${context}` : ''}

Respond ONLY with valid JSON — no markdown, no preamble, no explanation outside the JSON:
{
  "dealAssessment": {
    "winProbability": <integer 0-100>,
    "urgency": "High|Medium|Low",
    "summary": "2-3 sentence brutally honest assessment of this specific deal situation and what is actually at stake"
  },
  "killShot": "One devastatingly specific question or statement that shifts deal power — must reference the actual competitor and product, not generic",
  "counterMoves": [
    {
      "move": "Short action title (max 5 words)",
      "action": "Specific tactical action the AE should take — who to call, what to say, what to send. No vague advice.",
      "timing": "Today|This week|Before next meeting|Within 48 hours"
    }
  ],
  "talkTrack": {
    "opening": "Exact opening line for the next customer conversation — specific, not generic",
    "keyMessages": [
      "Message 1 — specific to this product vs competitor matchup",
      "Message 2 — addresses a real weakness of the competitor",
      "Message 3 — reframes the evaluation criteria in your favor"
    ],
    "objectionHandlers": [
      {
        "objection": "Exact objection the buyer will raise about this competitor",
        "response": "Word-for-word response the AE should use — conversational, confident, not defensive"
      },
      {
        "objection": "Second likely objection specific to this deal situation",
        "response": "Word-for-word response — specific to this product vs competitor"
      }
    ]
  },
  "emailTemplate": {
    "subject": "Subject line that gets opened — specific, not salesy",
    "body": "Complete professional email ready to send — references specific deal context, has clear next step ask, under 200 words"
  }
}

Rules:
- Give exactly 4 counter-moves
- Be brutally specific to ${product} vs ${competitor} — no generic B2B advice
- Every piece of output must be immediately usable by an AE walking into a call in 10 minutes
- Assume the AE knows their product well — don't explain features, give tactics`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate rescue plan: ' + err.message });
  }
}
