import 'server-only';
import { binToHex, sha256, utf8ToBin } from '@bitauth/libauth';
import { db, logEvent } from '@/lib/db/supabase';
import { isMaintainer, octokitForRepo } from '@/lib/github/app';
import { commentOnPr } from '@/lib/github/verify';
import { signRelease } from '@/lib/bch/oracle';
import { releaseEscrow } from '@/lib/bch/escrow';
import { mintReceipt } from '@/lib/bch/receipt';
import { isValidAddress, toTokenAddress } from '@/lib/bch/keys';
import { EXPLORER_TX } from '@/lib/bch/network';
import type { PatchProof } from '@/lib/patchproof/proof';
import { githubConfigured, isDemoMode } from '@/lib/mode';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ProofWithBounty = { id: string; pr_number: number; proof: PatchProof; proof_hash: string; checks_green: boolean; status: string; bounties: any };

export class PayoutError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Auto-payout on merge is on unless AUTO_PAYOUT_ON_MERGE=0. */
export const autoPayoutEnabled = () => process.env.AUTO_PAYOUT_ON_MERGE !== '0';

/**
 * The single code path that moves escrow money: claim the proof row (so two
 * callers can never pay twice), have the oracle sign, release on-chain with the
 * PatchProof OP_RETURN, record payments, and announce it.
 * Callers are responsible for authorisation checks before calling this.
 */
export async function executePayout(row: ProofWithBounty, approver: string): Promise<{ txids: string[] }> {
  const b = row.bounties;
  const proof = row.proof;

  const { data: claimed } = await db().from('proofs').update({ status: 'approved' }).eq('id', row.id).eq('status', 'pending').select().maybeSingle();
  if (!claimed) throw new PayoutError('This payout is already being processed', 409);

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
        bounty_id: b.id, proof_id: row.id, kind: 'release', txid: r.txid,
        amount_sats: Number(r.amountSats), recipient: proof.contributor.payoutAddress, oracle_sig: sigHex,
      });
    }
    await db().from('proofs').update({ status: 'paid' }).eq('id', row.id);
    await db().from('bounties').update({ status: 'paid' }).eq('id', b.id);
    const totalSats = releases.reduce((s, r) => s + r.amountSats, 0n);
    await logEvent(b.id, approver, 'payout.released', { txids, sats: totalSats.toString() });

    // Best-effort NFT receipt: the payout has settled, so a failure here is only logged.
    if (process.env.RECEIPT_WALLET_WIF && process.env.RECEIPT_CATEGORY) {
      try {
        const tokenAddr = toTokenAddress(proof.contributor.payoutAddress);
        const receiptTxid = await mintReceipt(tokenAddr, row.proof_hash);
        await db().from('payments').insert({ bounty_id: b.id, proof_id: row.id, kind: 'receipt_nft', txid: receiptTxid, recipient: tokenAddr });
        await logEvent(b.id, 'patchpay', 'receipt.minted', { txid: receiptTxid, to: tokenAddr });
      } catch (nftErr) {
        console.warn('PatchProof NFT receipt mint failed (payout unaffected):', nftErr);
        await logEvent(b.id, 'patchpay', 'receipt.failed', { message: (nftErr as Error).message });
      }
    }

    if (githubConfigured()) {
      const who = approver.startsWith('auto:') ? `automatically on merge by @${approver.slice(5)}` : `by @${approver}`;
      try {
        await commentOnPr(b.owner, b.repo, row.pr_number,
          `### 💸 Paid ${(Number(totalSats) / 1e8).toFixed(5)} BCH ${who}\n${txids.map((t) => EXPLORER_TX(t)).join('\n')}\n\nThe PatchProof hash \`${row.proof_hash.slice(0, 16)}…\` is in the payout's OP_RETURN.`);
      } catch (e) { console.warn('Payout comment failed:', e); }
    }
    return { txids };
  } catch (e) {
    await db().from('proofs').update({ status: 'pending' }).eq('id', row.id);
    await logEvent(b.id, approver, 'payout.failed', { message: (e as Error).message });
    throw new PayoutError((e as Error).message, 502);
  }
}

/** Why a proof may not be paid automatically (null = eligible). Pure checks on stored data. */
export function autoPayoutBlocker(row: ProofWithBounty): string | null {
  const p = row.proof;
  if (row.status !== 'pending') return `proof is ${row.status}`;
  if (!p.patch.mergeSha || !p.patch.mergedBy) return 'the PR is not merged';
  if (!row.checks_green) return 'not all CI checks are green yet (it will retry when CI finishes)';
  if (!isValidAddress(p.contributor.payoutAddress)) return 'the PR body has no valid `PatchPay-Address:` for this network';
  if (p.patch.mergedBy.toLowerCase() === p.contributor.github.toLowerCase()) return 'the PR author merged their own PR, and nobody may pay themselves — a different maintainer must approve it, or the work must come from another account';
  if (!p.review.criteriaMet) return `the AI review says the acceptance criteria are not met (score ${p.review.score}/100)`;
  if (p.review.slopSignals?.length) return `the AI review flagged: ${p.review.slopSignals.join('; ')}`;
  return null;
}

/**
 * Pay a merged, verified PatchProof without a manual click. The merge itself is the
 * maintainer's approval, so this re-checks it live on GitHub: still merged, same
 * head commit, and merged by a repo admin/maintainer who is not the PR author.
 * Never throws; returns what happened so callers (webhook) can log it.
 */
export async function autoPayoutIfEligible(proofId: string, opts: { notifyOnSkip?: boolean } = {}): Promise<{ paid: boolean; reason?: string; txids?: string[] }> {
  if (!autoPayoutEnabled()) return { paid: false, reason: 'auto-payout disabled' };
  const { data } = await db().from('proofs').select('*, bounties(*)').eq('id', proofId).maybeSingle();
  const row = data as ProofWithBounty | null;
  if (!row?.bounties) return { paid: false, reason: 'proof not found' };
  const b = row.bounties;

  const skip = async (reason: string) => {
    await logEvent(b.id, 'patchpay', 'payout.auto_skipped', { pr: row.pr_number, reason });
    if (opts.notifyOnSkip && githubConfigured()) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
      try {
        await commentOnPr(b.owner, b.repo, row.pr_number,
          `⏸️ Not paid automatically: ${reason}.${site ? ` A maintainer can review and approve at ${site}/b/${b.id}` : ''}`);
      } catch { /* comment is best-effort */ }
    }
    return { paid: false, reason };
  };

  const blocker = autoPayoutBlocker(row);
  if (blocker) return skip(blocker);
  if (!githubConfigured()) return skip('GitHub App is not configured, so the merge cannot be verified');

  try {
    const ok = await octokitForRepo(b.owner, b.repo);
    const { data: pr } = await ok.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner: b.owner, repo: b.repo, pull_number: row.pr_number });
    if (!pr.merged || !pr.merged_by) return skip('GitHub does not show the PR as merged');
    if (pr.head.sha !== row.proof.patch.headSha) return skip('the PR changed since the proof was built');
    if (pr.merged_by.login.toLowerCase() === pr.user?.login.toLowerCase()) return skip('the PR author merged their own PR, and nobody may pay themselves — a different maintainer must approve it, or the work must come from another account');
    if (!(await isMaintainer(b.owner, b.repo, pr.merged_by.login))) return skip(`@${pr.merged_by.login} is not a repo admin/maintainer`);

    const { txids } = await executePayout(row, `auto:${pr.merged_by.login}`);
    return { paid: true, txids };
  } catch (e) {
    if (e instanceof PayoutError && e.status === 409) return { paid: false, reason: e.message };
    return skip(`automatic payout failed: ${(e as Error).message}`);
  }
}
