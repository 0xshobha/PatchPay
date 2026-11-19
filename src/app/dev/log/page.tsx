import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db/supabase';

type EventRow = {
  id: number | string;
  bounty_id: string | null;
  actor: string;
  action: string;
  data: unknown;
  created_at: string;
};

// A raw tail of the `events` audit table for debugging. Hidden in production
// unless explicitly opted into with NEXT_PUBLIC_SHOW_DEV_LOG=1.
export default async function DevLog() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SHOW_DEV_LOG !== '1') {
    notFound();
  }
  await connection();

  const { data } = await db().from('events').select('*').order('created_at', { ascending: false }).limit(50);
  const events = (data as EventRow[] | null) ?? [];

  return (
    <div className="max-w-3xl">
      <p className="label">Developer tools</p>
      <h1 className="text-4xl font-medium mb-2">Event log</h1>
      <p className="text-ink-2 mono text-xs mb-8">Last {events.length} rows of the <code>events</code> audit table, newest first.</p>

      {events.length === 0 ? (
        <p className="py-10 mono text-sm text-ink-2">No events recorded yet.</p>
      ) : (
        <ul className="space-y-4">
          {events.map((e) => (
            <li key={String(e.id)} className="border-t rule pt-3">
              <div className="mono text-xs flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-ink-2">{e.created_at?.replace('T', ' ').slice(0, 19)}</span>
                <span className="font-bold">{e.actor}</span>
                <span className="text-carbon">{e.action}</span>
                {e.bounty_id && <span className="text-ink-2 break-all">bounty {String(e.bounty_id).slice(0, 8)}…</span>}
              </div>
              {e.data != null && (
                <pre className="mono text-[11px] whitespace-pre-wrap break-all mt-2 bg-paper-2 p-2">{JSON.stringify(e.data, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
