import { NextResponse } from 'next/server';
import { binToHex, sha256, utf8ToBin } from '@bitauth/libauth';
import { db, logEvent } from '@/lib/db/supabase';
import { refundEscrow } from '@/lib/bch/escrow';
import { isDemoMode } from '@/lib/mode';

/** Permissionless: after the deadline anyone may trigger it; the contract only pays the maintainer. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: b } = await db().from('bounties').select('*').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
  if (['paid', 'refunded'].includes(b.status)) return NextResponse.json({ error: `This bounty is already ${b.status}` }, { status: 409 });
  if (Date.now() / 1000 < Number(b.deadline_unix)) return NextResponse.json({ error: 'The refund deadline has not been reached yet' }, { status: 422 });

  let txids: string[] = [];
  try {
    txids = await refundEscrow({ bountyUuid: b.id, oraclePubkeyHex: b.oracle_pubkey, maintainerAddress: b.maintainer_addr, deadlineUnix: Number(b.deadline_unix) });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    if (!isDemoMode()) {
      // A just-passed deadline can still be ahead of the chain's median time (~1h lag).
      const hint = /non-final|locktime/i.test(message) ? ' The network clock lags about an hour behind — try again later.' : '';
      await logEvent(id, 'anyone', 'refund.failed', { message });
      return NextResponse.json({ error: `Refund could not be broadcast: ${message}.${hint}` }, { status: 502 });
    }
    console.warn('Demo mode: simulating refund broadcast:', err);
    txids = [binToHex(sha256.hash(utf8ToBin('refund-' + id + '-' + Date.now())))];
  }
  if (!txids.length) return NextResponse.json({ error: 'Nothing to refund — the escrow holds only dust' }, { status: 422 });

  for (const txid of txids) {
    await db().from('payments').insert({ bounty_id: id, kind: 'refund', txid, recipient: b.maintainer_addr });
  }
  await db().from('bounties').update({ status: 'refunded' }).eq('id', id);
  await logEvent(id, 'anyone', 'bounty.refunded', { txids });
  return NextResponse.json({ txids });
}
