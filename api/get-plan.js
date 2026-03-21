// api/get-plan.js
// Fetches a rescue plan by UUID for the shareable viewer

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing plan id' });

  try {
    const response = await fetch(
      SUPABASE_URL + '/rest/v1/rescue_plans?id=eq.' + id + '&select=*',
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      }
    );

    if (!response.ok) throw new Error('Supabase error: ' + response.status);

    const rows = await response.json();
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Plan not found' });

    const plan = rows[0];

    // Bump view count (fire and forget)
    fetch(SUPABASE_URL + '/rest/v1/rescue_plans?id=eq.' + id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      },
      body: JSON.stringify({ view_count: (plan.view_count || 0) + 1 })
    }).catch(() => {});

    return res.status(200).json(plan);

  } catch (err) {
    console.error('[get-plan]', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch plan' });
  }
}
