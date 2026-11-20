# Deploying PatchPay to Vercel

Takes about 10 minutes. You need: this repo on GitHub, the Supabase project (schema applied), the GitHub App, the GitHub OAuth App, a Gemini key, and the oracle key.

## 1. Import the repo

1. Go to **vercel.com/new**, pick **Import Git Repository** and choose `Mansi2007275/PatchPay`.
2. Framework preset: **Next.js** (auto-detected). Leave build command (`next build`) and output settings at their defaults.
3. Do **not** deploy yet. Open **Environment Variables** first (step 2).

## 2. Environment variables

Add each of these for **Production** (and Preview, if you use previews). Copy values from your `.env.local`.

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_BCH_NETWORK` | `chipnet` | Change to `mainnet` only for the final mainnet demo |
| `ORACLE_PRIVATE_KEY_HEX` | 64 hex chars | **Server only.** Same key as local, or escrows already created can't be released |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **Server only** |
| `GITHUB_APP_ID` | e.g. `5823989` | |
| `GITHUB_APP_PRIVATE_KEY` | full PEM | Paste the whole key including `-----BEGIN RSA PRIVATE KEY-----` / `-----END …-----`. Vercel accepts multi-line values; `\n`-escaped single-line also works |
| `GITHUB_WEBHOOK_SECRET` | webhook secret | Must equal the secret in the GitHub App settings |
| `GEMINI_API_KEY` | AI Studio key | **Server only** |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` | Fill in after the first deploy shows your URL (step 3), then redeploy |
| `NEXT_PUBLIC_REPO_URL` | `https://github.com/Mansi2007275/PatchPay` | BLAZE banner |
| `NEXT_PUBLIC_BLAZE_DECK_URL` | your deck link | BLAZE banner |
| `NEXT_PUBLIC_EMBER_ADDRESS` | token-aware `bitcoincash:z…` | BLAZE banner |
| `RECEIPT_WALLET_WIF` / `RECEIPT_CATEGORY` | optional | NFT receipts only |

Do **not** add `CHIPNET_TEST_WALLET_*` — those are for the local `npm run test:chipnet` script only.

## 3. Deploy, then set the site URL

1. Click **Deploy**. When it finishes, copy the production URL, e.g. `https://patchpay.vercel.app`.
2. **Settings → Environment Variables** → set `NEXT_PUBLIC_SITE_URL` to that URL (no trailing slash).
3. **Deployments → … → Redeploy** (`NEXT_PUBLIC_*` values are baked in at build time, so a redeploy is required).

## 4. Point GitHub at Vercel

**GitHub App** (github.com/settings/apps → `patchpay-mansi-app` → General):
- **Webhook URL**: `https://<your-project>.vercel.app/api/github/webhook`
- **Webhook secret**: unchanged (same as `GITHUB_WEBHOOK_SECRET`)
- **Permissions & events → Subscribe to events**: ✅ Pull request, ✅ Check suite
- Save, then **Advanced → Recent Deliveries → Redeliver** any delivery and expect `202`.

**GitHub OAuth App** (github.com/settings/developers → OAuth Apps → PatchPay):
- **Homepage URL**: `https://<your-project>.vercel.app`
- **Redirect URI**: keep `https://<ref>.supabase.co/auth/v1/callback` (unchanged)

## 5. Supabase auth URLs

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://<your-project>.vercel.app`
- **Redirect URLs** → add `https://<your-project>.vercel.app/**` (keep `http://localhost:3000/**` for local dev)

## 6. Smoke test (2 minutes)

1. Open the Vercel URL → the ledger loads.
2. **Sign in with GitHub** → your `@login` appears top-right.
3. Open a funded docket → the escrow receipt shows **ON CHAIN NOW** with a balance and the QR.
4. **Back this bounty** with a WizardConnect wallet (chipnet mode) → a txid appears and **BACKERS** goes up.
5. Visit `/dev/log` only if you set `NEXT_PUBLIC_SHOW_DEV_LOG=1`.

## Notes

- Route time limits are set in code (`maxDuration`: 120 s for Gemini routes and the webhook, 60 s for broadcasts, 30 s for chain reads).
- The webhook answers GitHub with `202` immediately and builds the PatchProof in the background (`after()`), so slow Gemini calls never cause GitHub delivery timeouts.
- The Electrum connection opens on demand and closes when idle, which suits serverless functions.
- Switching to mainnet: set `NEXT_PUBLIC_BCH_NETWORK=mainnet` and redeploy. Chipnet bounties stay in the database but are ignored by the mainnet webhook.
