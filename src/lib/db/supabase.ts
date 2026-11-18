import { createClient } from '@supabase/supabase-js';

/** Server-only client with the service role key — never import this in a client component. */
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logEvent(bountyId: string, actor: string, action: string, data?: unknown) {
  await db().from('events').insert({ bounty_id: bountyId, actor, action, data });
}
