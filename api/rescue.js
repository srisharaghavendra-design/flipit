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

  // Step 1 — scrape competitor intelligence with safe error handling
  let competitorIntel = '';

  try {
    const competitorSlug = competitor.toLowerCase().replace(/\s+/g, '');
    const g2Slug = competitor.toLowerCase().replace(/\s+/g, '-');

    const safeScrape = async (url) => {
      try {
        const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 1000
          })
        });
        const text = await r.text();
        try {
          const json = JSON.parse(text);
          return json?.data?.markdown || json?.markdown || '';
        } catch {
          return '';
        }
      } catch {
        return '';
      }
    };

    const [websiteData, g2Data] = await Promise.all([
      safeScrape(`https://www.${competitorSlug}.com`),
      safeScrape(`https://www.g2.com/products/${g2Slug}/reviews`)
    ]);

    if (websiteData) {
      competitorIntel += `\n\nCOMPETITOR WEBSITE (${competitor}):\n${websiteData.slice(0, 2000)}`;
    }
    if (g2Data) {
      competitorIntel += `\n\nG2 CUSTOMER REVIEWS (${competitor}):\n${g2Data.slice(0, 2000)}`;
    }
  } catch (e) {
    competitorIntel = '';
  }

  const hasIntel = competitorIntel.length > 100;

  const prompt = `You are an elite enterprise sales strategist with 20+ years rescuing lost B2B deals.

DEAL SITUATION:
- Product: ${product}
- Competitor: ${competitor}
- Deal stage: ${stage}
- Industry: ${industry || 'B2B Technology'}
- Why losing: ${reasons}
${context ? `- Context: ${context}` : ''}
${hasIntel ? `
LIVE COMPETITOR INTELLIGENCE (use specific details from this in your response):
${competitorIntel}

Mine this for: specific customer complaints, implementation issues, support problems, gaps between claims and reality. Reference these SPECIFICALLY in every output section.` : `Use your deep knowledge of ${competitor} to provide specific competitive intelligence.`}

Respond ONLY with valid JSON — no markdown, no preamble, nothing outside the JSON object:
{
  "dealAssessment": {
    "winProbability": <integer 0-100>,
    "urgency": "High|Medium|Low",
    "summary": "2-3 sentences referencing specific ${competitor} weaknesses"
  },
  "competitorWeaknesses": [
    "Specific weakness 1 with evidence",
    "Specific weakness 2 with evidence",
    "Specific weakness 3 with evidence"
  ],
  "killShot": "One devastating question exposing a SPECIFIC known ${competitor} weakness — not generic",
  "counterMoves": [
    {
      "move": "Short title max 5 words",
      "action": "Specific tactic using real ${competitor} weakness — who to contact, exact words, what evidence to use",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Short title max 5 words",
      "action": "Specific tactic",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Short title max 5 words",
      "action": "Specific tactic",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Short title max 5 words",
      "action": "Specific tactic",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    }
  ],
  "talkTrack": {
    "opening": "Exact opening line referencing something specific about ${competitor}",
    "keyMessages": [
      "Message using specific ${competitor} customer complaint or known weakness",
      "Message reframing evaluation criteria against ${competitor} known gaps",
      "Message positioning ${product} strength against ${competitor} specific weakness"
    ],
    "objectionHandlers": [
      {
        "objection": "Exact objection buyer will raise",
        "response": "Word-for-word counter using specific ${competitor} intelligence"
      },
      {
        "objection": "Second specific objection",
        "response": "Word-for-word counter with real data points"
      }
    ]
  },
  "emailTemplate": {
    "subject": "Specific subject line — not generic",
    "body": "Complete email under 200 words referencing specific ${competitor} weakness, clear next step"
  }
}`;

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
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(500).json({ error: 'Invalid response from AI service' });
    }

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response — please try again' });
    }

    parsed._intelUsed = hasIntel;
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Request failed: ' + err.message });
  }
}
