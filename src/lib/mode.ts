/**
 * Demo mode = no Supabase configured (in-memory mock DB). Only then are simulated
 * results (fake txids, simulated AI scout) allowed. With real services configured,
 * every failure must surface as an error — never as a pretend success.
 */
export const isDemoMode = () =>
  !(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const githubConfigured = () =>
  Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);

/** Turn a GitHub API error into a sentence a maintainer can act on. */
export function githubErrorMessage(e: unknown, owner: string, repo: string) {
  const status = (e as { status?: number })?.status;
  if (status === 404) return `PatchPay GitHub App is not installed on ${owner}/${repo} (or the repo/issue does not exist). Install it and try again.`;
  if (status === 403) return `PatchPay GitHub App lacks permission on ${owner}/${repo}. Check the App's repository permissions.`;
  if (status === 401) return 'GitHub App credentials were rejected. Check GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.';
  return `GitHub request failed: ${(e as Error)?.message ?? 'unknown error'}`;
}
