type Step = { key: string; label: string; done: boolean; note?: string };

/** Funded → PR opened → Merged → Proof → Paid, with the current step highlighted. */
export function StatusTimeline({ status, prOpened, merged, hasProof, paid }: { status: string; prOpened: boolean; merged: boolean; hasProof: boolean; paid: boolean }) {
  const steps: Step[] = [
    { key: 'funded', label: 'Funded', done: status !== 'awaiting_funds' },
    { key: 'pr', label: 'PR opened', done: prOpened || merged || hasProof || paid },
    { key: 'merged', label: 'Merged', done: merged || paid },
    { key: 'proof', label: 'Proof', done: hasProof || paid },
    { key: 'paid', label: 'Paid', done: paid },
  ];
  const refunded = status === 'refunded';
  const current = refunded ? -1 : steps.findIndex((s) => !s.done);

  return (
    <nav aria-label="Bounty progress" className="mt-6">
      <ol className="flex flex-wrap items-center gap-y-2 mono text-[11px] uppercase tracking-wider">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li key={s.key} className="flex items-center" aria-current={isCurrent ? 'step' : undefined}>
              {i > 0 && <span aria-hidden="true" className={`w-3 sm:w-10 border-t-2 ${s.done ? 'border-bch' : 'border-dashed border-rule'}`} />}
              <span
                className={[
                  'px-2 py-1 border-2 whitespace-nowrap',
                  s.done ? 'border-bch bg-bch text-[#f7f4ec]' : isCurrent ? 'border-carbon bg-carbon-wash text-carbon shadow-[2px_2px_0_var(--color-carbon)]' : 'border-rule text-ink-2',
                ].join(' ')}
              >
                {s.done ? '✓ ' : isCurrent ? '▸ ' : ''}{s.label}
              </span>
            </li>
          );
        })}
        {refunded && <li className="ml-3 stamp text-ink-2 normal-case">refunded</li>}
      </ol>
    </nav>
  );
}
