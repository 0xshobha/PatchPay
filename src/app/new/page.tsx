'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/Providers';
import { fundEscrow, walletReceiveAddress } from '@/lib/bch/funding';
import type { IssueScoutResult } from '@/lib/ai/gemini';
import { CopyButton } from '@/components/CopyButton';
import { MINIMAL_CI_YML } from '@/lib/github/ciTemplate';

export default function NewBounty() {
  const { authFetch, login, wc, openQr } = useApp();
  const router = useRouter();
  const [issueUrl, setIssueUrl] = useState('');
  const [customWallet, setCustomWallet] = useState<string | null>(null);
  const [scout, setScout] = useState<IssueScoutResult | null>(null);
  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState('');
  const [bch, setBch] = useState('0.001');
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [noCi, setNoCi] = useState(false);

  const parsed = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  const connectedWallet = wc.manager && wc.state === 'connected' ? walletReceiveAddress(wc.manager) : null;
  const wallet = connectedWallet || customWallet;

  async function analyse() {
    if (!parsed) return;
    setBusy('Reading the issue…'); setErr(null);
    const r = await authFetch('/api/issues/analyze', {
      method: 'POST',
      body: JSON.stringify({ owner: parsed[1], repo: parsed[2], issueNumber: Number(parsed[3]) }),
    });
    const j = await r.json();
    setBusy(null);
    if (!r.ok) return setErr(j.error ?? 'Could not analyse. Is the PatchPay GitHub App installed on this repo?');
    setScout(j.scout);
    setNoCi(j.ci?.hasWorkflows === false);
    setTitle(j.issue.title);
    setCriteria(j.scout.acceptanceCriteria.map((c: string) => `- ${c}`).join('\n'));
  }

  async function createAndFund() {
    if (!parsed || !wallet) return;
    setErr(null); setBusy('Filing the docket…');
    const sats = Math.round(Number(bch) * 1e8);
    const r = await authFetch('/api/bounties', {
      method: 'POST',
      body: JSON.stringify({
        owner: parsed[1],
        repo: parsed[2],
        issueNumber: Number(parsed[3]),
        issueTitle: title,
        criteria,
        amountSats: sats,
        deadlineDays: days,
        maintainerAddress: wallet,
        scout,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      setBusy(null);
      return setErr(typeof j.error === 'string' ? j.error : 'Invalid form');
    }
    try {
      if (wc.manager && wc.state === 'connected') {
        setBusy('Approve the escrow deposit in your wallet…');
        await fundEscrow(wc.manager, j.escrowAddress, BigInt(sats));
        await fetch(`/api/bounties/${j.id}/sync`, { method: 'POST' });
      }
      router.push(`/b/${j.id}`);
    } catch (e) {
      setBusy(null);
      setErr(`Docket filed: ${(e as Error).message}. You can fund it from the docket page.`);
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
            <input
              className="field"
              placeholder="https://github.com/owner/repo/issues/42"
              value={issueUrl}
              onChange={(e) => setIssueUrl(e.target.value)}
            />
            <button className="btn" disabled={!parsed || !login || !!busy} onClick={analyse}>
              Analyse
            </button>
          </div>
          <div className="mt-2 flex gap-3 items-center">
            <button
              type="button"
              className="mono text-xs ink-link"
              onClick={() => {
                setIssueUrl('https://github.com/cashscript/cashscript/issues/104');
              }}
            >
              Fill sample issue (cashscript#104)
            </button>
          </div>
          {!login && <p className="mono text-xs mt-2 text-del">Sign in first. Only repo maintainers can post.</p>}
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
            {scout.likelyFiles.length > 0 && (
              <p className="mono text-xs mt-2 text-ink-2">likely files: {scout.likelyFiles.join(', ')}</p>
            )}
          </li>
        )}

        {scout && noCi && parsed && (
          <li className="receipt mono text-xs" role="alert">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="label text-del">No CI in {parsed[1]}/{parsed[2]}</p>
              <CopyButton text={MINIMAL_CI_YML} label="Copy ci.yml" />
            </div>
            <p className="mt-2 text-del font-bold">Payouts need at least one green CI check — this repo has no workflow.</p>
            <p className="mt-1">Commit this as <b>.github/workflows/ci.yml</b> (replace the echo with your real tests). You can still post the bounty now.</p>
            <pre className="mt-2 bg-paper-2 p-2 whitespace-pre-wrap break-all select-all">{MINIMAL_CI_YML}</pre>
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
            <label>
              <span className="label">3 · Reward (BCH)</span>
              <input className="field mt-1" value={bch} onChange={(e) => setBch(e.target.value)} />
            </label>
            <label>
              <span className="label">Refund after (days)</span>
              <input
                className="field mt-1"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
          </li>
        )}

        {scout && (
          <li>
            <p className="label mb-2">4 · Lock it</p>
            {wallet ? (
              <div className="mono text-xs mb-3">
                <p>Refunds go to maintainer wallet: <span className="break-all font-bold">{wallet}</span></p>
                {customWallet && !connectedWallet && (
                  <button type="button" className="ink-link text-[11px] mt-1" onClick={() => setCustomWallet(null)}>
                    Use wallet connect instead
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-3 mb-3 flex-wrap">
                <button className="btn" onClick={openQr}>Connect wallet (WizardConnect)</button>
                <button
                  type="button"
                  className="btn !text-[11px]"
                  onClick={() => setCustomWallet('bchtest:qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa')}
                >
                  Use test chipnet address
                </button>
              </div>
            )}
            <button className="btn btn-ink" disabled={!wallet || !!busy} onClick={createAndFund}>
              File docket &amp; fund escrow
            </button>
          </li>
        )}
      </ol>

      {busy && <p className="mono text-sm mt-6">{busy}</p>}
      {err && <p className="mono text-sm mt-6 text-del">{err}</p>}
    </div>
  );
}
