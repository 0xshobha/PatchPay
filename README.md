# PatchPay — bounties that are already paid for

> **BCH BLAZE 2026 · Mainnet Track.** Deck: _add your Widget Factory link_ · Live demo: _add Vercel URL_ · EMBER2026 votes: _add token-aware `bitcoincash:z…` address_ · All code written from 14 Nov 2026.

A maintainer locks Bitcoin Cash into a **per-issue escrow contract**. Anyone — a person or an AI coding agent — fixes the issue. When the PR is merged, CI is green and the maintainer approves, the contract pays the contributor and writes a **PatchProof** hash into the payout transaction. If nobody fixes it by the deadline, anyone can trigger a refund, and the contract only lets funds go back to the maintainer.

## Why
Open-source bounty boards are full of rewards that never get paid (maintainers ghost, "symbolic" bounties, no proof of funds) and, now, of low-effort AI PRs. PatchPay fixes both ends: **proof of funds before work starts, proof of work before money moves.**

## What's inside
| Piece | Where |
|---|---|
| `PatchEscrow.cash` — CashScript covenant: oracle-signed release to one recipient + OP_RETURN proof hash, or refund-after-deadline to maintainer | `contracts/` |
| Contract tests (forged sig, wrong recipient, early refund all revert) | `scripts/escrow.test.mjs` → `npm run test:contract` |
| WizardConnect funding (HD inputs + `inputPaths`) | `src/lib/bch/funding.ts` |
| Oracle signer (server-only) | `src/lib/bch/oracle.ts` |
| PatchProof builder (GitHub API → canonical JSON → sha256) | `src/lib/github/verify.ts`, `src/lib/patchproof/proof.ts` |
| Issue Scout + sceptical PR review (Gemini) | `src/lib/ai/gemini.ts` |
| Webhook, bounty, sync, approve, refund APIs | `src/app/api/**` |
| Ledger, docket, public receipt with in-browser hash check | `src/app/**` |
| Database | `supabase/schema.sql` |

## Run it
```bash
cp .env.example .env.local      # fill every value (see docs)
npm install
npm run oracle:key              # paste output into .env.local
npm run test:contract           # 5 passed
npm run dev
```

## Trust model
- The contract cannot pay anyone the oracle did not sign for, and refunds only reach the maintainer.
- The oracle (PatchPay server key) signs only after: PR merged (re-checked live), all check runs green, maintainer approval, approver ≠ PR author.
- AI never holds keys or approves; it only fills the review section of the proof.
- Roadmap: 2-of-3 oracle (maintainer, PatchPay, independent verifier); PatchProof CashToken NFT receipts.

## Test → mainnet
Build on **chipnet** (`NEXT_PUBLIC_BCH_NETWORK=chipnet`, `bchtest:` addresses, Paytaca chipnet mode, faucet: tbch.googol.cash). Switch the single env var to `mainnet` for the demo, with a small real bounty (≈0.001 BCH).
