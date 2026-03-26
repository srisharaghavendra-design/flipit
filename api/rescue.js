import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function cacheKey(product, competitor) {
  return [product, competitor].map(s => s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'')).sort().join('::');
}

async function checkCache(key) {
  if(!SB_URL||!SB_KEY) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=core_plan,hit_count`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    const rows = await r.json();
    if(rows?.length) {
      fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ hit_count: (rows[0].hit_count||0) + 1 })
      }).catch(()=>{});
      return rows[0].core_plan;
    }
  } catch(e) { console.error('cache check:', e.message); }
  return null;
}

async function saveCache(key, productA, productB, corePlan) {
  if(!SB_URL||!SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/plan_cache`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({ cache_key: key, product_a: productA, product_b: productB, core_plan: corePlan, hit_count: 0 })
    });
  } catch(e) { console.error('cache save:', e.message); }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { product, competitor, your_sku, comp_sku, stage, reasons, context,
    industry, company_size, deal_size, partner, audience, geography,
    deal_type, tco_model, prospect_company, meddic_status, flip_mode = false } = req.body;

  if (!product || !competitor) return res.status(400).json({ error: "Missing fields" });

  const isFlip = flip_mode === true || flip_mode === "true";
  const ours = isFlip ? competitor : product;
  const theirs = isFlip ? product : competitor;

  // Cache check — skip for flip mode or personalised context
  if (!isFlip && !context && !partner) {
    const keyA = (your_sku ? product + " " + your_sku : product).trim();
    const keyB = (comp_sku ? competitor.split(" /")[0].trim() + " " + comp_sku : competitor).trim();
    const key = cacheKey(keyA, keyB);
    const cached = await checkCache(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.write(`data: ${JSON.stringify({ done: true, result: cached })}\n\n`);
      return res.end();
    }
  }

  const sys = `You are FlipIt, an elite B2B competitive sales strategist. Generate battle-tested rescue plans. Be specific, use real product names, no fluff. Win probability based on FEATURES and SOLUTION FIT only, not price.`;

  const prompt = `${isFlip ? `FLIP MODE: Show how ${theirs} pitches against ${ours}` : `Rescue plan: ${ours} vs ${theirs}`}

Product: ${ours}${your_sku?' ('+your_sku+')':''} | Competitor: ${theirs}${comp_sku?' ('+comp_sku+')':''}
Stage: ${stage||'Unknown'} | Reasons: ${reasons||'Not specified'} | Industry: ${industry||'B2B'}${company_size?' | Size: '+company_size:''}${deal_size?' | Deal: '+deal_size:''}${partner?' | Partner: '+partner:''}${audience?' | Audience: '+audience:''}${geography?' | Geo: '+geography:''}${meddic_status?' | MEDDPICC: '+meddic_status:''}${context?' | Context: '+context:''}

Return ONLY this JSON:
{"dealAssessment":{"winProbability":<40-90>,"urgency":"<high|medium|low>","summary":"<2 sentences>"},"killShot":"<devastating specific differentiator>","competitorWeaknesses":["<weakness>","<weakness>","<weakness>"],"counterMoves":[{"move":"<title>","timing":"<when>","action":"<what>"},{"move":"<title>","timing":"<when>","action":"<what>"},{"move":"<title>","timing":"<when>","action":"<what>"}],"talkTrack":{"opening":"<verbatim opening line>","keyMessages":["<msg>","<msg>","<msg>"],"objectionHandlers":[{"objection":"<obj>","response":"<resp>"},{"objection":"<obj>","response":"<resp>"}]},"emailTemplate":{"subject":"<subject>","body":"<body 150 words>"},"partnerIntel":${partner?'"<partner strategy>"':"null"}}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Cache', 'MISS');

  try {
    const stream = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: sys,
      messages: [{ role: "user", content: prompt }],
      stream: true
    });

    let full = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) full += event.delta.text;
    }

    const start = full.indexOf('{'), end = full.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON');
    const parsed = JSON.parse(full.slice(start, end + 1));

    if (!isFlip && !context && !partner) {
      const keyA2 = (your_sku ? product + " " + your_sku : product).trim();
      const keyB2 = (comp_sku ? competitor.split(" /")[0].trim() + " " + comp_sku : competitor).trim();
      saveCache(cacheKey(keyA2, keyB2), product, competitor, parsed).catch(()=>{});
    }

    res.write(`data: ${JSON.stringify({ done: true, result: parsed })}\n\n`);
    res.end();
  } catch(err) {
    console.error('rescue error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
        }
