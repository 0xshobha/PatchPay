'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useWizardConnect, WizardConnectQRDialog, type UseWizardConnectResult } from '@wizardconnect/react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { NETWORK } from '@/lib/bch/network';

type Ctx = {
  wc: UseWizardConnectResult;
  openQr: () => void;
  sb: SupabaseClient | null;
  session: Session | null;
  login: string | null;
  setDemoLogin: (login: string | null) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside Providers');
  return c;
};

export function Providers({ children }: { children: React.ReactNode }) {
  // The wallet fetches this icon itself, so it must be an absolute URL.
  const wc = useWizardConnect({ dappName: 'PatchPay', dappIcon: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/icon.png` });
  const [show, setShow] = useState(false);
  const [demoLogin, setDemoLoginState] = useState<string | null>(null);

  const sb = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    return createClient(url, anon);
  }, []);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (sb) {
      sb.auth.getSession().then(({ data }) => setSession(data?.session ?? null));
      const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
      return () => data.subscription.unsubscribe();
    } else if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('patchpay_demo_login');
      // Sync the demo login from localStorage once, after mount (avoids a hydration mismatch).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDemoLoginState(saved ?? 'demo-maintainer'); // default signed in for instant local testing!
    }
  }, [sb]);

  const setDemoLogin = (l: string | null) => {
    setDemoLoginState(l);
    if (typeof window !== 'undefined') {
      if (l) localStorage.setItem('patchpay_demo_login', l);
      else localStorage.removeItem('patchpay_demo_login');
    }
  };

  const login = (session?.user.user_metadata as { user_name?: string } | undefined)?.user_name ?? demoLogin ?? null;

  const authFetch = (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
        ...(session
          ? { authorization: `Bearer ${session.access_token}` }
          : login
          ? { authorization: `Bearer demo-${login}` }
          : {}),
      },
    });

  const openQr = () => { wc.connect(); setShow(true); };

  return (
    <AppCtx.Provider value={{ wc, openQr, sb, session, login, setDemoLogin, authFetch }}>
      {children}
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={show && wc.state !== 'connected'} onClose={() => setShow(false)} uri={wc.uri} qrUri={wc.qrUri}
          title="Connect a BCH wallet"
          subtitle={`Scan with the Paytaca mobile app, or copy the code into Cashonize (v0.9+) or Selene. Browser extensions can't scan. Wallet must be on ${NETWORK}.`}
          theme={{
            backdropColor: 'rgba(23,21,15,.55)', dialogBackground: '#f7f4ec', headerBackground: '#f7f4ec',
            titleColor: '#17150f', subtitleColor: '#4a463b', qrForeground: '#17150f', qrBackground: '#f7f4ec',
            uriRowBackground: '#ece7db', uriTextColor: '#4a463b', borderColor: '#17150f',
            closeButtonColor: '#17150f', copyButtonColor: '#2b3a67',
          }}
        />
      )}
    </AppCtx.Provider>
  );
}
