'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/Providers';
import { fundEscrow } from '@/lib/bch/funding';
import { EXPLORER_TX } from '@/lib/bch/network';

const PRESETS = ['0.0005', '0.001', '0.005'];
const MIN_SATS = 5_000; // keeps every backer UTXO comfortably spendable by the release path
const MAX_SATS = 10 * 1e8;

const toSats = (bch: string) => (/^\d*\.?\d{0,8}$/.test(bch.trim()) && bch.trim() !== '' && bch.trim() !== '.' ? Math.round(Number(bch) * 1e8) : NaN);

/** Tells EscrowLive (and anyone else listening) that a fresh sync result is available. */
export const announceSync = (data: unknown) => window.dispatchEvent(new CustomEvent('patchpay:synced', { detail: data }));

/**
 * No-login backing: anyone with a WizardConnect wallet can add BCH to this bounty's
 * escrow in two clicks. Without a wallet connected, the button opens the QR dialog.
 */
export function BackBounty({ bountyId, escrow }: { bountyId: string; escrow: string }) {
  const { wc, openQr } = useApp();
  const router = useRouter();
  const [amount, setAmount] = useState('0.001');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);

  const connected = Boolean(wc.manager && wc.state === 'connected');
  const sats = toSats(amount);
  const valid = Number.isFinite(sats) && sats >= MIN_SATS && sats <= MAX_SATS;

  async function sync() {
    const r = await fetch(`/api/bounties/${bountyId}/sync`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (r.ok) announceSync(j);
    router.refresh();
    return r.ok;
  }

  async function back() {
    setErr(null);
    if (!connected) { openQr(); return; }
    if (!valid) { setErr(`Enter between ${MIN_SATS / 1e8} and ${MAX_SATS / 1e8} BCH`); return; }
    try {
      setBusy('Approve the payment in your wallet…');
      const res = await fundEscrow(wc.manager!, escrow, BigInt(sats));
      setTxid(res.txid);
      setBusy('Reading the escrow on-chain…');
      await sync();
    } catch (e) {
      setErr((e as Error).message || 'The wallet cancelled or failed to send.');
    } finally {
      setBusy(null);
    }
  }

  async function checkChain() {
    setErr(null);
    setBusy('Reading the escrow on-chain…');
    try {
      if (!(await sync())) setErr('Could not reach the BCH network. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  }

  if (txid) {
    return (
      <div id="back" className="receipt mono text-[13px] relative">
        <div className="flex justify-between"><span>BACKED</span><span className="font-bold">{amount} BCH</span></div>
        <div className="border-t border-dashed rule my-2" />
        <p className="text-xs">Your BCH is now locked for whoever fixes this issue.</p>
        <a className="ink-link text-xs break-all block mt-2" href={EXPLORER_TX(txid)} target="_blank" rel="noreferrer">tx {txid}</a>
        <button className="btn !text-[11px] mt-4" onClick={() => { setTxid(null); setAmount('0.001'); }}>Back again</button>
        <span className="stamp text-bch absolute right-4 -bottom-2">thank you</span>
      </div>
    );
  }

  return (
    <div id="back" className="receipt mono text-[13px]">
      <p className="label">Back this bounty</p>
      <p className="text-xs mt-1 text-ink-2 leading-snug">
        No sign-in needed. Your BCH joins the escrow: it pays whoever fixes the issue, or returns to the maintainer after the deadline.
      </p>

      <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Amount presets">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`btn !py-1 !px-2 !text-[11px] ${amount === p ? 'btn-ink' : ''}`} aria-pressed={amount === p} onClick={() => setAmount(p)}>
            {p}
          </button>
        ))}
      </div>
      <label className="block mt-3">
        <span className="label">Custom (BCH)</span>
        <input className="field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!valid} />
      </label>
      {!valid && amount.trim() !== '' && <p className="text-[11px] text-del mt-1">Min {MIN_SATS / 1e8} BCH, max {MAX_SATS / 1e8} BCH.</p>}

      <button className="btn btn-ink w-full mt-4" disabled={!!busy || (connected && !valid)} onClick={back}>
        {busy ? 'Working…' : connected ? `Lock ${valid ? amount : '…'} BCH` : 'Connect wallet to back'}
      </button>
      {!connected && (
        <p className="text-[11px] text-ink-2 mt-2 leading-snug">
          Or send any amount to the escrow address / QR above from any BCH wallet, then{' '}
          <button type="button" className="ink-link" disabled={!!busy} onClick={checkChain}>check the chain</button>.
        </p>
      )}
      {busy && <p className="text-xs mt-2">{busy}</p>}
      {err && <p className="text-xs mt-2 text-del">{err}</p>}
    </div>
  );
}
