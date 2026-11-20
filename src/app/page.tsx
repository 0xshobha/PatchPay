import { connection } from 'next/server';
import Link from 'next/link';
import { db } from '@/lib/db/supabase';

type Row = { id: string; owner: string; repo: string; issue_number: number; issue_title: string; amount_sats: number; status: string; deadline_unix: number; created_at: string };

type Backing = { count: number; sats: number };

async function bounties(): Promise<{ rows: Row[]; backing: Map<string, Backing> }> {
  const backing = new Map<string, Backing>();
  try {
    const { data } = await db().from('bounties').select('id,owner,repo,issue_number,issue_title,amount_sats,status,deadline_unix,created_at')
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

export default async function Home() {
  await connection();
  const { rows, backing } = await bounties();
  const tryIt = rows.find((r) => r.status === 'open') ?? rows.find((r) => BACKABLE.includes(r.status));
  return (
    <>
      <section className="grid md:grid-cols-[1.4fr_1fr] gap-10 items-start">
        <div>
          <p className="label mb-3">Form PP-1 · Open-source bounty, pre-funded</p>
          <h1 className="text-5xl md:text-6xl leading-[1.02] font-medium tracking-tight">
            Bounties that are <em className="italic">already</em> paid for.
          </h1>
          <p className="mt-5 text-lg text-ink-2 max-w-xl">
            A maintainer locks Bitcoin Cash into an escrow contract tied to one GitHub issue. Anyone, person or
            coding agent, sends a fix. When the PR is merged, the checks are green and the maintainer signs off,
            the contract pays the contributor and stamps a <strong>PatchProof</strong> hash on-chain.
          </p>
          <div className="mt-7 flex flex-wrap gap-4">
            <Link href="/new" className="btn btn-ink">Post a bounty</Link>
            <Link href="/how" className="btn">Read the rules</Link>
            {tryIt && <Link href={`/b/${tryIt.id}#back`} className="btn">Try it: back a live bounty</Link>}
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
          <p className="text-[11px] text-ink-2 pr-32">*after merge + green checks, the oracle signs; see “trust model”.</p>
          <span className="stamp text-bch absolute right-5 bottom-6">escrowed</span>
        </aside>
      </section>

      <section className="mt-16">
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-1">
          <h2 className="text-2xl font-medium">The ledger</h2>
          <span className="mono text-xs text-ink-2">{rows.length} entries</span>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 mono text-sm text-ink-2">No funded bounties yet. The first entry could be yours.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full mono text-sm min-w-[22rem]">
            <thead className="text-ink-2 text-[11px] uppercase tracking-widest">
              <tr><th className="text-left py-2">Docket</th><th className="text-left">Issue</th><th className="text-right">BCH backed</th><th className="text-right pl-3">Backers</th><th className="text-right pl-3">Status</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t rule hover:bg-paper-2">
                  <td className="py-3 pr-3"><Link href={`/b/${r.id}`} className="ink-link">{docket(r.id)}</Link></td>
                  <td className="pr-3 font-serif text-base"><span className="text-ink-2 mono text-xs">{r.owner}/{r.repo}#{r.issue_number}</span><br />{r.issue_title}</td>
                  <td className="text-right">{bch(backing.get(r.id)?.sats || Number(r.amount_sats))}</td>
                  <td className="text-right pl-3">{backing.get(r.id)?.count ?? 0}</td>
                  <td className="text-right pl-3 uppercase text-xs">{r.status.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </>
  );
}
