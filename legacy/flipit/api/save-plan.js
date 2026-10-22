// api/save-plan.js
// Saves a rescue plan to Supabase and returns the UUID for sharing

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { product, competitor, deal_stage, losing_reason, industry, company_size, plan_data } = req.body;

    if (!product || !competitor || !plan_data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const response = await fetch(SUPABASE_URL + '/rest/v1/rescue_plans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        product,
        competitor,
        deal_stage:    deal_stage   || null,
        losing_reason: losing_reason || null,
        industry:      industry      || null,
        company_size:  company_size  || null,
        plan_data,
        view_count: 0
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const rows = await response.json();
    const saved = Array.isArray(rows) ? rows[0] : rows;

    return res.status(200).json({ id: saved.id });

  } catch (err) {
    console.error('[save-plan]', err);
    return res.status(500).json({ error: err.message || 'Failed to save plan' });
  }
}
