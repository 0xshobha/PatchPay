import { NextResponse } from 'next/server';
import { z } from 'zod';
import { octokitForRepo } from '@/lib/github/app';
import { scoutIssue } from '@/lib/ai/gemini';
import { githubLoginFromRequest } from '@/lib/auth';

const Body = z.object({ owner: z.string(), repo: z.string(), issueNumber: z.number().int() });

export async function POST(req: Request) {
  if (!(await githubLoginFromRequest(req))) return NextResponse.json({ error: 'Sign in with GitHub first' }, { status: 401 });
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: 'bad input' }, { status: 400 });
  const { owner, repo, issueNumber } = p.data;
  const ok = await octokitForRepo(owner, repo);
  const { data: issue } = await ok.request('GET /repos/{owner}/{repo}/issues/{issue_number}', { owner, repo, issue_number: issueNumber });
  const { data: r } = await ok.request('GET /repos/{owner}/{repo}', { owner, repo });
  const { data: tree } = await ok.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', { owner, repo, tree_sha: r.default_branch, recursive: '1' });
  const files = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path!);
  const scout = await scoutIssue({ repo: `${owner}/${repo}`, title: issue.title, body: issue.body ?? '', tree: files });
  return NextResponse.json({ issue: { title: issue.title, url: issue.html_url }, scout });
}
