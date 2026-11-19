'use client';
import { useApp } from './Providers';
import { walletReceiveAddress } from '@/lib/bch/funding';

export function ConnectBar() {
  const { wc, openQr, sb, login, setDemoLogin } = useApp();
  const addr = wc.manager && wc.state === 'connected' ? walletReceiveAddress(wc.manager) : null;
  return (
    <span className="flex gap-3 items-center">
      {login ? (
        <button
          className="ink-link"
          onClick={() => {
            if (sb) sb.auth.signOut();
            else setDemoLogin(null);
          }}
          title="Click to sign out"
        >
          @{login}
        </button>
      ) : (
        <button
          className="ink-link"
          onClick={() => {
            if (sb) {
              sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.href } });
            } else {
              setDemoLogin('demo-maintainer');
            }
          }}
        >
          {sb ? 'sign in with github' : 'sign in (demo)'}
        </button>
      )}
      {addr ? (
        <button className="btn !py-1 !px-2 !text-[11px]" onClick={() => wc.disconnect()} title={addr}>
          {wc.walletName ?? 'wallet'} · {addr.split(':')[1].slice(0, 6)}…{addr.slice(-4)}
        </button>
      ) : (
        <button className="btn btn-ink !py-1 !px-2 !text-[11px]" onClick={openQr}>
          {wc.state === 'connecting' || wc.state === 'reconnecting' ? 'waiting for wallet…' : 'connect wallet'}
        </button>
      )}
    </span>
  );
}
