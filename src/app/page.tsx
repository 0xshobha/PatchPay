import { connection } from 'next/server';
import Link from 'next/link';
import { db } from '@/lib/db/supabase';
import { NETWORK } from '@/lib/bch/network';
import { getUsdPerBch } from '@/lib/price';
import { CategoryStamp } from '@/components/CategoryStamp';
import { StatsStrip } from '@/components/StatsStrip';
import { Usd } from '@/components/Usd';

type Row = { id: string; owner: string; repo: string; issue_number: number; issue_title: string; amount_sats: number; status: string; deadline_unix: number; created_at: string; network?: string; category?: string | null };

type Backing = { count: number; sats: number };

async function bounties(): Promise<{ rows: Row[]; backing: Map<string, Backing> }> {
  const backing = new Map<string, Backing>();
  try {
    const { data } = await db().from('bounties').select('*').eq('network', NETWORK)
      .neq('status', 'awaiting_funds').order('created_at', { ascending: false }).limit(30);
    const rows = (data as Row[]) ?? [];
    if (rows.length) {
      const { data: funds } = await db().from('payments').select('bounty_id,txid,amount_sats').eq('kind', 'fund').in('bounty_id', rows.map((r) => r.id));
      for (const f of (funds as { bounty_id: string; amount_sats: number | null }[] | null) ?? []) {
        const cur = backing.get(f.bounty_id) ?? { count: 0, sats: 0 };
        backing.set(f.bounty_id, { count: cur.count + 1, sats: cur.sats + (Number(f.amount_sats) || 0) });
      }
    }
    return { rows, backing };
  } catch { return { rows: [], backing }; }
}

const BACKABLE = ['open', 'in_review', 'verified'];

const bch = (sats: number) => (sats / 1e8).toFixed(sats >= 1e7 ? 3 : 5);
const docket = (id: string) => 'PP-' + id.slice(0, 4).toUpperCase();

const STEP_TONE = ['border-t-bch text-bch', 'border-t-carbon text-carbon', 'border-t-amber text-amber'];
const STATUS_TONE: Record<string, string> = { open: 'text-bch', in_review: 'text-carbon', verified: 'text-amber', paid: 'text-bch font-bold', refunded: 'text-ink-2' };

const STEPS: [string, string, string][] = [
  ['01', 'Lock BCH', 'A maintainer funds a one-off escrow contract for one GitHub issue. Anyone can add to it.'],
  ['02', 'Fix & merge', 'Anyone — person or AI agent — opens a PR. CI must be green and an AI review checks the criteria.'],
  ['03', 'Paid on-chain', 'On merge the contract pays the fixer and writes the PatchProof hash into the payout.'],
];

/** Hand-drawn-ish ink arrow between flow steps (points down on phones, right on wider screens). */
function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 24" className="w-10 h-6 shrink-0 self-center rotate-90 sm:rotate-0 text-ink">
      <path d="M2 13 C 12 10, 24 14, 34 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M27 6 L35 12 L27 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Home() {
  await connection();
  const [{ rows, backing }, usd] = await Promise.all([bounties(), getUsdPerBch()]);
  const tryIt = rows.find((r) => r.status === 'open') ?? rows.find((r) => BACKABLE.includes(r.status));
  return (
    <>
      <section className="grid md:grid-cols-[1.4fr_1fr] gap-10 items-start">
        <div>
          <p className="label mb-3">Form PP-1 · Open-source bounty, pre-funded</p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl leading-[1.02] font-medium tracking-tight">
            Bounties that are <em className="italic mark-bch">already</em> paid for.
          </h1>
          <p className="mt-5 text-lg text-ink-2 max-w-xl">
            A maintainer locks Bitcoin Cash into an escrow contract tied to one GitHub issue. Anyone, person or
            coding agent, sends a fix. When a maintainer merges it with green checks, the contract pays the
            contributor and stamps a <strong>PatchProof</strong> hash on-chain.
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <Link href="/new" className="btn btn-ink">Post a bounty</Link>
            <Link href="/how" className="btn">Read the rules</Link>
          </div>
        </div>
        <aside className="receipt mono text-[13px]">
          <div className="flex justify-between"><span>RECEIPT</span><span>#{rows.length ? docket(rows[0].id) : 'PP-0000'}</span></div>
          <div className="border-t border-dashed rule my-2" />
          {[
            ['funds locked before work starts', 'yes'],
            ['maintainer can ghost the payout', 'no*'],
            ['refund if nobody fixes it', 'auto'],
            ['proof of what was paid for', 'on-chain'],
            ['AI agents welcome', 'yes'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-0.5"><span>{k}</span><span className="font-bold">{v}</span></div>
          ))}
          <div className="border-t border-dashed rule my-2" />
          <p className="text-[11px] text-ink-2 pr-28 sm:pr-32">*merge with green checks = approval; the oracle signs. See the rules.</p>
          <span className="stamp text-bch absolute right-5 bottom-6">escrowed</span>
        </aside>
      </section>

      <section aria-label="How it works" className="mt-14">
        <ol className="flex flex-col sm:flex-row items-stretch gap-2">
          {STEPS.map(([n, title, text], i) => (
            <li key={n} className="contents">
              {i > 0 && <Arrow />}
              <div className={`flex-1 border-2 border-t-[6px] border-ink bg-[#f7f4ec] p-4 shadow-[3px_3px_0_var(--color-ink)] ${STEP_TONE[i].split(' ')[0]}`}>
                <p className={`mono text-xs font-bold ${STEP_TONE[i].split(' ')[1]}`}>{n}</p>
                <p className="text-xl font-medium mt-0.5">{title}</p>
                <p className="text-sm text-ink-2 mt-1">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {tryIt && (
        <section className="mt-10 text-center">
          <Link href={`/b/${tryIt.id}#back`} className="btn btn-bch inline-block !text-base sm:!text-lg !px-6 !py-4">
            Try it: back a live bounty →
          </Link>
          <p className="mono text-xs text-ink-2 mt-3">No sign-in. Any BCH wallet. Your coins pay whoever fixes the issue.</p>
        </section>
      )}

      <div className="mt-12">
        <StatsStrip usdPerBch={usd} />
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
          <h2 className="text-2xl font-medium">The ledger</h2>
          <span className="mono text-xs text-ink-2">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {NETWORK}</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 mono text-sm text-ink-2">No funded bounties yet. The first entry could be yours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full mono text-sm min-w-[34rem]">
              <thead className="text-ink-2 text-[11px] uppercase tracking-widest">
                <tr><th className="text-left py-2">Docket</th><th className="text-left">Issue</th><th className="text-right">BCH backed</th><th className="text-right pl-3">Backers</th><th className="text-right pl-3">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sats = backing.get(r.id)?.sats || Number(r.amount_sats);
                  return (
                    <tr key={r.id} className="border-t rule hover:bg-paper-2">
                      <td className="py-3 pr-3 align-top"><Link href={`/b/${r.id}`} className="ink-link">{docket(r.id)}</Link></td>
                      <td className="py-3 pr-3 font-serif text-base">
                        <Link href={`/r/${r.owner}/${r.repo}`} className="text-ink-2 mono text-xs hover:underline">{r.owner}/{r.repo}#{r.issue_number}</Link><br />
                        {r.issue_title} <CategoryStamp category={r.category} size="xs" />
                      </td>
                      <td className="py-3 text-right align-top">{bch(sats)}<Usd sats={sats} rate={usd} block /></td>
                      <td className="py-3 text-right pl-3 align-top">{backing.get(r.id)?.count ?? 0}</td>
                      <td className={`py-3 text-right pl-3 uppercase text-xs align-top ${STATUS_TONE[r.status] ?? ''}`}>{r.status.replace('_', ' ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
