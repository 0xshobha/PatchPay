import { connection } from 'next/server';
import Link from 'next/link';
import { db } from '@/lib/db/supabase';
import { NETWORK } from '@/lib/bch/network';
import { CATEGORIES } from '@/lib/categories';
import { getRateCard } from '@/lib/rates';
import { CategoryStamp } from '@/components/CategoryStamp';
import { RateCardEditor } from './RateCardEditor';
import { CopyButton } from '@/components/CopyButton';
import { getUsdPerBch } from '@/lib/price';
import { Usd } from '@/components/Usd';

type Bounty = { id: string; issue_number: number; issue_title: string; amount_sats: number; status: string; category?: string | null; created_at: string };

const bch = (sats: number) => (sats / 1e8).toFixed(sats >= 1e7 ? 3 : 5);

export default async function RepoRateCard({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  await connection();
  const { owner, repo } = await params;

  const [card, { data: bData }, usd] = await Promise.all([
    getRateCard(owner, repo),
    db().from('bounties').select('*').eq('owner', owner).eq('repo', repo).eq('network', NETWORK).order('created_at', { ascending: false }).limit(100),
    getUsdPerBch(),
  ]);
  const bounties = (bData as Bounty[] | null) ?? [];
  const ids = bounties.map((b) => b.id);
  const { data: pData } = ids.length
    ? await db().from('payments').select('bounty_id,kind,amount_sats').in('bounty_id', ids).in('kind', ['release', 'fund'])
    : { data: [] };
  const pays = (pData as { bounty_id: string; kind: string; amount_sats: number | null }[] | null) ?? [];
  const sum = (kind: string, pred: (id: string) => boolean = () => true) => pays.filter((p) => p.kind === kind && pred(p.bounty_id)).reduce((s, p) => s + (Number(p.amount_sats) || 0), 0);
  const status = new Map(bounties.map((b) => [b.id, b.status]));
  const paidSats = sum('release');
  const openSats = sum('fund', (id) => !['paid', 'refunded', 'cancelled'].includes(status.get(id) ?? ''));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const badgeMd = `[![PatchPay](${site}/badge/${owner}/${repo})](${site}/r/${owner}/${repo})`;

  return (
    <div className="max-w-3xl">
      <p className="label">Rate card · {NETWORK}</p>
      <h1 className="text-4xl font-medium mt-1 break-words">{owner}/{repo}</h1>
      <a className="ink-link mono text-sm" href={`https://github.com/${owner}/${repo}`}>github.com/{owner}/{repo}</a>

      <div className="grid sm:grid-cols-2 gap-8 mt-8 items-start">
        <div className="receipt mono text-[13px]">
          <div className="flex justify-between"><span>RATE CARD</span><span className="text-ink-2">BCH</span></div>
          <div className="border-t border-dashed rule my-2" />
          {CATEGORIES.map((c) => (
            <div key={c} className="flex justify-between gap-3 py-0.5">
              <span>{c}</span>
              <span><b>{(card[c].sats / 1e8).toString()}</b><Usd sats={card[c].sats} rate={usd} /> <span className="text-ink-2 text-[11px]">{card[c].source === 'default' ? 'default' : ''}</span></span>
            </div>
          ))}
          <div className="border-t border-dashed rule my-2" />
          <p className="text-[11px] text-ink-2">Suggested reward per category. Posting a bounty prefills it; the maintainer can still change the amount.</p>
        </div>

        <div className="receipt mono text-[13px]">
          <div className="flex justify-between"><span>BOUNTIES</span><span className="font-bold">{bounties.length}</span></div>
          <div className="border-t border-dashed rule my-2" />
          <div className="flex justify-between py-0.5"><span>open (backed)</span><span className="font-bold">{bch(openSats)} BCH<Usd sats={openSats} rate={usd} /></span></div>
          <div className="flex justify-between py-0.5"><span>paid to contributors</span><span className="font-bold">{bch(paidSats)} BCH<Usd sats={paidSats} rate={usd} /></span></div>
        </div>
      </div>

      <div className="mt-8 mono text-xs">
        <p className="label mb-2">README badge</p>
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/badge/${owner}/${repo}`} alt={`PatchPay badge for ${owner}/${repo}`} height={20} />
          <CopyButton text={badgeMd} label="Copy markdown" />
        </div>
        <pre className="mt-2 bg-paper-2 p-2 whitespace-pre-wrap break-all select-all">{badgeMd}</pre>
      </div>

      <RateCardEditor owner={owner} repo={repo} initial={Object.fromEntries(CATEGORIES.map((c) => [c, card[c].sats])) as Record<(typeof CATEGORIES)[number], number>} />

      <h2 className="text-2xl font-medium mt-12 border-b-2 border-ink pb-1">Bounties</h2>
      {bounties.length === 0 ? (
        <p className="py-8 mono text-sm text-ink-2">No {NETWORK} bounties on this repo yet. <Link href="/new" className="ink-link">Post one</Link>.</p>
      ) : (
        <ul>
          {bounties.map((b) => (
            <li key={b.id} className="border-b rule py-3 mono text-sm flex flex-wrap justify-between gap-x-4 gap-y-1">
              <span className="min-w-0">
                <Link href={`/b/${b.id}`} className="ink-link">#{b.issue_number}</Link> <span className="font-serif text-base">{b.issue_title}</span> <CategoryStamp category={b.category} size="xs" />
              </span>
              <span className="text-xs uppercase">{bch(Number(b.amount_sats))} BCH · {b.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
