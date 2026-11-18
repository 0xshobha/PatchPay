import { NextResponse } from 'next/server';
import { db, logEvent } from '@/lib/db/supabase';
import { refundEscrow } from '@/lib/bch/escrow';

/** Permissionless: after the deadline anyone may trigger it; the contract only pays the maintainer. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: b } = await db().from('bounties').select('*').eq('id', id).single();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (Date.now() / 1000 < Number(b.deadline_unix)) return NextResponse.json({ error: 'deadline not reached' }, { status: 422 });
  const txids = await refundEscrow({ bountyUuid: b.id, oraclePubkeyHex: b.oracle_pubkey, maintainerAddress: b.maintainer_addr, deadlineUnix: Number(b.deadline_unix) });
  for (const txid of txids) await db().from('payments').insert({ bounty_id: id, kind: 'refund', txid, recipient: b.maintainer_addr });
  await db().from('bounties').update({ status: 'refunded' }).eq('id', id);
  await logEvent(id, 'anyone', 'bounty.refunded', { txids });
  return NextResponse.json({ txids });
}
