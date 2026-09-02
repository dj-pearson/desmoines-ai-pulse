# Secrets — Inventory & Rotation Runbook

**Owner:** platform owner · **Last updated:** 2026-06-12 (WEB-SEC-008)

This is the authoritative list of every secret the platform uses, where it
lives, and how to rotate it. Secrets are **never** committed — `.env` is
gitignored, a pre-commit hook (`.githooks/pre-commit`) blocks env-file commits,
and CI runs gitleaks (`.gitleaks.toml`) on every PR.

---

## 🚨 Action required — already-exposed secrets to rotate now

A **`service_role`** Supabase JWT was hard-coded into 11 historical migrations
(it appears in git history, so it is effectively public):

```
supabase/migrations/20250820173146_*.sql   20250903031613_*.sql
supabase/migrations/20250822015522_*.sql   20250903140840_*.sql
supabase/migrations/20250823012338_*.sql   20251004030356_*.sql
supabase/migrations/20250825174423_*.sql
supabase/migrations/20250830035320_*.sql
supabase/migrations/20250830035336_*.sql
supabase/migrations/20250830144003_*.sql
supabase/migrations/20250831045616_*.sql
```

**Rotate the Supabase API keys (see §Supabase below).** Until rotated, anyone
with the repo history has full service-role DB access. These paths are
Editing the migration files does **not** remove the value from git history;
rotation is the only real remediation.

### What changed on 2026-09-02 (WEB-SEC-032)

Three things were done, and none of them is rotation.

1. **The key is out of the working tree.** All eleven migrations now read
   `public.app_secret('service_role_key')`. They are applied history and are
   never re-run, so this changes no database — it stops the tree carrying a live
   credential. The four debug scripts and the two docs that carried the **anon**
   key read `VITE_SUPABASE_ANON_KEY` instead, and refuse to run without it.

2. **The key is out of the DATABASE**, which nobody had noticed it was in. The
   eleven migrations wrote it inside `CREATE OR REPLACE FUNCTION` bodies —
   `trigger_due_scraping_jobs`, `run_scraping_jobs_simple`,
   `run_social_media_automation`, `run_social_media_publishing`,
   `trigger_article_webhook` — and no later migration replaced any of them, so
   the value was readable through `pg_get_functiondef` by anyone who could
   connect. `supabase/migrations/20260902000015_purge_embedded_service_key.sql`
   rewrites whatever is actually installed, without naming the value.

3. **The gitleaks allowlist lost fifteen entries.** It had been configured not
   to look at exactly the files that had the problem. An allowlist that grows is
   a scanner that reports less every quarter.

**Still outstanding, and only the owner can do it:**

- [ ] Confirm whether the `service_role` key was rotated after the first
      exposure. If it was, record the date here. If it was not, rotate it now —
      the value is in git history and always will be.
- [ ] Set the Vault secret `service_role_key` if it is not already set. Until
      it is, the rewritten functions send unauthenticated requests and pg_cron
      still records SUCCESS, because enqueueing worked (WEB-OPS-007). The
      migration raises a warning saying so at apply time.
- [ ] `android/app/google-services.json` is no longer tracked. CI must provide
      it from a secret before the next Android build (AND-AUDIT-010).

**Rotation date:** _not recorded — owner to fill in_

---

## Inventory & rotation steps

### Supabase (DB, Auth, Storage, Edge Functions)
| Secret | Where set | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env`, Cloudflare Pages env | Public (browser). |
| `VITE_SUPABASE_ANON_KEY` | `.env`, Cloudflare Pages env | Public by design. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets, CI, admin scripts | **Full DB access — never expose.** |
| `SUPABASE_DB_URL` / `DATABASE_URL` / `SUPABASE_DB_PASSWORD` | local `.env` for backup scripts | Direct Postgres. |

**Rotate:** Supabase Dashboard → Project Settings → API → *Rotate* the
`service_role` (and, if compromised, `anon`/JWT secret). Note: rotating the JWT
secret invalidates **all** existing JWTs (signs out users) — schedule a window.
After rotation, update the key in: Supabase function secrets, Cloudflare Pages
env, GitHub Actions secrets, and any admin `.env`. Re-deploy edge functions.

### Stripe
| Secret | Where set |
|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `.env`, Cloudflare Pages (public) |
| `STRIPE_SECRET_KEY` | Supabase function secrets |
| `STRIPE_WEBHOOK_SECRET` | Supabase function secrets |
| `STRIPE_PRICE_*` | Supabase function secrets / config |

**Rotate:** Stripe Dashboard → Developers → API keys → *Roll* the secret key
(grace period available). Webhook secret: Developers → Webhooks → roll signing
secret, then `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…`.

### AI providers
| Secret | Where set |
|---|---|
| `ANTHROPIC_API_KEY` (a.k.a. `CLAUDE_API` / `CLAUDE_API_KEY`) | Supabase function secrets |
| `OPENAI_API_KEY` | Supabase function secrets |

**Rotate:** provider console → create new key → `supabase secrets set …` →
revoke the old key.

### Email
| Secret | Where set |
|---|---|
| `RESEND_API_KEY` | Supabase function secrets |
| `SENDGRID_API_KEY` | Supabase function secrets (if used) |

**Rotate:** Resend/SendGrid dashboard → create key → `supabase secrets set …` →
delete old key.

### Google
| Secret | Where set |
|---|---|
| `GOOGLE_PLACES_API` | Supabase function secrets |
| `VITE_GOOGLE_CLIENT_ID` | `.env` (public) |
| `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` | Supabase function secrets |
| `PAGESPEED_INSIGHTS_API_KEY` | Supabase function secrets |

**Rotate:** Google Cloud Console → APIs & Services → Credentials → regenerate /
create new → update secret → revoke old. Restrict keys by API + referrer.

### Platform automation controls (not credentials, but env-gated)
`EDGE_FUNCTION_API_KEY` (rotate like any shared key),
`CRAWLER_DOMAIN_ALLOWLIST`, `CRAWLER_ALLOW_ALL`, `CORS_PREVIEW_ORIGINS`,
`ALLOW_LOVABLE_PREVIEWS` — see `.env.example`.

---

## Prevention (in place)
- **`.env` gitignored** (`.env`, `.env.local`, `.env.*.local`).
- **Pre-commit hook** `.githooks/pre-commit` (activated by the npm `prepare`
  script via `core.hooksPath`) blocks committing env files and runs gitleaks
  locally if installed.
- **CI secret scanning**: `.github/workflows/pr-checks.yml` runs
  `gitleaks/gitleaks-action@v2` with `.gitleaks.toml`; the build fails on any
  newly-detected credential.

## If a secret leaks
1. Rotate it immediately (steps above) — assume it's compromised.
2. Update every store that holds it (Supabase secrets, Cloudflare Pages, GitHub
   Actions, local `.env`).
3. Re-deploy affected edge functions.
4. Review access logs for misuse.
5. Add a gitleaks rule / allowlist entry as appropriate and record it here.
