import { NextResponse } from 'next/server';
import { binToHex, sha256, utf8ToBin } from '@bitauth/libauth';
import { db, logEvent } from '@/lib/db/supabase';
import { githubLoginFromRequest } from '@/lib/auth';
import { isMaintainer, octokitForRepo } from '@/lib/github/app';
import { commentOnPr } from '@/lib/github/verify';
import { signRelease } from '@/lib/bch/oracle';
import { releaseEscrow } from '@/lib/bch/escrow';
import { mintReceipt } from '@/lib/bch/receipt';
import { isValidAddress, toTokenAddress } from '@/lib/bch/keys';
import { EXPLORER_TX } from '@/lib/bch/network';
import type { PatchProof } from '@/lib/patchproof/proof';
import { githubConfigured, githubErrorMessage, isDemoMode } from '@/lib/mode';

// The ONLY path that moves money. Requires: human maintainer + merged PR + green checks + valid address.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const { data: row } = await db().from('proofs').select('*, bounties(*)').eq('id', id).single();
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b = row.bounties;
  const proof = row.proof as PatchProof;
  if (row.status === 'paid') return NextResponse.json({ error: 'already paid' }, { status: 409 });
  if (proof.contributor.github === login) return NextResponse.json({ error: 'you cannot approve your own PR' }, { status: 403 });
  if (!row.checks_green) return NextResponse.json({ error: 'checks are not green' }, { status: 422 });
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

  // Claim the row first so a double-click can't send twice.
  const { data: claimed } = await db().from('proofs').update({ status: 'approved' }).eq('id', id).eq('status', 'pending').select().maybeSingle();
  if (!claimed) return NextResponse.json({ error: 'This payout is already being processed' }, { status: 409 });

  const { sig, sigHex } = signRelease(b.id, proof.contributor.payoutAddress, row.proof_hash);
  try {
    let releases: { txid: string; amountSats: bigint }[] = [];
    try {
      releases = await releaseEscrow(
        { bountyUuid: b.id, oraclePubkeyHex: b.oracle_pubkey, maintainerAddress: b.maintainer_addr, deadlineUnix: Number(b.deadline_unix) },
        proof.contributor.payoutAddress,
        row.proof_hash,
        sig,
      );
    } catch (err) {
      // Only the keyless local demo may pretend; on chipnet/mainnet a failed broadcast is a failure.
      if (!isDemoMode()) throw new Error(`On-chain release failed: ${(err as Error).message}`);
      console.warn('Demo mode: simulating release broadcast:', err);
      releases = [{ txid: binToHex(sha256.hash(utf8ToBin(Date.now().toString() + row.proof_hash))), amountSats: BigInt(b.amount_sats) - 1500n }];
    }
    if (!releases.length) throw new Error('Nothing to release — the escrow is empty');
    const txids = releases.map((r) => r.txid);

    for (const r of releases) {
      await db().from('payments').insert({
        bounty_id: b.id,
        proof_id: id,
        kind: 'release',
        txid: r.txid,
        amount_sats: Number(r.amountSats),
        recipient: proof.contributor.payoutAddress,
        oracle_sig: sigHex,
      });
    }
    await db().from('proofs').update({ status: 'paid' }).eq('id', id);
    await db().from('bounties').update({ status: 'paid' }).eq('id', b.id);
    await logEvent(b.id, login, 'payout.released', { txids });

    // Best-effort PatchProof NFT receipt. The payout above has already settled, so a
    // failure here must never surface as a failed payout — it is logged and swallowed.
    if (process.env.RECEIPT_WALLET_WIF && process.env.RECEIPT_CATEGORY) {
      try {
        const tokenAddr = toTokenAddress(proof.contributor.payoutAddress);
        const receiptTxid = await mintReceipt(tokenAddr, row.proof_hash);
        await db().from('payments').insert({
          bounty_id: b.id,
          proof_id: id,
          kind: 'receipt_nft',
          txid: receiptTxid,
          recipient: tokenAddr,
        });
        await logEvent(b.id, 'patchpay', 'receipt.minted', { txid: receiptTxid, to: tokenAddr });
      } catch (nftErr) {
        console.warn('PatchProof NFT receipt mint failed (payout unaffected):', nftErr);
        await logEvent(b.id, 'patchpay', 'receipt.failed', { message: (nftErr as Error).message });
      }
    }

    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
      try {
        await commentOnPr(b.owner, b.repo, row.pr_number, `💸 Paid in BCH by @${login}: ${txids.map((t) => EXPLORER_TX(t)).join(' ')}\nPatchProof hash is in the tx OP_RETURN.`);
      } catch {}
    }

    return NextResponse.json({ txids });
  } catch (e) {
    await db().from('proofs').update({ status: 'pending' }).eq('id', id);
    await logEvent(b.id, login, 'payout.failed', { message: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
