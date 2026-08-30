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
allowlisted in `.gitleaks.toml` only so CI gates *new* leaks — the allowlist is
not a fix. (Several old debug scripts also embed the **anon** key; that key is
public by design — shipped in the browser bundle — so it is lower priority, but
ideally remove those too.)

Editing the migration files does **not** remove the value from git history;
rotation is the only real remediation.

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
