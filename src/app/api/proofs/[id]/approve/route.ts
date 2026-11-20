import { NextResponse } from 'next/server';
import { db } from '@/lib/db/supabase';
import { githubLoginFromRequest } from '@/lib/auth';
import { isMaintainer, octokitForRepo } from '@/lib/github/app';
import { isValidAddress } from '@/lib/bch/keys';
import { executePayout, PayoutError, type ProofWithBounty } from '@/lib/payout';
import { githubConfigured, githubErrorMessage, isDemoMode } from '@/lib/mode';

// GitHub re-check + on-chain release broadcast (+ optional NFT receipt).
export const maxDuration = 60;

// Manual approval (for proofs that were not auto-paid on merge).
// Requires: human maintainer + merged PR + green checks + valid address.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const { data } = await db().from('proofs').select('*, bounties(*)').eq('id', id).maybeSingle();
  const row = data as ProofWithBounty | null;
  if (!row?.bounties) return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  const b = row.bounties;
  const proof = row.proof;
  if (row.status === 'paid') return NextResponse.json({ error: 'Already paid' }, { status: 409 });
  if (proof.contributor.github === login) return NextResponse.json({ error: 'You cannot approve your own PR' }, { status: 403 });
  if (!row.checks_green) return NextResponse.json({ error: 'Checks are not green' }, { status: 422 });
  if (!isValidAddress(proof.contributor.payoutAddress)) return NextResponse.json({ error: 'PR has no valid PatchPay-Address' }, { status: 422 });

  if (githubConfigured()) {
    // Fail closed: if GitHub cannot confirm maintainer + merged PR, no money moves.
    try {
      if (!(await isMaintainer(b.owner, b.repo, login))) return NextResponse.json({ error: 'Only repo maintainers can approve a payout' }, { status: 403 });
      const ok = await octokitForRepo(b.owner, b.repo);
      const { data: pr } = await ok.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner: b.owner, repo: b.repo, pull_number: row.pr_number });
      if (!pr.merged) return NextResponse.json({ error: 'The PR is not merged on GitHub' }, { status: 409 });
      if (pr.head.sha !== proof.patch.headSha) return NextResponse.json({ error: 'The PR changed since the proof was built — click "Refresh proof" first' }, { status: 409 });
    } catch (e) {
      return NextResponse.json({ error: githubErrorMessage(e, b.owner, b.repo) }, { status: 502 });
    }
  } else if (!isDemoMode()) {
    return NextResponse.json({ error: 'GitHub App is not configured on the server, so the PR cannot be verified' }, { status: 503 });
  }

  try {
    return NextResponse.json(await executePayout(row, login));
  } catch (e) {
    const status = e instanceof PayoutError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
