import 'server-only';
import { buildPatchProof, commentOnPr } from '@/lib/github/verify';
import { proofHash, checksAllGreen } from './proof';
import { db, logEvent } from '@/lib/db/supabase';

export interface BountyRow {
  id: string;
  owner: string;
  repo: string;
  issue_number: number;
  amount_sats: number | string;
  escrow_address: string;
  criteria: string;
}

export interface ProofRow {
  id: string;
  pr_number: number;
}

/**
 * Re-read the PR from GitHub, rebuild the PatchProof, and persist the new
 * proof / proof_hash / checks_green onto an existing proof row. Used when CI
 * finished only after the PR was merged (check_suite webhook) and for the
 * maintainer-triggered "Refresh proof" button. Posting the comment is
 * best-effort so a GitHub API hiccup never loses the rebuilt proof.
 */
export async function rebuildProof(bounty: BountyRow, row: ProofRow, actor: string) {
  const { proof } = await buildPatchProof({
    bounty: {
      id: bounty.id,
      owner: bounty.owner,
      repo: bounty.repo,
      issue: bounty.issue_number,
      amountSats: BigInt(bounty.amount_sats),
      escrow: bounty.escrow_address,
      criteria: bounty.criteria,
    },
    pr: row.pr_number,
  });
  const hash = proofHash(proof);
  const green = checksAllGreen(proof);

  await db().from('proofs').update({ proof, proof_hash: hash, checks_green: green }).eq('id', row.id);
  await logEvent(bounty.id, actor, 'proof.refreshed', { pr: row.pr_number, hash, green });

  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
    await commentOnPr(bounty.owner, bounty.repo, row.pr_number, [
      `### 🧾 PatchProof refreshed \`${hash.slice(0, 16)}…\``,
      `Checks: ${green ? '✅ all green' : '❌ not all green'} (${proof.checks.length}).`,
      site ? `Maintainer: approve the payout at ${site}/b/${bounty.id}` : '',
    ].filter(Boolean).join('\n'));
  } catch (e) {
    console.warn('PatchProof refresh comment skipped:', e);
  }

  return { hash, green, proof };
}
