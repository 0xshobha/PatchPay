'use client';
import { useState } from 'react';

/** Small typewriter-style copy button. Copies `text` to the clipboard and
 *  confirms inline, with a graceful fallback message if the browser blocks it. */
export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('err');
    }
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" className={`btn !py-1 !px-2 !text-[11px] ${className}`} onClick={copy}>
      {state === 'ok' ? 'Copied ✓' : state === 'err' ? 'Press Ctrl+C' : label}
    </button>
  );
}
