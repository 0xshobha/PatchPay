import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, logEvent } from '@/lib/db/supabase';
import { githubLoginFromRequest } from '@/lib/auth';
import { isMaintainer } from '@/lib/github/app';
import { escrowContract } from '@/lib/bch/escrow';
import { oraclePubkeyHex } from '@/lib/bch/oracle';
import { isValidAddress } from '@/lib/bch/keys';
import { NETWORK } from '@/lib/bch/network';

const Body = z.object({
  owner: z.string().min(1), repo: z.string().min(1), issueNumber: z.number().int().positive(),
  issueTitle: z.string().min(1), criteria: z.string().min(10).max(4000),
  amountSats: z.number().int().min(10_000), deadlineDays: z.number().int().min(1).max(90),
  maintainerAddress: z.string(), scout: z.unknown().optional(),
});

export async function POST(req: Request) {
  const login = await githubLoginFromRequest(req);
  if (!login) return NextResponse.json({ error: 'Sign in with GitHub first' }, { status: 401 });
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const b = body.data;
  if (!isValidAddress(b.maintainerAddress)) return NextResponse.json({ error: `Address must be a ${NETWORK} cashaddr` }, { status: 400 });
  if (!(await isMaintainer(b.owner, b.repo, login))) return NextResponse.json({ error: 'Only repo admins/maintainers can post bounties' }, { status: 403 });

  const id = crypto.randomUUID();
  const deadline = Math.floor(Date.now() / 1000) + b.deadlineDays * 86400;
  const oracle = oraclePubkeyHex();
  const escrow = escrowContract({ bountyUuid: id, oraclePubkeyHex: oracle, maintainerAddress: b.maintainerAddress, deadlineUnix: deadline });

  const { error } = await db().from('bounties').insert({
    id, owner: b.owner, repo: b.repo, issue_number: b.issueNumber, issue_title: b.issueTitle,
    criteria: b.criteria, scout: b.scout ?? null, amount_sats: b.amountSats, maintainer_login: login,
    maintainer_addr: b.maintainerAddress, oracle_pubkey: oracle, deadline_unix: deadline,
    escrow_address: escrow.address, network: NETWORK,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  await logEvent(id, login, 'bounty.created', { amountSats: b.amountSats, escrow: escrow.address });
  return NextResponse.json({ id, escrowAddress: escrow.address, deadline });
}

export async function GET() {
  const { data } = await db().from('bounties').select('*').order('created_at', { ascending: false }).limit(50);
  return NextResponse.json(data ?? []);
}
