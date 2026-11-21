/** "≈ $1.23" next to a BCH amount. Renders nothing when no price is available. */
export function Usd({ sats, rate, block = false }: { sats: number; rate: number | null | undefined; block?: boolean }) {
  if (!rate || !Number.isFinite(sats)) return null;
  const usd = (sats / 1e8) * rate;
  const text = usd === 0 ? '0' : usd >= 100 ? usd.toFixed(0) : usd >= 1 ? usd.toFixed(2) : usd.toFixed(usd >= 0.01 ? 2 : 3);
  return (
    <span className={`text-ink-2 font-normal text-[0.75em] ${block ? 'block' : 'ml-1'}`} title="Approximate USD value at the current mainnet BCH price">
      ≈ ${text}
    </span>
  );
}
