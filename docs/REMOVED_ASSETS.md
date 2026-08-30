# Removed / untracked large assets (WEB-OPS-001)

To keep the repo lean, the following large binaries and generated artifacts were
removed from git tracking on 2026-07-11. They are now git-ignored so they don't
get re-committed. Everything here remains recoverable from git history
(`git log --all --oneline -- <path>` then `git checkout <sha>^ -- <path>`).

## Generated artifacts (regenerate on demand — do not commit)

| Path | What it is | How to regenerate |
|---|---|---|
| `test-reports/` (~23 MB, 62 files) | Playwright/automated test report JSON dumps | Re-run the test suite; exporters write here |
| `test-failures.json` (~1.5 MB) | Aggregated test-failure export | `npm run test:export:json` |
| `screenshot_logs.txt` (~858 KB) | Screenshot-run log output | Produced by the screenshots lane |

## Source binaries (move to design/asset storage, not git)

| Path | What it is | Where it should live |
|---|---|---|
| `DMI-Logo.psd` (~5 MB) | Photoshop logo source | Design asset storage (Drive/Figma/DAM), not the app repo |
| `2024_Dinner Menu_8-5x14.pdf` (~4.9 MB) | Sample menu PDF (test/sample data) | Sample-data storage or a fixtures bucket if still needed |

`*.psd` is now git-ignored. If a designer needs the logo source, pull it from git
history or the design storage above.

## Intentionally kept

Visual-regression baselines under `tests/**/*-snapshots/*.png` are **kept** —
they are required inputs for the visual-regression suite, not generated waste.
