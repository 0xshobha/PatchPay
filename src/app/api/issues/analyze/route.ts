import { NextResponse } from 'next/server';
import { z } from 'zod';
import { octokitForRepo } from '@/lib/github/app';
import { scoutIssue } from '@/lib/ai/gemini';
import { githubLoginFromRequest } from '@/lib/auth';
import { githubConfigured, githubErrorMessage, isDemoMode } from '@/lib/mode';

// GitHub API + Gemini Issue Scout (with retries).
export const maxDuration = 120;

const Body = z.object({ owner: z.string().min(1), repo: z.string().min(1), issueNumber: z.number().int().positive() });

export async function POST(req: Request) {
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in with GitHub first' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Paste a full GitHub issue URL, e.g. https://github.com/owner/repo/issues/42' }, { status: 400 });
  const { owner, repo, issueNumber } = p.data;

  if (githubConfigured() && process.env.GEMINI_API_KEY) {
    let issue: { title: string; body?: string | null; html_url: string; pull_request?: unknown };
    let files: string[];
    try {
      const ok = await octokitForRepo(owner, repo);
      ({ data: issue } = await ok.request('GET /repos/{owner}/{repo}/issues/{issue_number}', { owner, repo, issue_number: issueNumber }));
      if (issue.pull_request) return NextResponse.json({ error: `#${issueNumber} is a pull request, not an issue` }, { status: 400 });
      const { data: r } = await ok.request('GET /repos/{owner}/{repo}', { owner, repo });
      const { data: tree } = await ok.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', { owner, repo, tree_sha: r.default_branch, recursive: '1' });
      files = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path!);
    } catch (e) {
      return NextResponse.json({ error: githubErrorMessage(e, owner, repo) }, { status: 502 });
    }
    try {
      const scout = await scoutIssue({ repo: `${owner}/${repo}`, title: issue.title, body: issue.body ?? '', tree: files });
      return NextResponse.json({ issue: { title: issue.title, url: issue.html_url }, scout });
    } catch (e) {
      console.warn('Issue Scout (Gemini) failed:', e);
      return NextResponse.json({ error: 'The AI Issue Scout is busy or unavailable right now. Please press Analyse again in a few seconds.' }, { status: 503 });
    }
  }

  if (!isDemoMode()) {
    return NextResponse.json({ error: 'Issue analysis needs the GitHub App and GEMINI_API_KEY configured on the server' }, { status: 503 });
  }

  // Keyless local demo only.
  const scout = {
    summary: `Issue #${issueNumber} in ${owner}/${repo}: Maintenance requirement for covenant verification and targeted test coverage.`,
    difficulty: 'medium' as const,
    estimatedHours: 4,
    likelyFiles: [`contracts/PatchEscrow.cash`, `src/lib/bch/escrow.ts`, `scripts/escrow.test.mjs`],
    acceptanceCriteria: [
      `Add automated test covering the reported edge case`,
      `Implement minimal, clean fix with zero regressions`,
      `All CI check runs pass green`,
    ],
    agentFriendly: true,
  };
  return NextResponse.json({
    issue: { title: `Resolve issue #${issueNumber} in ${owner}/${repo}`, url: `https://github.com/${owner}/${repo}/issues/${issueNumber}` },
    scout,
  });
}
