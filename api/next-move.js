// api/next-move.js
// Drop in /api folder of your FlipIt Vercel project.
// ANTHROPIC_API_KEY must be set in Vercel environment variables.
//
// Web search is enabled — Claude searches for who is ACTUALLY hiring
// right now before making any company recommendations. No stale data.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, raw } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    };

    // Bullet rewriter does not need web search — it rewrites what the user provides.
    // Main career plan DOES need live search to surface currently hiring companies.
    if (!raw) {
      body.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        }
      ];
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify(body),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Anthropic API error' });
    }

    const data = await anthropicRes.json();

    // Extract only text blocks — response may include tool_use + tool_result
    // blocks from web search activity, we only want the final text answer
    const text = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('');

    // Bullet rewriter — return plain text directly
    if (raw) {
      return res.status(200).json({ result: text.trim() });
    }

    // Main plan — Claude returns JSON, parse it
    const cleaned = text.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ result: parsed });
    } catch (e) {
      console.error('JSON parse failed. Raw:', text);
      return res.status(500).json({ error: 'Failed to parse response' });
    }

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
