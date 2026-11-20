import 'server-only';
import { db } from '@/lib/db/supabase';
import { NETWORK } from '@/lib/bch/network';

const CLOSED = ['paid', 'refunded', 'cancelled'];

type B = { id: string; status: string; owner: string; repo: string };
type P = { bounty_id: string; kind: string; txid: string; amount_sats: number | null };

async function load(filter?: { owner: string; repo: string }) {
  let q = db().from('bounties').select('id,status,owner,repo').eq('network', NETWORK);
  if (filter) q = q.eq('owner', filter.owner).eq('repo', filter.repo);
  const { data: bData } = await q.limit(1000);
  const bounties = (bData as B[] | null) ?? [];
  const ids = bounties.map((b) => b.id);
  if (!ids.length) return { bounties, pays: [] as P[], ids };
  const { data: pData } = await db().from('payments').select('bounty_id,kind,txid,amount_sats').in('bounty_id', ids).limit(5000);
  return { bounties, pays: (pData as P[] | null) ?? [], ids };
}

/** Network-wide numbers for the homepage strip. Never throws. */
export async function getGlobalStats() {
  try {
    const { bounties, pays, ids } = await load();
    const status = new Map(bounties.map((b) => [b.id, b.status]));
    const fund = pays.filter((p) => p.kind === 'fund');
    const lockedSats = fund.filter((p) => !CLOSED.includes(status.get(p.bounty_id) ?? '')).reduce((s, p) => s + (Number(p.amount_sats) || 0), 0);
    const paidSats = pays.filter((p) => p.kind === 'release').reduce((s, p) => s + (Number(p.amount_sats) || 0), 0);
    let contributors = 0;
    if (ids.length) {
      const { data } = await db().from('proofs').select('proof').in('bounty_id', ids).limit(5000);
      contributors = new Set(((data as { proof: { contributor?: { github?: string } } }[] | null) ?? []).map((r) => r.proof?.contributor?.github?.toLowerCase()).filter(Boolean)).size;
    }
    return {
      lockedSats,
      paidSats,
      bounties: bounties.filter((b) => b.status !== 'awaiting_funds').length,
      contributors,
      backers: new Set(fund.map((p) => p.txid)).size,
    };
  } catch {
    return null;
  }
}

/** BCH currently backing open bounties on one repo (for the README badge). */
export async function getRepoOpenSats(owner: string, repo: string) {
  try {
    const { bounties, pays } = await load({ owner, repo });
    const open = new Set(bounties.filter((b) => !CLOSED.includes(b.status) && b.status !== 'awaiting_funds').map((b) => b.id));
    return {
      openSats: pays.filter((p) => p.kind === 'fund' && open.has(p.bounty_id)).reduce((s, p) => s + (Number(p.amount_sats) || 0), 0),
      openCount: open.size,
    };
  } catch {
    return { openSats: 0, openCount: 0 };
  }
}
