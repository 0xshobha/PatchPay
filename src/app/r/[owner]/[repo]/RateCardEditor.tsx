'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/Providers';
import { CATEGORIES, type Category } from '@/lib/categories';

const toSats = (bch: string) => (/^\d*\.?\d{0,8}$/.test(bch.trim()) && bch.trim() !== '' && bch.trim() !== '.' ? Math.round(Number(bch) * 1e8) : NaN);

/** Maintainer-only editor; the server re-checks maintainer rights on save. */
export function RateCardEditor({ owner, repo, initial }: { owner: string; repo: string; initial: Record<Category, number> }) {
  const { authFetch, login } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<Category, string>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c, String(initial[c] / 1e8)])) as Record<Category, string>,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!login) return <p className="mono text-xs text-ink-2 mt-3">Maintainers: sign in with GitHub to edit this rate card.</p>;
  if (!open) return <button className="btn !text-[11px] mt-4" onClick={() => setOpen(true)}>Edit rate card</button>;

  const invalid = CATEGORIES.filter((c) => { const s = toSats(vals[c]); return !Number.isFinite(s) || s < 10_000 || s > 10 * 1e8; });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const rates = Object.fromEntries(CATEGORIES.map((c) => [c, toSats(vals[c])]));
      const r = await authFetch('/api/rate-cards', { method: 'POST', body: JSON.stringify({ owner, repo, rates }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setMsg({ ok: true, text: 'Saved.' }); setOpen(false); router.refresh(); }
      else setMsg({ ok: false, text: typeof j.error === 'string' ? j.error : 'Could not save the rate card.' });
    } catch {
      setMsg({ ok: false, text: 'Network error — check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="receipt mono text-[13px] mt-4">
      <p className="label">Edit rate card (BCH)</p>
      <div className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 mt-3 items-center">
        {CATEGORIES.map((c) => (
          <label key={c} className="contents">
            <span>{c}</span>
            <input className="field" inputMode="decimal" value={vals[c]} aria-invalid={invalid.includes(c)} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} />
          </label>
        ))}
      </div>
      {invalid.length > 0 && <p className="text-[11px] text-del mt-2">Each rate must be between 0.0001 and 10 BCH ({invalid.join(', ')}).</p>}
      <div className="flex flex-wrap gap-3 mt-4">
        <button className="btn btn-ink" disabled={busy || invalid.length > 0} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p className={`text-xs mt-2 ${msg.ok ? 'text-bch' : 'text-del'}`}>{msg.text}</p>}
    </div>
  );
}
