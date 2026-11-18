'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/Providers';
import { fundEscrow, walletReceiveAddress } from '@/lib/bch/funding';
import type { IssueScoutResult } from '@/lib/ai/gemini';

export default function NewBounty() {
  const { authFetch, login, wc, openQr } = useApp();
  const router = useRouter();
  const [issueUrl, setIssueUrl] = useState('');
  const [scout, setScout] = useState<IssueScoutResult | null>(null);
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState('');
  const [bch, setBch] = useState('0.001');
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsed = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  const wallet = wc.manager && wc.state === 'connected' ? walletReceiveAddress(wc.manager) : null;

  async function analyse() {
    if (!parsed) return;
    setBusy('Reading the issue…'); setErr(null);
    const r = await authFetch('/api/issues/analyze', { method: 'POST', body: JSON.stringify({ owner: parsed[1], repo: parsed[2], issueNumber: Number(parsed[3]) }) });
    const j = await r.json(); setBusy(null);
    if (!r.ok) return setErr(j.error ?? 'Could not analyse. Is the PatchPay GitHub App installed on this repo?');
    setScout(j.scout); setTitle(j.issue.title); setCriteria(j.scout.acceptanceCriteria.map((c: string) => `- ${c}`).join('\n'));
  }

  async function createAndFund() {
    if (!parsed || !wallet || !wc.manager) return;
    setErr(null); setBusy('Filing the docket…');
    const sats = Math.round(Number(bch) * 1e8);
    const r = await authFetch('/api/bounties', { method: 'POST', body: JSON.stringify({
      owner: parsed[1], repo: parsed[2], issueNumber: Number(parsed[3]), issueTitle: title, criteria,
      amountSats: sats, deadlineDays: days, maintainerAddress: wallet, scout,
    }) });
    const j = await r.json();
    if (!r.ok) { setBusy(null); return setErr(typeof j.error === 'string' ? j.error : 'Invalid form'); }
    try {
      setBusy('Approve the escrow deposit in your wallet…');
      await fundEscrow(wc.manager, j.escrowAddress, BigInt(sats));
      await fetch(`/api/bounties/${j.id}/sync`, { method: 'POST' });
      router.push(`/b/${j.id}`);
    } catch (e) {
      setBusy(null); setErr(`Docket filed but not funded: ${(e as Error).message}. You can fund it from the docket page.`);
      router.push(`/b/${j.id}`);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="label">Form PP-1</p>
      <h1 className="text-4xl font-medium mb-8">Post a bounty</h1>

      <ol className="space-y-10">
        <li>
          <p className="label mb-2">1 · The issue</p>
          <div className="flex gap-3">
            <input className="field" placeholder="https://github.com/owner/repo/issues/42" value={issueUrl} onChange={(e) => setIssueUrl(e.target.value)} />
            <button className="btn" disabled={!parsed || !login || !!busy} onClick={analyse}>Analyse</button>
          </div>
          {!login && <p className="mono text-xs mt-2 text-del">Sign in with GitHub first. Only repo maintainers can post.</p>}
        </li>

        {scout && (
          <li className="receipt">
            <p className="label">Issue Scout · AI read of the issue</p>
            <p className="mt-2">{scout.summary}</p>
            <div className="mono text-xs mt-3 flex flex-wrap gap-x-6 gap-y-1">
              <span>difficulty: <b>{scout.difficulty}</b></span>
              <span>est. hours: <b>{scout.estimatedHours}</b></span>
              <span>agent-friendly: <b>{scout.agentFriendly ? 'yes' : 'no'}</b></span>
            </div>
            {scout.likelyFiles.length > 0 && <p className="mono text-xs mt-2 text-ink-2">likely files: {scout.likelyFiles.join(', ')}</p>}
          </li>
        )}

        {scout && (
          <li>
            <p className="label mb-2">2 · Acceptance criteria (edit — the AI reviewer checks the PR against this)</p>
            <textarea className="field min-h-36" value={criteria} onChange={(e) => setCriteria(e.target.value)} />
          </li>
        )}

        {scout && (
          <li className="grid grid-cols-2 gap-5">
            <label><span className="label">3 · Reward (BCH)</span><input className="field mt-1" value={bch} onChange={(e) => setBch(e.target.value)} /></label>
            <label><span className="label">Refund after (days)</span><input className="field mt-1" type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          </li>
        )}

        {scout && (
          <li>
            <p className="label mb-2">4 · Lock it</p>
            {wallet ? (
              <p className="mono text-xs mb-3">Refunds go to your connected wallet: <span className="break-all">{wallet}</span></p>
            ) : (
              <button className="btn mb-3" onClick={openQr}>Connect wallet (WizardConnect)</button>
            )}
            <button className="btn btn-ink" disabled={!wallet || !!busy} onClick={createAndFund}>File docket &amp; fund escrow</button>
          </li>
        )}
      </ol>

      {busy && <p className="mono text-sm mt-6">{busy}</p>}
      {err && <p className="mono text-sm mt-6 text-del">{err}</p>}
    </div>
  );
}
