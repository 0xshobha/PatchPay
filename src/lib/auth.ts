import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * The browser signs in with Supabase Auth (GitHub provider) and sends its access token
 * as `Authorization: Bearer <token>`. We resolve it to a GitHub login here.
 */
export async function githubLoginFromRequest(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  // Support local demo token when Supabase is not configured
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (token === 'demo-token' || token.startsWith('demo-')) {
      const user = token.replace(/^demo-/, '');
      return user || 'demo-maintainer';
    }
    return 'demo-maintainer';
  }

  try {
    const sb = createClient(url, key);
    const { data } = await sb.auth.getUser(token);
    const meta = data.user?.user_metadata as { user_name?: string } | undefined;
    return meta?.user_name ?? null;
  } catch {
    return null;
  }
}
