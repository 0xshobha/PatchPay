import 'server-only';
import { db } from '@/lib/db/supabase';
import { CATEGORIES, DEFAULT_RATE_SATS, type Category } from '@/lib/categories';

export type RateEntry = { sats: number; source: 'rate card' | 'default' };
export type RateCard = Record<Category, RateEntry>;

/**
 * A repo's rate card merged over the defaults. Never throws: if the rate_cards
 * table does not exist yet (supabase/rate_cards.sql not run), defaults are used.
 */
export async function getRateCard(owner: string, repo: string): Promise<RateCard> {
  const card = Object.fromEntries(CATEGORIES.map((c) => [c, { sats: DEFAULT_RATE_SATS[c], source: 'default' as const }])) as RateCard;
  try {
    const { data, error } = await db().from('rate_cards').select('category,amount_sats').eq('owner', owner).eq('repo', repo);
    if (error) return card;
    for (const r of (data as { category: Category; amount_sats: number }[] | null) ?? []) {
      if (r.category in card) card[r.category] = { sats: Number(r.amount_sats), source: 'rate card' };
    }
  } catch { /* table missing / offline: defaults */ }
  return card;
}
