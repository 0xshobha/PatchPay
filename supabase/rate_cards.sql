-- PatchPay rate cards + bounty categories.
-- Run once in Supabase -> SQL Editor -> Run (safe to re-run).

create table if not exists rate_cards (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null,
  repo        text not null,
  category    text not null check (category in ('docs','bug','feature','security','other')),
  amount_sats bigint not null check (amount_sats >= 10000),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (owner, repo, category)
);

alter table rate_cards enable row level security;
drop policy if exists "public read rate_cards" on rate_cards;
create policy "public read rate_cards" on rate_cards for select using (true);

-- Category shown as a stamp on dockets and the ledger.
alter table bounties add column if not exists category text
  check (category is null or category in ('docs','bug','feature','security','other'));
