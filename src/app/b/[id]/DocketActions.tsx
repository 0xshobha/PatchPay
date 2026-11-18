'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/Providers';
import { fundEscrow } from '@/lib/bch/funding';

type Props =
  | { kind: 'approve'; bountyId: string; proofId: string; disabled: boolean }
  | { kind: 'sync'; bountyId: string; escrow: string; amountSats: number; status: string; pastDeadline: boolean };

export function DocketActions(props: Props) {
  const { authFetch, wc, openQr } = useApp();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  const call = async (url: string, label: string) => {
    setMsg(label);
    const r = await authFetch(url, { method: 'POST' });
    const j = await r.json();
    setMsg(r.ok ? 'Done.' : j.error ?? 'Failed');
    router.refresh();
  };

  if (props.kind === 'approve') {
    return (
      <div className="mt-3">
        <button className="btn btn-ink !text-[11px]" disabled={props.disabled} onClick={() => call(`/api/proofs/${props.proofId}/approve`, 'Signing release & broadcasting…')}>
          Approve &amp; pay in BCH
        </button>
        {msg && <span className="mono text-xs ml-3">{msg}</span>}
      </div>
    );
  }

  const { pastDeadline } = props;
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {props.status === 'awaiting_funds' && (
        wc.manager && wc.state === 'connected' ? (
          <button className="btn btn-ink" onClick={async () => {
            try { setMsg('Approve in your wallet…'); await fundEscrow(wc.manager!, props.escrow, BigInt(props.amountSats)); await call(`/api/bounties/${props.bountyId}/sync`, 'Checking chain…'); }
            catch (e) { setMsg((e as Error).message); }
          }}>Fund escrow</button>
        ) : <button className="btn" onClick={openQr}>Connect wallet to fund</button>
      )}
      <button className="btn !text-[11px]" onClick={() => call(`/api/bounties/${props.bountyId}/sync`, 'Reading chain…')}>Re-check chain</button>
      {pastDeadline && !['paid', 'refunded'].includes(props.status) && (
        <button className="btn !text-[11px]" onClick={() => call(`/api/bounties/${props.bountyId}/refund`, 'Refunding…')}>Trigger refund</button>
      )}
      {msg && <p className="mono text-xs w-full">{msg}</p>}
    </div>
  );
}
