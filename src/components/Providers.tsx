'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useWizardConnect, WizardConnectQRDialog, type UseWizardConnectResult } from '@wizardconnect/react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

type Ctx = {
  wc: UseWizardConnectResult;
  openQr: () => void;
  sb: SupabaseClient;
  session: Session | null;
  login: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside Providers');
  return c;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const wc = useWizardConnect({ dappName: 'PatchPay', dappIcon: '/icon.png' });
  const [show, setShow] = useState(false);
  const sb = useMemo(() => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), []);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  const login = (session?.user.user_metadata as { user_name?: string } | undefined)?.user_name ?? null;
  const authFetch = (url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}), ...(session ? { authorization: `Bearer ${session.access_token}` } : {}) } });

  const openQr = () => { wc.connect(); setShow(true); };

  return (
    <AppCtx.Provider value={{ wc, openQr, sb, session, login, authFetch }}>
      {children}
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={show && wc.state !== 'connected'} onClose={() => setShow(false)} uri={wc.uri} qrUri={wc.qrUri}
          title="Connect a BCH wallet" subtitle="Scan with Paytaca, Cashonize or Selene (WizardConnect)"
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
