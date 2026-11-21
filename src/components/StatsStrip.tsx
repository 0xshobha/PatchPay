import { getGlobalStats } from '@/lib/stats';
import { NETWORK } from '@/lib/bch/network';
import { Usd } from '@/components/Usd';

/** Homepage strip: BCH locked · BCH paid · bounties · contributors · backers. */
export async function StatsStrip({ usdPerBch }: { usdPerBch: number | null }) {
  const s = await getGlobalStats();
  if (!s) return null;
  const tone = ['text-carbon', 'text-bch', 'text-ink', 'text-amber', 'text-ink'];
  const items: [string, React.ReactNode][] = [
    ['BCH locked', <>{(s.lockedSats / 1e8).toFixed(4)}<Usd sats={s.lockedSats} rate={usdPerBch} block /></>],
    ['BCH paid', <>{(s.paidSats / 1e8).toFixed(4)}<Usd sats={s.paidSats} rate={usdPerBch} block /></>],
    ['bounties', s.bounties],
    ['contributors', s.contributors],
    ['backers', s.backers],
  ];
  return (
    // 1px gaps over a rule-coloured background draw hairlines between cells at any width.
    <section aria-label={`PatchPay totals on ${NETWORK}`} className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-rule border-y-2 border-ink">
      {items.map(([label, value], i) => (
        <div key={label} className={`bg-paper py-3 px-3 ${i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}>
          <p className="label">{label}</p>
          <p className={`mono text-2xl font-medium leading-tight ${tone[i]}`}>{value}</p>
        </div>
      ))}
    </section>
  );
}
