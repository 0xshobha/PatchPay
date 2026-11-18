'use client';
import { useState } from 'react';

/** Re-hashes the proof in the visitor's own browser (WebCrypto), so nobody has to trust our server. */
export function VerifyInBrowser({ json, expected }: { json: string; expected: string }) {
  const [res, setRes] = useState<string | null>(null);
  return (
    <div className="mt-3 mono text-xs">
      <button className="btn !text-[11px]" onClick={async () => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
        const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
        setRes(hex === expected ? `✓ matches — computed locally: ${hex.slice(0, 16)}…` : `✗ mismatch: ${hex}`);
      }}>Verify in my browser</button>
      {res && <span className="ml-3">{res}</span>}
    </div>
  );
}
