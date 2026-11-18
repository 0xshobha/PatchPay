import { sha256, utf8ToBin, binToHex } from '@bitauth/libauth';

/** Everything a judge needs to re-check a payout, in one canonical object. */
export interface PatchProof {
  v: 1;
  bounty: { id: string; repo: string; issue: number; amountSats: string; escrow: string };
  patch: {
    pr: number; headSha: string; mergeSha: string | null; mergedBy: string | null;
    diffSha256: string; filesChanged: number; additions: number; deletions: number;
  };
  checks: { name: string; conclusion: string | null; url: string }[];
  review: { model: string; criteriaMet: boolean; score: number; risks: string[]; slopSignals: string[] };
  contributor: { github: string; kind: 'human' | 'agent'; payoutAddress: string };
  approvedBy: string | null;
  createdAt: string;
}

/** Stable JSON: sorted keys, no whitespace — same input, same hash, forever. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export const sha256Hex = (s: string) => binToHex(sha256.hash(utf8ToBin(s)));
export const proofHash = (p: PatchProof) => sha256Hex(canonicalJson(p));

export function checksAllGreen(p: PatchProof) {
  return p.checks.length > 0 && p.checks.every((c) => c.conclusion === 'success' || c.conclusion === 'skipped' || c.conclusion === 'neutral');
}
