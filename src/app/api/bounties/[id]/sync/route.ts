import { NextResponse } from 'next/server';
import { db, logEvent } from '@/lib/db/supabase';
import { escrowBalance } from '@/lib/bch/escrow';
import { isDemoMode } from '@/lib/mode';

// Electrum read of the escrow.
export const maxDuration = 30;

/** Reads the escrow address on-chain; flips the bounty to `open` once funded. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { data: b } = await db().from('bounties').select('*').eq('id', id).maybeSingle();
  if (!b) return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });

  try {
    const bal = await escrowBalance({
      bountyUuid: b.id,
      oraclePubkeyHex: b.oracle_pubkey,
      maintainerAddress: b.maintainer_addr,
      deadlineUnix: Number(b.deadline_unix),
    });
    const funded = bal.total >= BigInt(b.amount_sats);

    // Record every escrow UTXO as a funding payment (maintainer + any backers),
    // whatever the bounty status. Idempotent on (txid, kind).
    const { data: known } = await db().from('payments').select('txid,amount_sats').eq('bounty_id', id).eq('kind', 'fund');
    const knownRows = (known as { txid: string; amount_sats: number | null }[] | null) ?? [];
    const seen = new Set(knownRows.map((p) => p.txid));
    const fresh = bal.utxos.filter((u) => !u.token && !seen.has(u.txid));
    for (const u of fresh) {
      await db().from('payments').upsert(
        { bounty_id: id, kind: 'fund', txid: u.txid, amount_sats: Number(u.satoshis) },
        { onConflict: 'txid,kind' },
      );
      seen.add(u.txid);
      if (b.status !== 'awaiting_funds') await logEvent(id, 'chain', 'bounty.backed', { txid: u.txid, sats: u.satoshis.toString() });
    }
    if (funded && b.status === 'awaiting_funds') {
      await db().from('bounties').update({ status: 'open' }).eq('id', id);
      await logEvent(id, 'chain', 'bounty.funded', { total: bal.total.toString() });
    }
    const recordedSats = knownRows.reduce((s, p) => s + (Number(p.amount_sats) || 0), 0) + fresh.reduce((s, u) => s + Number(u.satoshis), 0);
    return NextResponse.json({
      address: bal.address,
      totalSats: bal.total.toString(),
      funded,
      backers: seen.size,
      recordedSats: String(recordedSats),
      newTxids: fresh.map((u) => u.txid),
    });
  } catch (err) {
    console.warn('Electrum query error during sync:', err);
    if (!isDemoMode()) {
      return NextResponse.json({ error: 'Could not reach the BCH network to read the escrow. Try again in a moment.' }, { status: 502 });
    }
    // Keyless local demo only: report the stored status.
    const isFunded = b.status !== 'awaiting_funds';
    return NextResponse.json({
      address: b.escrow_address,
      totalSats: isFunded ? b.amount_sats.toString() : '0',
      funded: isFunded,
      note: 'Electrum network offline or unconfirmed on chain',
    });
  }
}
