import { NextResponse } from 'next/server';
import { db, logEvent } from '@/lib/db/supabase';
import { escrowBalance } from '@/lib/bch/escrow';

/** Reads the escrow address on-chain; flips the bounty to `open` once funded. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: b } = await db().from('bounties').select('*').eq('id', id).single();
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });

  try {
    const bal = await escrowBalance({
      bountyUuid: b.id,
      oraclePubkeyHex: b.oracle_pubkey,
      maintainerAddress: b.maintainer_addr,
      deadlineUnix: Number(b.deadline_unix),
    });
    const funded = bal.total >= BigInt(b.amount_sats);
    if (funded && b.status === 'awaiting_funds') {
      await db().from('bounties').update({ status: 'open' }).eq('id', id);
      for (const u of bal.utxos) {
        await db().from('payments').upsert(
          { bounty_id: id, kind: 'fund', txid: u.txid, amount_sats: Number(u.satoshis) },
          { onConflict: 'txid,kind' },
        );
      }
      await logEvent(id, 'chain', 'bounty.funded', { total: bal.total.toString() });
    }
    return NextResponse.json({ address: bal.address, totalSats: bal.total.toString(), funded });
  } catch (err) {
    console.warn('Electrum query error during sync:', err);
    // In local demo or offline mode, if already funded or simulated
    const isFunded = b.status !== 'awaiting_funds';
    return NextResponse.json({
      address: b.escrow_address,
      totalSats: isFunded ? b.amount_sats.toString() : '0',
      funded: isFunded,
      note: 'Electrum network offline or unconfirmed on chain',
    });
  }
}
