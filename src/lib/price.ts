import 'server-only';

// CoinGecko simple price, cached per server instance for 10 minutes.
// Returns null when unavailable so callers simply hide the USD figure.
const TTL_MS = 10 * 60 * 1000;
let memo: { at: number; usd: number | null } | null = null;
let inflight: Promise<number | null> | null = null;

export async function getUsdPerBch(): Promise<number | null> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.usd;
  if (inflight) return inflight;
  inflight = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd', {
        signal: ctrl.signal,
        headers: { accept: 'application/json' },
      });
      const j = r.ok ? await r.json() : null;
      const usd = typeof j?.['bitcoin-cash']?.usd === 'number' ? j['bitcoin-cash'].usd : null;
      // Keep a previous good price if this refresh failed.
      memo = { at: Date.now(), usd: usd ?? memo?.usd ?? null };
    } catch {
      memo = { at: Date.now() - TTL_MS + 60_000, usd: memo?.usd ?? null }; // retry in ~1 min
    } finally {
      clearTimeout(t);
      inflight = null;
    }
    return memo.usd;
  })();
  return inflight;
}
