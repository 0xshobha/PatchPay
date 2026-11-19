import { createClient } from '@supabase/supabase-js';
import { createMockDbClient } from './mockDb';

/** Server-only client: connects to Supabase if configured, or uses local mock store */
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return createMockDbClient() as unknown as ReturnType<typeof createClient>;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logEvent(bountyId: string, actor: string, action: string, data?: unknown) {
  await db().from('events').insert({ bounty_id: bountyId, actor, action, data });
}
