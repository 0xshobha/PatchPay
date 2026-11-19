'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';

const toBch = (sats: number | bigint) => (Number(sats) / 1e8).toFixed(5);

/**
 * Lives inside the escrow receipt. On mount it:
 *  - asks the server to read the escrow address on-chain (POST .../sync) once,
 *    and shows the live balance, and
 *  - renders a QR code of the escrow address (ink on paper) so anyone can top it
 *    up from any BCH wallet.
 */
export function EscrowLive({ bountyId, escrow, amountSats, funded }: { bountyId: string; escrow: string; amountSats: number; funded: boolean }) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const [live, setLive] = useState<{ totalSats: string; funded: boolean } | null>(null);
  const [state, setState] = useState<'loading' | 'done' | 'offline'>('loading');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(escrow, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 5,
      color: { dark: '#17150fff', light: '#f7f4ecff' },
    }).then((url) => { if (!cancelled) setQr(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [escrow]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/bounties/${bountyId}/sync`, { method: 'POST' });
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setLive({ totalSats: String(j.totalSats ?? '0'), funded: Boolean(j.funded) });
          setState('done');
          // If funding status just flipped, refresh the server component once.
          if (Boolean(j.funded) !== funded) router.refresh();
        } else {
          setState('offline');
        }
      } catch {
        if (!cancelled) setState('offline');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bountyId]);

  return (
    <div className="mt-3">
      <div className="flex justify-between items-baseline">
        <span>ON CHAIN NOW</span>
        <span className="font-bold">
          {state === 'loading' && <span className="text-ink-2">reading chain…</span>}
          {state === 'done' && live && <>{toBch(Number(live.totalSats))} BCH{Number(live.totalSats) >= amountSats ? '' : ' (under target)'}</>}
          {state === 'offline' && <span className="text-ink-2">chain offline</span>}
        </span>
      </div>

      {qr && (
        <div className="mt-3 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`BCH QR for ${escrow}`} width={140} height={140} className="border border-ink" style={{ imageRendering: 'pixelated' }} />
          <p className="text-[10px] text-ink-2 mt-1 text-center max-w-[180px] leading-snug">Anyone can top up this bounty from any BCH wallet</p>
        </div>
      )}
    </div>
  );
}
