import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/supabase';
import { githubLoginFromRequest } from '@/lib/auth';
import { isMaintainer } from '@/lib/github/app';
import { CATEGORIES } from '@/lib/categories';
import { githubConfigured, githubErrorMessage, isDemoMode } from '@/lib/mode';

// GitHub maintainer check + a few upserts.
export const maxDuration = 30;

const Sats = z.number().int().min(10_000, 'at least 0.0001 BCH').max(10 * 1e8, 'at most 10 BCH');
const Body = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  rates: z.partialRecord(z.enum(CATEGORIES), Sats),
});

/** Maintainers set the default reward per category for their repo. */
export async function POST(req: Request) {
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in with GitHub first' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i ? `Invalid ${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid rate card' }, { status: 400 });
  }
  const { owner, repo, rates } = parsed.data;
  const entries = Object.entries(rates) as [string, number][];
  if (!entries.length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });

  if (githubConfigured()) {
    try {
      if (!(await isMaintainer(owner, repo, login))) return NextResponse.json({ error: 'Only repo admins/maintainers can edit the rate card' }, { status: 403 });
    } catch (e) {
      return NextResponse.json({ error: githubErrorMessage(e, owner, repo) }, { status: 502 });
    }
  } else if (!isDemoMode()) {
    return NextResponse.json({ error: 'GitHub App is not configured on the server' }, { status: 503 });
  }

  for (const [category, amount_sats] of entries) {
    const { error } = await db().from('rate_cards').upsert(
      { owner, repo, category, amount_sats, updated_by: login, updated_at: new Date().toISOString() },
      { onConflict: 'owner,repo,category' },
    );
    if (error) {
      const msg = /rate_cards/i.test((error as { message?: string }).message ?? '')
        ? 'The rate_cards table does not exist yet. Run supabase/rate_cards.sql in Supabase first.'
        : `Could not save the rate card: ${(error as { message?: string }).message ?? 'database error'}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, saved: entries.length });
}
