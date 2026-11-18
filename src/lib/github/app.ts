import 'server-only';
import { App } from 'octokit';

let app: App | null = null;
export function githubApp() {
  if (!app) {
    app = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET! },
    });
  }
  return app;
}

export async function octokitForRepo(owner: string, repo: string) {
  const a = githubApp();
  const { data } = await a.octokit.request('GET /repos/{owner}/{repo}/installation', { owner, repo });
  return a.getInstallationOctokit(data.id);
}

/** Only repo admins / maintainers may create or approve bounties. */
export async function isMaintainer(owner: string, repo: string, username: string) {
  const ok = await octokitForRepo(owner, repo);
  const { data } = await ok.request('GET /repos/{owner}/{repo}/collaborators/{username}/permission', { owner, repo, username });
  return ['admin', 'maintain'].includes(data.permission) || data.role_name === 'maintain';
}

/** PR body line: `PatchPay-Address: bitcoincash:q...` and optional `PatchPay-Agent: true` */
export function parsePrMeta(body: string | null) {
  const addr = body?.match(/PatchPay-Address:\s*((?:bitcoincash|bchtest):[a-z0-9]+)/i)?.[1] ?? null;
  const agent = /PatchPay-Agent:\s*true/i.test(body ?? '');
  const issue = Number(body?.match(/(?:fixes|closes|resolves)\s+#(\d+)/i)?.[1] ?? NaN);
  return { addr, agent, issue: Number.isFinite(issue) ? issue : null };
}
