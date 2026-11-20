import { NextResponse } from 'next/server';
import { db } from '@/lib/db/supabase';
import { githubLoginFromRequest } from '@/lib/auth';
import { isMaintainer } from '@/lib/github/app';
import { rebuildProof } from '@/lib/patchproof/rebuild';
import { githubConfigured, githubErrorMessage } from '@/lib/mode';

/**
 * Maintainer-only: re-read the PR from GitHub and rebuild the PatchProof on demand.
 * Useful when CI turned green only after the merge webhook already ran.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const { data: row } = await db().from('proofs').select('*, bounties(*)').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  const b = row.bounties;
  if (!b) return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
  if (row.status === 'paid') return NextResponse.json({ error: 'Already paid — nothing to refresh' }, { status: 409 });

  if (!githubConfigured()) {
    return NextResponse.json({ error: 'GitHub App is not configured on the server' }, { status: 503 });
  }
  try {
    if (!(await isMaintainer(b.owner, b.repo, login))) {
      return NextResponse.json({ error: 'Only repo maintainers can refresh a proof' }, { status: 403 });
    }
  } catch (e) {
    return NextResponse.json({ error: githubErrorMessage(e, b.owner, b.repo) }, { status: 502 });
  }

  try {
    const { hash, green } = await rebuildProof(b, row, login);
    return NextResponse.json({ hash, green });
  } catch (e) {
    return NextResponse.json({ error: `Could not rebuild the proof: ${githubErrorMessage(e, b.owner, b.repo)}` }, { status: 502 });
  }
}
