-- ============================================================================
-- PatchPay — RESET + SCHEMA for an existing Supabase project.
-- Run this in Supabase → SQL Editor → Run.
--
-- ⚠️  This DROPS any existing bounties / proofs / payments / events tables
--     (including data from a different app that previously used this project)
--     and recreates them with the PatchPay schema. You chose to reset this
--     project, so this is expected.
-- ============================================================================

drop table if exists payments cascade;
drop table if exists proofs   cascade;
drop table if exists events   cascade;
drop table if exists bounties cascade;

create extension if not exists pgcrypto;

create table bounties (
  id               uuid primary key default gen_random_uuid(),
  owner            text not null,
  repo             text not null,
  issue_number     int  not null,
  issue_title      text not null,
  criteria         text not null,
  scout            jsonb,
  amount_sats      bigint not null check (amount_sats >= 10000),
  maintainer_login text not null,
  maintainer_addr  text not null,
  oracle_pubkey    text not null,
  deadline_unix    bigint not null,
  escrow_address   text not null unique,
  network          text not null check (network in ('chipnet','mainnet')),
  status           text not null default 'awaiting_funds'
                   check (status in ('awaiting_funds','open','in_review','verified','paid','refunded','cancelled')),
  created_at       timestamptz not null default now(),
  unique (owner, repo, issue_number, network)
);

create table proofs (
  id            uuid primary key default gen_random_uuid(),
  bounty_id     uuid not null references bounties(id) on delete cascade,
  pr_number     int  not null,
  proof         jsonb not null,
  proof_hash    text not null unique,
  checks_green  boolean not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  created_at    timestamptz not null default now()
);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  bounty_id     uuid not null references bounties(id),
  proof_id      uuid references proofs(id),
  kind          text not null check (kind in ('fund','release','refund','receipt_nft')),
  txid          text not null,
  amount_sats   bigint,
  recipient     text,
  oracle_sig    text,
  created_at    timestamptz not null default now(),
  unique (txid, kind)
);

create table events (
  id         bigserial primary key,
  bounty_id  uuid references bounties(id) on delete cascade,
  actor      text not null,
  action     text not null,
  data       jsonb,
  created_at timestamptz not null default now()
);

-- Public read (transparency product); writes only via the server service role.
alter table bounties enable row level security;
alter table proofs   enable row level security;
alter table payments enable row level security;
alter table events   enable row level security;
create policy "public read bounties" on bounties for select using (true);
create policy "public read proofs"   on proofs   for select using (true);
create policy "public read payments" on payments for select using (true);
create policy "public read events"   on events   for select using (true);


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
