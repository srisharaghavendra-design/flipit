// FlipIt Deal Rescue API
// Uses curated competitor knowledge base + live Firecrawl scraping as enrichment layer

import { COMPETITOR_DB, getCompetitorIntel, formatIntelForPrompt } from '../lib/competitorDB.js';

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

  // Step 1 — knowledge base lookup (always reliable)
  const dbIntel = getCompetitorIntel(competitor);
  let intelText = dbIntel ? formatIntelForPrompt(dbIntel, reasons) : '';
  let intelSource = dbIntel ? 'knowledge_base' : 'none';

  // Step 2 — live scraping enrichment (best effort, never blocks)
  try {
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
            waitFor: 2000,
            timeout: 15000
          })
        });
        if (!r.ok) return '';
        const text = await r.text();
        const json = JSON.parse(text);
        const content = json?.data?.markdown || json?.markdown || '';
        // sanity check — must be substantial content, not error page
        return content.length > 500 ? content.slice(0, 1500) : '';
      } catch {
        return '';
      }
    };

    const competitorSlug = competitor.toLowerCase().replace(/\s+/g, '');
    const g2Slug = competitor.toLowerCase().replace(/\s+/g, '-');

    const [liveData] = await Promise.all([
      safeScrape(`https://www.g2.com/products/${g2Slug}/reviews`)
    ]);

    if (liveData && liveData.length > 500) {
      intelText += `\n\nLIVE G2 REVIEW DATA (scraped today — use any NEW specific complaints found here):\n${liveData}`;
      intelSource = 'knowledge_base_plus_live';
    }
  } catch {
    // scraping failed silently — knowledge base is enough
  }

  // Step 3 — generate rescue plan
  const hasIntel = intelText.length > 100;

  const prompt = `You are an elite enterprise sales strategist. You have verified competitive intelligence about ${competitor}. Use it to generate a devastatingly specific deal rescue plan.

DEAL SITUATION:
- Product being sold: ${product}
- Competitor: ${competitor}
- Deal stage: ${stage}
- Industry: ${industry || 'B2B Technology'}
- Why we are losing: ${reasons}
${context ? `- Additional context: ${context}` : ''}

${hasIntel ? intelText : `Use your knowledge of ${competitor} to provide specific competitive intelligence.`}

CRITICAL RULES:
1. Reference SPECIFIC facts from the intelligence above — not generic advice
2. Every counter-move must name a specific action, not a category of action
3. The kill shot must reference a specific known weakness — pricing opacity, implementation timeline, support gaps, mobile issues, etc.
4. Talk track must use language an AE can say word-for-word in 10 minutes
5. Email must be ready to send — not a template with [brackets] except for name/date

Respond ONLY with valid JSON — no markdown, nothing outside the JSON:
{
  "dealAssessment": {
    "winProbability": <integer 0-100>,
    "urgency": "High|Medium|Low",
    "summary": "2-3 sentences — reference specific ${competitor} reality vs what they're claiming in the deal"
  },
  "competitorWeaknesses": [
    "Specific weakness with evidence source e.g. 'Gartner reviews consistently cite...'",
    "Second specific weakness with evidence",
    "Third specific weakness with evidence"
  ],
  "killShot": "One question or statement that uses a SPECIFIC known ${competitor} weakness — pricing opacity, implementation timeline, support gaps, mobile issues, product fit for this company size. Must be something the AE can say verbatim.",
  "counterMoves": [
    {
      "move": "Action title max 5 words",
      "action": "Specific action — name who to call, what to send, exact words to use, what specific ${competitor} weakness to expose",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Action title max 5 words",
      "action": "Specific action",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Action title max 5 words",
      "action": "Specific action",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    },
    {
      "move": "Action title max 5 words",
      "action": "Specific action",
      "timing": "Today|Within 48 hours|Before next meeting|This week"
    }
  ],
  "talkTrack": {
    "opening": "Exact opening words that reference something specific about ${competitor} — not generic",
    "keyMessages": [
      "Specific message using a real ${competitor} weakness or customer complaint",
      "Message reframing evaluation criteria based on ${competitor} known gaps",
      "Message positioning ${product} strength directly against ${competitor} specific weakness"
    ],
    "objectionHandlers": [
      {
        "objection": "Exact objection the buyer will raise — specific to ${competitor}",
        "response": "Word-for-word response using specific intelligence — conversational, not defensive"
      },
      {
        "objection": "Second specific objection",
        "response": "Word-for-word response with specific evidence"
      }
    ]
  },
  "emailTemplate": {
    "subject": "Specific subject that references something real — not generic clickbait",
    "body": "Complete email under 200 words. References a specific ${competitor} weakness or customer complaint. Clear single next step ask. Ready to send right now."
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
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: 'AI service response error — please try again' }); }

    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { return res.status(500).json({ error: 'Could not parse response — please try again' }); }

    parsed._intelSource = intelSource;
    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Request failed: ' + err.message });
  }
}
