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

  // Step 1 — scrape competitor intelligence
  let competitorIntel = '';

  try {
    const competitorSlug = competitor.toLowerCase().replace(/\s+/g, '');
    const g2Slug = competitor.toLowerCase().replace(/\s+/g, '-');

    const scrapeTargets = [
      `https://www.${competitorSlug}.com`,
      `https://www.g2.com/products/${g2Slug}/reviews`
    ];

    const scrapePromises = scrapeTargets.map(url =>
      fetch('https://api.firecrawl.dev/v1/scrape', {
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
      }).then(r => r.json()).catch(() => null)
    );

    const results = await Promise.allSettled(scrapePromises);

    const websiteData = results[0]?.value?.data?.markdown || results[0]?.value?.markdown || '';
    const g2Data = results[1]?.value?.data?.markdown || results[1]?.value?.markdown || '';

    if (websiteData) {
      competitorIntel += `\n\nCOMPETITOR WEBSITE INTELLIGENCE (${competitor}):\n${websiteData.slice(0, 2000)}`;
    }
    if (g2Data) {
      competitorIntel += `\n\nG2 CUSTOMER REVIEWS (${competitor}):\n${g2Data.slice(0, 2000)}`;
    }
  } catch (e) {
    // scraping failed — continue without it, still generate plan
    competitorIntel = '';
  }

  // Step 2 — generate rescue plan with real intel
  const hasIntel = competitorIntel.length > 100;

  const prompt = `You are an elite enterprise sales strategist with 20+ years rescuing lost B2B deals. You have access to REAL intelligence about the competitor — use it aggressively.

DEAL SITUATION:
- Product being sold: ${product}
- Competitor threatening the deal: ${competitor}
- Current deal stage: ${stage}
- Industry: ${industry || 'B2B Technology'}
- Why we are losing: ${reasons}
${context ? `- Additional context: ${context}` : ''}
${hasIntel ? `
REAL COMPETITOR INTELLIGENCE (scraped live — use specific details from this):
${competitorIntel}

INSTRUCTIONS: Mine the above intelligence for:
1. Specific weaknesses mentioned in customer reviews
2. Gaps between their marketing claims and reality
3. Implementation, support, or product complaints
4. Anything that contradicts what they're telling the prospect
Use these SPECIFIC details in every section of your response. No generic advice.` : `
Note: Use your deep knowledge of ${competitor} to provide specific, accurate competitive intelligence.`}

Respond ONLY with valid JSON — no markdown, no preamble:
{
  "dealAssessment": {
    "winProbability": <integer 0-100>,
    "urgency": "High|Medium|Low",
    "summary": "2-3 sentences — brutally honest, reference specific ${competitor} weaknesses"
  },
  "competitorWeaknesses": [
    "Specific weakness 1 found in reviews or known about ${competitor}",
    "Specific weakness 2",
    "Specific weakness 3"
  ],
  "killShot": "One devastating question that exposes a SPECIFIC known weakness of ${competitor} — not generic",
  "counterMoves": [
    {
      "move": "Short title max 5 words",
      "action": "Specific tactic referencing real ${competitor} weakness — who to contact, what to say, what evidence to use",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    }
  ],
  "talkTrack": {
    "opening": "Exact opening line that references something specific about ${competitor}",
    "keyMessages": [
      "Message referencing specific ${competitor} weakness or customer complaint",
      "Message reframing evaluation criteria against ${competitor} known gaps",
      "Message positioning ${product} strength against ${competitor} specific weakness"
    ],
    "objectionHandlers": [
      {
        "objection": "Exact objection buyer will raise about ${competitor} vs ${product}",
        "response": "Word-for-word response using specific ${competitor} intelligence"
      },
      {
        "objection": "Second objection specific to this deal",
        "response": "Word-for-word counter using real data points"
      }
    ]
  },
  "emailTemplate": {
    "subject": "Subject line referencing something specific — not generic",
    "body": "Complete email under 200 words — references specific ${competitor} weakness or customer complaint, clear next step"
  }
}

Rules:
- Give exactly 4 counter-moves
- Every output must reference SPECIFIC known issues with ${competitor}
- An AE must be able to use this in a call starting in 10 minutes
- No generic B2B advice — be brutally specific`;

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

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // flag whether we had real intel
    parsed._intelUsed = hasIntel;

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate rescue plan: ' + err.message });
  }
}
