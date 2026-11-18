import type { Metadata } from 'next';
import { Newsreader, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import './globals.css';
import { Providers } from '@/components/Providers';
import { BlazeBanner } from '@/components/BlazeBanner';
import { ConnectBar } from '@/components/ConnectBar';

const serif = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', style: ['normal', 'italic'] });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'PatchPay — bounties that are already paid for',
  description: 'Fund a GitHub issue into a Bitcoin Cash escrow. Merged + verified patches get paid, with a public PatchProof receipt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <BlazeBanner />
          <header className="mx-auto max-w-5xl px-5 pt-6 pb-4 flex items-end justify-between border-b-2 border-ink">
            <Link href="/" className="leading-none">
              <span className="text-3xl font-semibold tracking-tight">PatchPay</span>
              <span className="mono text-xs ml-2 text-ink-2">office of paid patches</span>
            </Link>
            <nav className="mono text-sm flex gap-5 items-center">
              <Link href="/new" className="ink-link">post a bounty</Link>
              <Link href="/how" className="ink-link">how it works</Link>
              <ConnectBar />
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-5 py-10"><Suspense fallback={<p className="mono text-sm">Fetching the ledger…</p>}>{children}</Suspense></main>
          <footer className="mx-auto max-w-5xl px-5 py-8 mono text-xs text-ink-2 border-t rule">
            Escrow contract, oracle pubkey and every PatchProof are public. Network: {process.env.NEXT_PUBLIC_BCH_NETWORK ?? 'chipnet'}.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
