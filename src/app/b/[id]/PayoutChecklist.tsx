import { isMaintainer } from '@/lib/github/app';
import { isValidAddress } from '@/lib/bch/keys';
import { EXPLORER_TX, NETWORK } from '@/lib/bch/network';
import { autoPayoutBlocker, autoPayoutEnabled, type ProofWithBounty } from '@/lib/payout';
import { githubConfigured } from '@/lib/mode';
import type { PatchProof } from '@/lib/patchproof/proof';

type Row = { id: string; pr_number: number; proof: PatchProof; proof_hash: string; checks_green: boolean; status: string };
type Pay = { proof_id?: string | null; kind: string; txid: string; amount_sats?: number | null };

function Item({ ok, label, children }: { ok: boolean | null; label: string; children?: React.ReactNode }) {
  const mark = ok === null ? '·' : ok ? '✓' : '✗';
  const cls = ok === null ? 'text-ink-2' : ok ? 'text-bch' : 'text-del';
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-1">
      <span className={`font-bold ${cls}`} aria-label={ok === null ? 'unknown' : ok ? 'passed' : 'failed'}>{mark}</span>
      <span>{label}{children && <span className="block text-ink-2 break-all">{children}</span>}</span>
    </li>
  );
}

/** Live answer to "why did (or didn't) this PR get paid?" for judges and contributors. */
export async function PayoutChecklist({ row, owner, repo, pays }: { row: Row; owner: string; repo: string; pays: Pay[] }) {
  const p = row.proof;
  const author = p.contributor.github;
  const mergedBy = p.patch.mergedBy;
  const merged = Boolean(p.patch.mergeSha && mergedBy);

  // Is the merger a maintainer? Ask GitHub live; show "unknown" if it can't answer.
  let mergerIsMaintainer: boolean | null = null;
  if (merged && mergedBy && githubConfigured()) {
    try { mergerIsMaintainer = await isMaintainer(owner, repo, mergedBy); } catch { mergerIsMaintainer = null; }
  }
  const notAuthor = merged ? mergedBy!.toLowerCase() !== author.toLowerCase() : null;
  const mergerOk = !merged ? false : notAuthor === false ? false : mergerIsMaintainer;

  const addrOk = isValidAddress(p.contributor.payoutAddress);
  const releases = pays.filter((x) => x.proof_id === row.id && x.kind === 'release');
  const paid = row.status === 'paid';
  const blocker = autoPayoutBlocker(row as ProofWithBounty);

  let verdict: string;
  if (paid) verdict = 'Paid. The contract released the escrow to the contributor.';
  else if (row.status === 'approved') verdict = 'Payout in progress…';
  else if (blocker) verdict = `Not paid yet: ${blocker}.`;
  else if (mergerOk === false) verdict = 'Not paid automatically: the merge was not by a maintainer other than the author. A maintainer can approve manually.';
  else verdict = autoPayoutEnabled() ? 'Every condition passes. Auto-payout runs on merge; a maintainer can also approve below.' : 'Every condition passes. Waiting for a maintainer to approve.';

  return (
    <div className="mt-3 bg-paper-2 p-3 text-xs">
      <p className="label mb-2">Payout checklist</p>
      <ul className="space-y-1">
        <Item ok={merged} label="PR merged">{merged ? `merge ${p.patch.mergeSha!.slice(0, 10)} by @${mergedBy}` : 'not merged yet'}</Item>
        <Item ok={mergerOk} label="Merged by a maintainer who is not the author">
          {!merged ? '—' : notAuthor === false ? `@${mergedBy} is also the PR author` : mergerIsMaintainer === null ? `@${mergedBy} (maintainer status unknown)` : `@${mergedBy} ${mergerIsMaintainer ? 'is a maintainer' : 'is not a maintainer'}`}
        </Item>
        <Item ok={row.checks_green} label={`CI checks green (${p.checks.length})`}>
          {p.checks.length === 0 ? 'no check runs on this commit — the repo needs a CI workflow' : p.checks.map((c) => `${c.name}: ${c.conclusion ?? 'pending'}`).join(' · ')}
        </Item>
        <Item ok={addrOk} label={`Valid PatchPay-Address for ${NETWORK}`}>{p.contributor.payoutAddress || 'missing from the PR body'}</Item>
        <Item ok={p.review.criteriaMet} label="AI review: acceptance criteria met">{`${p.review.score}/100 · ${p.review.model}`}{p.review.risks?.length ? ` · risks: ${p.review.risks.join('; ')}` : ''}</Item>
        <Item ok={!p.review.slopSignals?.length} label="No AI-slop signals">{p.review.slopSignals?.length ? p.review.slopSignals.join('; ') : undefined}</Item>
        <Item ok={paid} label="Paid">
          {releases.length
            ? releases.map((t) => (
                <a key={t.txid} href={EXPLORER_TX(t.txid)} className="ink-link block" target="_blank" rel="noreferrer">
                  {t.amount_sats ? `${(Number(t.amount_sats) / 1e8).toFixed(5)} BCH · ` : ''}{t.txid.slice(0, 20)}…
                </a>
              ))
            : 'not yet'}
        </Item>
      </ul>
      <p className={`mt-2 ${paid ? 'text-bch' : 'text-ink'}`}>{verdict}</p>
    </div>
  );
}
