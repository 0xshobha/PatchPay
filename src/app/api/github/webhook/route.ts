import { NextResponse } from 'next/server';
import { githubApp } from '@/lib/github/app';
import { buildPatchProof, commentOnPr } from '@/lib/github/verify';
import { proofHash, checksAllGreen } from '@/lib/patchproof/proof';
import { db, logEvent } from '@/lib/db/supabase';
import { NETWORK } from '@/lib/bch/network';

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const event = req.headers.get('x-github-event');
  if (!(await githubApp().webhooks.verify(raw, sig))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const payload = JSON.parse(raw);

  if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request.merged) {
    const owner = payload.repository.owner.login as string;
    const repo = payload.repository.name as string;
    const prNum = payload.pull_request.number as number;
    const issue = Number((payload.pull_request.body ?? '').match(/(?:fixes|closes|resolves)\s+#(\d+)/i)?.[1]);
    if (!issue) return NextResponse.json({ skipped: 'no linked issue' });

    const { data: bounty } = await db().from('bounties').select('*')
      .match({ owner, repo, issue_number: issue, network: NETWORK }).in('status', ['open', 'in_review']).maybeSingle();
    if (!bounty) return NextResponse.json({ skipped: 'no open bounty' });

    const { proof } = await buildPatchProof({
      bounty: { id: bounty.id, owner, repo, issue, amountSats: BigInt(bounty.amount_sats), escrow: bounty.escrow_address, criteria: bounty.criteria },
      pr: prNum,
    });
    const hash = proofHash(proof);
    const green = checksAllGreen(proof);
    await db().from('proofs').upsert({ bounty_id: bounty.id, pr_number: prNum, proof, proof_hash: hash, checks_green: green }, { onConflict: 'proof_hash' });
    await db().from('bounties').update({ status: 'verified' }).eq('id', bounty.id);
    await logEvent(bounty.id, 'patchproof', 'proof.created', { pr: prNum, hash, green });

    const site = process.env.NEXT_PUBLIC_SITE_URL;
    await commentOnPr(owner, repo, prNum, [
      `### 🧾 PatchProof \`${hash.slice(0, 16)}…\``,
      `| | |\n|---|---|`,
      `| Checks | ${green ? '✅ all green' : '❌ not all green'} (${proof.checks.length}) |`,
      `| AI review | ${proof.review.score}/100 · criteria met: ${proof.review.criteriaMet ? 'yes' : 'no'} |`,
      `| Diff sha256 | \`${proof.patch.diffSha256.slice(0, 16)}…\` |`,
      `| Payout to | ${proof.contributor.payoutAddress || '⚠️ add `PatchPay-Address:` to the PR body'} |`,
      ``,
      `Maintainer: approve the payout at ${site}/b/${bounty.id}`,
    ].join('\n'));
    return NextResponse.json({ ok: true, hash });
  }

  if (event === 'pull_request' && payload.action === 'opened') {
    // Mark bounty as in review when a PR references it (best-effort).
    const issue = Number((payload.pull_request.body ?? '').match(/(?:fixes|closes|resolves)\s+#(\d+)/i)?.[1]);
    if (issue) await db().from('bounties').update({ status: 'in_review' })
      .match({ owner: payload.repository.owner.login, repo: payload.repository.name, issue_number: issue, status: 'open' });
  }
  return NextResponse.json({ ok: true });
}
