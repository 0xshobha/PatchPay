import { getRepoOpenSats } from '@/lib/stats';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
// Rough width for 11px Verdana-ish text (same approach as shields.io).
const textWidth = (s: string) => Math.round(s.length * 6.6 + 12);

/** README badge: "PatchPay | 0.003 BCH open". Paper/ink colours, cached 5 minutes. */
export async function GET(_req: Request, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params;
  const { openSats, openCount } = await getRepoOpenSats(owner, repo);
  const left = 'PatchPay';
  const right = openCount === 0 ? 'no open bounties' : `${(openSats / 1e8).toFixed(openSats >= 1e7 ? 3 : 4).replace(/0+$/, '').replace(/\.$/, '')} BCH open`;
  const lw = textWidth(left), rw = textWidth(right), w = lw + rw;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}">
<title>${esc(left)}: ${esc(right)}</title>
<rect width="${lw}" height="20" fill="#17150f"/>
<rect x="${lw}" width="${rw}" height="20" fill="${openCount === 0 ? '#4a463b' : '#0a8f6a'}"/>
<g fill="#f7f4ec" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(left)}</text>
<text x="${lw + rw / 2}" y="14">${esc(right)}</text>
</g>
</svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
    },
  });
}
