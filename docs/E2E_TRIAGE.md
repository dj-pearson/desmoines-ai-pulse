# E2E triage and the two-lane CI model

**Status:** required smoke lane live as of 2026-07-18 (WEB-CI-003).

## The problem this solves

`.github/workflows/e2e.yml` ran the broad Playwright suites with
`continue-on-error: true`, so E2E produced signal but gated nothing. Real
regressions could merge — and did. Three P1 production bugs (WEB-QA-001/002/003)
shipped while every suite stayed green, including one that broke `npm run build`
outright.

Simply removing `continue-on-error` was not viable: a large share of the suite
fails for pre-existing reasons, so making it required would have blocked every
PR on failures unrelated to its change. The predictable result of that is a
required check people learn to bypass.

## The two lanes

| Lane | Job | Blocking? | Contents |
|---|---|---|---|
| Required | `smoke` | **Yes** — no `continue-on-error` | `tests/route-smoke.spec.ts` via `playwright.smoke.config.ts`, plus `npm run check-imports` |
| Quarantine | `e2e` | No | `accessibility`, `links-and-buttons`, `forms`, `mobile-responsive` |

The required lane is deliberately small and stable. It should grow as the
quarantine backlog shrinks; the end state is a single required lane.

### Why the smoke lane builds for production

`playwright.smoke.config.ts` runs against `vite preview`, not `npm run dev`.
The regressions it guards are bundling-sensitive: a named import with no
matching export is a hard `SyntaxError` under the dev server's native ESM, but
silently becomes `undefined` once bundled, surfacing as React error #130. Only a
real build reproduces the failure that reached production.

`leaflet` is also intentionally excluded from `optimizeDeps` (see
`vite.config.ts`), so react-leaflet's named imports fail under the dev server on
any page with a map — including event detail pages. That is a dev-only artifact
and would red the suite for a reason unrelated to what it asserts.

## Measured pass rate

Measured 2026-07-18 on this branch, `--project=chromium-desktop` only, against a
local dev server with live Supabase credentials:

| Suite | Passing | Total | Rate |
|---|---:|---:|---:|
| `accessibility.spec.ts` | 67 | 135 | 50% |
| `mobile-responsive.spec.ts` | 64 | 105 | 61% |
| `links-and-buttons.spec.ts` | 62 | 83 | 75% |
| `forms.spec.ts` | 16 | 19 | 84% |
| **Total (quarantined)** | **209** | **342** | **61%** |
| `route-smoke.spec.ts` (required) | 4 | 5 | 80% |

Reproduce with:

```bash
npx playwright test tests/accessibility.spec.ts tests/links-and-buttons.spec.ts \
  tests/forms.spec.ts tests/mobile-responsive.spec.ts \
  --project=chromium-desktop --reporter=json
```

### On the "841/2997 (28%)" figure

The WEB-CI-003 story cites 841 of 2997 failing, sourced from
`TEST_FAILURES_REPORT.md`. **That file does not exist in the repo**, so the
figure could not be verified. It is also not directly comparable to the table
above: 2997 is the full matrix across every configured project (desktop ×
mobile × tablet × three browsers), whereas the numbers here are a single project
across four suites. Treat 61% as the current, reproducible baseline for that
scope, and re-measure before drawing trend conclusions.

## What is failing, and what it means

The failures are **not** predominantly flaky. Two clusters dominate, and both
look like genuine product defects rather than test problems:

1. **`mobile-responsive` — horizontal scroll (~24 failures).** `/events`,
   `/restaurants`, `/attractions`, `/playgrounds`, `/articles` and
   `/neighborhoods` all overflow horizontally at 360×800 and 320×568, and
   several fail "content fits viewport" at mobile widths. Horizontal scroll on
   mobile is a real bug on a mobile-first product; these assertions are correct
   and the pages are wrong.

2. **`accessibility` — WCAG violations (68 failures, 50% of that suite).** This
   is the known PROD-A11Y-001 backlog. Also real, and tracked separately.

This matters for how the remaining triage should be approached: the AC's framing
("obsolete tests updated/removed, flaky ones quarantined") anticipated a suite
rotted by bad tests. The evidence points the other way — the suite is mostly
right and is reporting real defects. **Deleting or relaxing these tests would
destroy the signal**, so nothing has been deleted or weakened here.

## Remaining work (not done in WEB-CI-003)

Full triage of 133 failing tests is its own body of work, and the two clusters
above are product bugs that need product fixes:

- [ ] Fix mobile horizontal overflow on the six affected routes, then move
      `mobile-responsive` into the required lane.
- [ ] Work down the PROD-A11Y-001 accessibility backlog, then move
      `accessibility` into the required lane.
- [ ] Triage the 21 `links-and-buttons` and 3 `forms` failures individually.
- [ ] Re-measure the full multi-project matrix and replace the unverified
      841/2997 figure at its source.

## Branch protection

Blocking needs two things, and both are done:

1. The `smoke` job has no `continue-on-error`, so it fails the workflow.
2. `Smoke (critical journeys, required)` is registered in
   `required_status_checks` for both `main` and `develop` in
   `.github/rulesets/`.

Without (2), the job would go red and the PR would still be mergeable.

**Caveat:** the ruleset files in `.github/rulesets/` are a checked-in
representation of the GitHub configuration. If they are not applied to the
repository automatically, this change must also be made in the repo's ruleset
settings for it to take effect. Confirm on the first PR that the check appears
as required.
