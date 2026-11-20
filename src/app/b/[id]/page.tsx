import { connection } from 'next/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/supabase';
import { EXPLORER_TX } from '@/lib/bch/network';
import { DocketActions } from './DocketActions';
import { EscrowLive } from './EscrowLive';
import { CopyButton } from '@/components/CopyButton';
import { BackBounty } from './BackBounty';
import { PayoutChecklist } from './PayoutChecklist';
import { CategoryStamp } from '@/components/CategoryStamp';

const BACKABLE = ['open', 'in_review', 'verified'];

const STAMP: Record<string, { text: string; cls: string }> = {
  awaiting_funds: { text: 'unfunded', cls: 'text-del' },
  open: { text: 'escrowed', cls: 'text-bch' },
  in_review: { text: 'in review', cls: 'text-carbon' },
  verified: { text: 'verified', cls: 'text-carbon' },
  paid: { text: 'paid · bch', cls: 'text-bch' },
  refunded: { text: 'refunded', cls: 'text-ink-2' },
};

const isPast = (unix: number) => unix * 1000 < Date.now();

export default async function Docket({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [{ data: b }, { data: proofs }, { data: pays }, { data: events }] = await Promise.all([
    db().from('bounties').select('*').eq('id', id).maybeSingle(),
    db().from('proofs').select('*').eq('bounty_id', id).order('created_at', { ascending: false }),
    db().from('payments').select('*').eq('bounty_id', id).order('created_at'),
    db().from('events').select('*').eq('bounty_id', id).order('created_at'),
  ]);
  if (!b) notFound();
  const stamp = STAMP[b.status] ?? { text: b.status, cls: '' };
  const backers = new Set((pays ?? []).filter((p) => p.kind === 'fund').map((p) => p.txid)).size;
  const deadline = new Date(Number(b.deadline_unix) * 1000);

  return (
    <div className="grid md:grid-cols-[1.5fr_1fr] gap-10">
      <div>
        <p className="label">Docket PP-{b.id.slice(0, 4).toUpperCase()} · {b.network}</p>
        <h1 className="text-3xl sm:text-4xl font-medium mt-1 leading-tight break-words">{b.issue_title} <CategoryStamp category={b.category} /></h1>
        <p className="mono text-sm flex flex-wrap gap-x-3">
          <a className="ink-link" href={`https://github.com/${b.owner}/${b.repo}/issues/${b.issue_number}`}>{b.owner}/{b.repo}#{b.issue_number}</a>
          <Link className="ink-link" href={`/r/${b.owner}/${b.repo}`}>rate card</Link>
        </p>

        <div className="mt-8">
          <p className="label mb-1">Acceptance criteria</p>
          <pre className="whitespace-pre-wrap font-serif text-lg">{b.criteria}</pre>
        </div>

        <div className="mt-8 receipt mono text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="label">How to claim</p>
            <CopyButton
              label="Copy PR body lines"
              text={`Fixes #${b.issue_number}\nPatchPay-Address: ${b.network === 'mainnet' ? 'bitcoincash:' : 'bchtest:'}q…your address`}
            />
          </div>
          <p className="mt-2">Open a PR that says <b>Fixes #{b.issue_number}</b> and add this line to the PR body:</p>
          <pre className="mt-2 bg-paper-2 p-2 select-all whitespace-pre-wrap break-all">PatchPay-Address: {b.network === 'mainnet' ? 'bitcoincash:' : 'bchtest:'}q…your address</pre>
          <p className="mt-2">Coding agent? Also add <b>PatchPay-Agent: true</b>. Agents and humans are paid the same way.</p>
        </div>

        <h2 className="text-2xl font-medium mt-12 border-b-2 border-ink pb-1">PatchProofs</h2>
        {(proofs ?? []).length === 0 && <p className="mono text-sm text-ink-2 py-4">No merged PR yet.</p>}
        {(proofs ?? []).map((p) => (
          <div key={p.id} className="border-b rule py-4 mono text-sm">
            <div className="flex justify-between">
              <span>PR #{p.pr_number} by <Link href={`/u/${p.proof.contributor.github}`} className="ink-link">@{p.proof.contributor.github}</Link> {p.proof.contributor.kind === 'agent' && <span className="text-carbon">[agent]</span>}</span>
              <Link href={`/proof/${p.proof_hash}`} className="ink-link">{p.proof_hash.slice(0, 12)}…</Link>
            </div>
            <div className="text-xs text-ink-2 mt-1">
              checks {p.checks_green ? 'green' : 'NOT green'} · AI review {p.proof.review.score}/100 · +{p.proof.patch.additions}/−{p.proof.patch.deletions} · {p.status}
            </div>
            <PayoutChecklist row={p} owner={b.owner} repo={b.repo} pays={pays ?? []} />
            <DocketActions kind="approve" bountyId={b.id} proofId={p.id} disabled={p.status !== 'pending' || !p.checks_green} paid={p.status === 'paid'} />
          </div>
        ))}
      </div>

      <aside className="space-y-6">
        <div className="receipt mono text-[13px] relative">
          <div className="flex justify-between"><span>ESCROW</span><span>{(Number(b.amount_sats) / 1e8).toFixed(5)} BCH</span></div>
          <div className="border-t border-dashed rule my-2" />
          <p className="break-all text-xs select-all">{b.escrow_address}</p>
          <EscrowLive bountyId={b.id} escrow={b.escrow_address} amountSats={Number(b.amount_sats)} funded={b.status !== 'awaiting_funds'} backers={backers} />
          <div className="border-t border-dashed rule my-2" />
          <p className="text-xs">refunds to maintainer after {deadline.toISOString().slice(0, 10)}</p>
          <p className="text-xs mt-1 text-ink-2 break-all">oracle {b.oracle_pubkey.slice(0, 18)}…</p>
          <span className={`stamp absolute right-4 -bottom-2 ${stamp.cls}`}>{stamp.text}</span>
        </div>
        {BACKABLE.includes(b.status) && <BackBounty bountyId={b.id} escrow={b.escrow_address} />}
        <DocketActions kind="sync" bountyId={b.id} escrow={b.escrow_address} amountSats={Number(b.amount_sats)} status={b.status} pastDeadline={isPast(Number(b.deadline_unix))} />

        <div>
          <p className="label mb-2">Transactions</p>
          {(pays ?? []).length === 0 && <p className="mono text-xs text-ink-2">None yet.</p>}
          {(pays ?? []).map((t) => (
            <a key={t.id} href={EXPLORER_TX(t.txid)} className="block mono text-xs ink-link">
              {t.kind === 'fund' ? 'backed' : t.kind}{t.amount_sats ? ` ${(Number(t.amount_sats) / 1e8).toFixed(5)}` : ''} · {t.txid.slice(0, 12)}…
            </a>
          ))}
        </div>
        <div>
          <p className="label mb-2">Audit trail</p>
          <ul className="mono text-[11px] space-y-1">
            {(events ?? []).map((e) => <li key={e.id}>{e.created_at.slice(5, 16).replace('T', ' ')} · {e.actor} · {e.action}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}
