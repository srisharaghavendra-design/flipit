import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://sqddpjsgtwblmkgxqyxe.supabase.co'

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_iYcjvbkR6Twhze1nG32fYg_-TlAYG34'

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── rescue_plans helpers ───────────────────────────────────────────────────

/**
 * Save a completed rescue plan and return the saved row (with id).
 */
export async function savePlan(payload) {
  const { data, error } = await supabase
    .from('rescue_plans')
    .insert([
      {
        product:       payload.product,
        competitor:    payload.competitor,
        deal_stage:    payload.dealStage,
        losing_reason: payload.losingReason,
        industry:      payload.industry      || null,
        company_size:  payload.companySize   || null,
        plan_data:     payload.planData,          // full JSON output from Claude
        view_count:    0,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch a plan by its UUID for the shareable viewer.
 * Also increments view_count.
 */
export async function getPlanById(id) {
  const { data, error } = await supabase
    .from('rescue_plans')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error

  // fire-and-forget view count bump
  supabase
    .from('rescue_plans')
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq('id', id)
    .then(() => {})

  return data
}

/**
 * Fetch all competitors stored in the competitor_intel table.
 */
export async function getCompetitors() {
  const { data, error } = await supabase
    .from('competitor_intel')
    .select('*')
    .order('competitor_name', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Upsert competitor intel (admin form).
 */
export async function upsertCompetitor(payload) {
  const { data, error } = await supabase
    .from('competitor_intel')
    .upsert(
      {
        competitor_name:   payload.competitorName,
        category:          payload.category,
        key_strengths:     payload.keyStrengths,
        key_weaknesses:    payload.keyWeaknesses,
        common_objections: payload.commonObjections,
        counter_moves:     payload.counterMoves,
        win_themes:        payload.winThemes,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: 'competitor_name' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}
