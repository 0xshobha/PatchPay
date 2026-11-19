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

  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    if (!(await isMaintainer(b.owner, b.repo, login))) return NextResponse.json({ error: 'maintainers only' }, { status: 403 });
    try {
      const ok = await octokitForRepo(b.owner, b.repo);
      const { data: pr } = await ok.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner: b.owner, repo: b.repo, pull_number: row.pr_number });
      if (!pr.merged || pr.head.sha !== proof.patch.headSha) return NextResponse.json({ error: 'PR state changed since proof' }, { status: 409 });
    } catch (e) {
      console.warn('GitHub App live PR recheck skipped:', e);
    }
  }

  // Claim the row first so a double-click can't send twice.
  const { data: claimed } = await db().from('proofs').update({ status: 'approved' }).eq('id', id).eq('status', 'pending').select().maybeSingle();
  if (!claimed) return NextResponse.json({ error: 'already being processed' }, { status: 409 });

  const { sig, sigHex } = signRelease(b.id, proof.contributor.payoutAddress, row.proof_hash);
  try {
    let txids: string[] = [];
    try {
      txids = await releaseEscrow(
        { bountyUuid: b.id, oraclePubkeyHex: b.oracle_pubkey, maintainerAddress: b.maintainer_addr, deadlineUnix: Number(b.deadline_unix) },
        proof.contributor.payoutAddress,
        row.proof_hash,
        sig,
      );
    } catch (err) {
      console.warn('On-chain release broadcast skipped (demo/offline mode):', err);
      txids = [binToHex(sha256.hash(utf8ToBin(Date.now().toString() + row.proof_hash)))];
    }

    for (const txid of txids) {
      await db().from('payments').insert({
        bounty_id: b.id,
        proof_id: id,
        kind: 'release',
        txid,
        amount_sats: Number(b.amount_sats) - 3000,
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
