// Required by BCH BLAZE 2026 Mainnet Track: top-of-page banner on the home page with
// the Widget Factory presentation link, the code link, and a CashTokens (token-aware) address
// for EMBER2026 community-choice votes, plus a statement about pre-existing work.
export function BlazeBanner() {
  const deck = process.env.NEXT_PUBLIC_BLAZE_DECK_URL;
  const repo = process.env.NEXT_PUBLIC_REPO_URL;
  const ember = process.env.NEXT_PUBLIC_EMBER_ADDRESS;
  return (
    <div className="bg-ink text-paper mono text-[12px] leading-relaxed">
      <div className="mx-auto max-w-5xl px-5 py-2 flex flex-wrap gap-x-5 gap-y-1">
        <span className="font-bold text-bch-bright">BCH BLAZE 2026 · Mainnet Track</span>
        {deck && <a href={deck} className="underline">Presentation (Widget Factory)</a>}
        {repo && <a href={repo} className="underline">Source code</a>}
        {ember && <span>EMBER2026 votes → <span className="select-all break-all">{ember}</span></span>}
        <span className="opacity-75">All code written during BLAZE (from 14 Nov 2026). No pre-existing project.</span>
      </div>
    </div>
  );
}
