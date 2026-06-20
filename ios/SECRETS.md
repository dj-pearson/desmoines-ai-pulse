# iOS Secrets Handling

## What is bundled in the app

The iOS app bundles **only the Supabase anon (publishable) key** — never the
service-role key. The anon key is a public, RLS-gated credential designed to ship
in client apps; all privileged access is enforced server-side by Row Level
Security and Edge Functions.

Concretely:

- `Secrets.xcconfig` (gitignored) holds `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- `ios/scripts/generate-secrets.sh` reads those and writes
  `DesMoinesInsider/Configuration/Secrets.generated.swift` (gitignored) at build
  time.
- The **service-role key is never present** in any iOS target, xcconfig, or
  generated file.

## Guardrails (IOS-AUDIT-SEC-007)

1. **Pre-commit hook** (`.githooks/pre-commit`, activated by the npm `prepare`
   script via `core.hooksPath`) rejects:
   - staged `Secrets.xcconfig` / `Secrets.generated.swift`
   - JWT/anon-key-shaped strings (`eyJ….eyJ….`) in staged additions
2. **CI** (`.github/workflows/secret-scan.yml`) fails a PR that adds a
   key-shaped string or tracks a Secrets file.
3. **gitleaks** runs in the pre-commit hook when installed locally.

## Build-time injection flow (unchanged)

`make setup` copies `Secrets.xcconfig.example` → `Secrets.xcconfig`; developers
fill in their values. CI/release injects the values via environment and runs
`generate-secrets.sh`. Nothing about that flow changed for this story.

## Known follow-up (out of scope for SEC-007)

Some historical files committed before this guard contain Supabase JWTs,
including a few **service-role** keys in older `supabase/migrations/*.sql` and
debug scripts. The new diff-based CI scan intentionally does **not** retroactively
fail on this history (that would block every PR), but these keys should be
**rotated** and the literals scrubbed. Tracked separately — rotation is an ops
action.
