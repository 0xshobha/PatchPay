import 'server-only';
import { octokitForRepo, parsePrMeta } from './app';
import { sha256Hex, type PatchProof } from '../patchproof/proof';
import { reviewDiff } from '../ai/gemini';

/** Pull everything PatchProof needs straight from GitHub's API (no self-reported data). */
export async function buildPatchProof(args: {
  bounty: { id: string; owner: string; repo: string; issue: number; amountSats: bigint; escrow: string; criteria: string };
  pr: number;
}): Promise<{ proof: PatchProof; prMeta: ReturnType<typeof parsePrMeta> }> {
  const { owner, repo } = args.bounty;
  const ok = await octokitForRepo(owner, repo);
  const { data: pr } = await ok.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner, repo, pull_number: args.pr });
  const diff = (await ok.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner, repo, pull_number: args.pr, mediaType: { format: 'diff' },
  })).data as unknown as string;
  const { data: runs } = await ok.request('GET /repos/{owner}/{repo}/commits/{ref}/check-runs', { owner, repo, ref: pr.head.sha });
  const prMeta = parsePrMeta(pr.body);

  const review = await reviewDiff({ criteria: args.bounty.criteria, diff: diff.slice(0, 60_000), title: pr.title });

  const proof: PatchProof = {
    v: 1,
    bounty: { id: args.bounty.id, repo: `${owner}/${repo}`, issue: args.bounty.issue, amountSats: args.bounty.amountSats.toString(), escrow: args.bounty.escrow },
    patch: {
      pr: pr.number, headSha: pr.head.sha, mergeSha: pr.merge_commit_sha, mergedBy: pr.merged_by?.login ?? null,
      diffSha256: sha256Hex(diff), filesChanged: pr.changed_files, additions: pr.additions, deletions: pr.deletions,
    },
    checks: runs.check_runs.map((r) => ({ name: r.name, conclusion: r.conclusion, url: r.html_url ?? '' })),
    review,
    contributor: { github: pr.user.login, kind: prMeta.agent || pr.user.type === 'Bot' ? 'agent' : 'human', payoutAddress: prMeta.addr ?? '' },
    approvedBy: null,
    createdAt: new Date().toISOString(),
  };
  return { proof, prMeta };
}

export async function commentOnPr(owner: string, repo: string, pr: number, body: string) {
  const ok = await octokitForRepo(owner, repo);
  await ok.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', { owner, repo, issue_number: pr, body });
}
