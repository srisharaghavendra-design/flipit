// api/rescue-depth.js
// Serves deep intel from Supabase cache — no live AI calls
// Cache is populated by warm-cache.js (nightly cron)

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function cacheKey(a, b) {
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  return [norm(a), norm(b)].sort().join('::');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { product, competitor, your_sku, comp_sku, flip_mode = false } = req.body;
  if (!product || !competitor) return res.status(400).json({ error: 'Missing fields' });

  const isFlip = flip_mode === true || flip_mode === 'true';
  const keyA = your_sku ? your_sku.trim() : product.trim();
  const keyB = comp_sku ? comp_sku.trim() : competitor.split(' /')[0].trim();
  const key = cacheKey(keyA, keyB);

  try {
    // Check Supabase for cached depth plan
    const r = await fetch(
      `${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}&select=depth_plan,hit_count`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await r.json();

    if (rows?.length && rows[0].depth_plan) {
      // Update hit count in background
      fetch(`${SB_URL}/rest/v1/plan_cache?cache_key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ hit_count: (rows[0].hit_count || 0) + 1 })
      }).catch(() => {});

      res.setHeader('X-Cache', 'HIT');
      return res.json(rows[0].depth_plan);
    }

    // Cache miss — return a clear message so the UI can show the right state
    res.setHeader('X-Cache', 'MISS');
    return res.status(503).json({
      error: 'Deep intel not yet cached for this matchup',
      message: 'This matchup will be available after the next nightly cache refresh.',
      cacheKey: key
    });

  } catch (err) {
    console.error('rescue-depth error:', err.message);
    res.status(500).json({ error: err.message });
  }
      }
