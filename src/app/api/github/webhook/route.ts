import { NextResponse } from 'next/server';
import { githubApp } from '@/lib/github/app';
import { buildPatchProof, commentOnPr } from '@/lib/github/verify';
import { proofHash, checksAllGreen, type PatchProof } from '@/lib/patchproof/proof';
import { rebuildProof } from '@/lib/patchproof/rebuild';
import { db, logEvent } from '@/lib/db/supabase';
import { NETWORK } from '@/lib/bch/network';
import { isValidAddress } from '@/lib/bch/keys';
import { parsePrMeta } from '@/lib/github/app';

const issueFromBody = (body: string | null) =>
  Number((body ?? '').match(/(?:fixes|closes|resolves)\s+#(\d+)/i)?.[1]);

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const event = req.headers.get('x-github-event');
  if (!(await githubApp().webhooks.verify(raw, sig))) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  let payload: Record<string, unknown> & { action?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }

  try {
    return await handle(event, payload);
  } catch (e) {
    const message = (e as Error).message ?? 'unknown webhook error';
    // Swallow the error and acknowledge with 200 so GitHub does not retry forever.
    try {
      await db().from('events').insert({ actor: 'webhook', action: 'webhook.error', data: { event, message } });
    } catch (logErr) {
      console.warn('Could not record webhook.error event:', logErr);
    }
    console.error('Webhook handler error:', e);
    return NextResponse.json({ ok: false, error: message });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function handle(event: string | null, payload: any) {
  // --- A merged PR produces the first PatchProof ------------------------------
  if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request.merged) {
    const owner = payload.repository.owner.login as string;
    const repo = payload.repository.name as string;
    const prNum = payload.pull_request.number as number;
    const issue = issueFromBody(payload.pull_request.body);
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
      `| Checks | ${green ? '✅ all green' : '❌ not all green (will refresh when CI finishes)'} (${proof.checks.length}) |`,
      `| AI review | ${proof.review.score}/100 · criteria met: ${proof.review.criteriaMet ? 'yes' : 'no'} |`,
      `| Diff sha256 | \`${proof.patch.diffSha256.slice(0, 16)}…\` |`,
      `| Payout to | ${proof.contributor.payoutAddress || '⚠️ add `PatchPay-Address:` to the PR body'} |`,
      ``,
      `Maintainer: approve the payout at ${site}/b/${bounty.id}`,
    ].join('\n'));
    return NextResponse.json({ ok: true, hash });
  }

  // --- CI finished after the merge: rebuild any pending proof for this commit --
  if (event === 'check_suite' && payload.action === 'completed') {
    const owner = payload.repository.owner.login as string;
    const repo = payload.repository.name as string;
    const headSha = payload.check_suite.head_sha as string;

    const { data: pending } = await db().from('proofs').select('*, bounties(*)').eq('status', 'pending');
    const rows = ((pending ?? []) as Array<{ id: string; pr_number: number; proof: PatchProof; bounties: Record<string, unknown> | null }>)
      .filter((r) => r.bounties && r.bounties.owner === owner && r.bounties.repo === repo && r.proof?.patch?.headSha === headSha);
    if (!rows.length) return NextResponse.json({ skipped: 'no pending proof for this commit' });

    const results = [];
    for (const r of rows) {
      const { hash, green } = await rebuildProof(r.bounties as unknown as Parameters<typeof rebuildProof>[0], r, 'webhook');
      results.push({ proofId: r.id, hash, green });
    }
    return NextResponse.json({ ok: true, refreshed: results });
  }

  // --- A PR referencing a bounty was opened ----------------------------------
  if (event === 'pull_request' && payload.action === 'opened') {
    const owner = payload.repository.owner.login as string;
    const repo = payload.repository.name as string;
    const prNum = payload.pull_request.number as number;
    const issue = issueFromBody(payload.pull_request.body);
    if (!issue) return NextResponse.json({ skipped: 'no linked issue' });

    const { data: bounty } = await db().from('bounties').select('*')
      .match({ owner, repo, issue_number: issue, network: NETWORK }).in('status', ['open', 'in_review']).maybeSingle();
    if (!bounty) return NextResponse.json({ skipped: 'no open bounty' });

    // Best-effort: mark it in review.
    await db().from('bounties').update({ status: 'in_review' }).match({ owner, repo, issue_number: issue, status: 'open' });

    // Tell the contributor the bounty is real and how they'll be paid.
    const meta = parsePrMeta(payload.pull_request.body);
    const hasValidAddr = meta.addr ? isValidAddress(meta.addr) : false;
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    const bch = (Number(bounty.amount_sats) / 1e8).toFixed(5);
    await commentOnPr(owner, repo, prNum, [
      `### 💰 This fixes a funded PatchPay bounty`,
      `**${bch} BCH** is already locked in escrow for issue #${issue}.`,
      site ? `Docket: ${site}/b/${bounty.id}` : '',
      ``,
      hasValidAddr
        ? `✅ Payout address detected: \`${meta.addr}\``
        : `⚠️ **No valid \`PatchPay-Address:\` for ${NETWORK} found in this PR.** Add a line to the PR body like \`PatchPay-Address: ${NETWORK === 'mainnet' ? 'bitcoincash' : 'bchtest'}:q…\` or you cannot be paid on merge.`,
    ].filter(Boolean).join('\n'));

    return NextResponse.json({ ok: true, commented: true });
  }

  return NextResponse.json({ ok: true });
}
