/** Bounty categories and default rates. Safe to import from client and server. */
export const CATEGORIES = ['docs', 'bug', 'feature', 'security', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Default reward per category when a repo has no rate card entry (sats). */
export const DEFAULT_RATE_SATS: Record<Category, number> = {
  docs: 50_000, //      0.0005 BCH
  bug: 200_000, //      0.002 BCH
  feature: 500_000, //  0.005 BCH
  security: 1_000_000, // 0.01 BCH
  other: 100_000, //    0.001 BCH
};

export const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

/** GitHub labels win over the AI: map common label names to a category. */
export function categoryFromLabels(labels: (string | { name?: string | null })[]): Category | null {
  const names = labels.map((l) => (typeof l === 'string' ? l : l.name ?? '').toLowerCase().trim());
  const has = (...keys: string[]) => names.some((n) => keys.some((k) => n === k || n.startsWith(k + ':') || n.includes(k)));
  if (has('security', 'vulnerability', 'cve')) return 'security';
  if (has('bug', 'defect', 'regression', 'crash')) return 'bug';
  if (has('feature', 'enhancement', 'feature request')) return 'feature';
  if (has('documentation', 'docs', 'typo')) return 'docs';
  return null;
}

export const satsToBch = (sats: number) => sats / 1e8;
export const fmtBch = (sats: number) => (sats / 1e8).toFixed(sats > 0 && sats < 100_000 ? 5 : 4).replace(/0+$/, '').replace(/\.$/, '.0');
