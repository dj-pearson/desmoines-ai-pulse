# Lane: features

**Mission.** Platform features an enterprise-grade product is expected to have: accounts, notifications, personalization, admin tooling.

**Owns.** src/pages/Profile*, Dashboard, Admin*, src/contexts/, notification + personalization hooks and functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (platform stories), WEB-BE. See `../README.md` for the loop.

## Handoff

WEB-FEAT-039 (Capacitor shell is dead code), slices 1 and 2 of 3 done.

- Done: slice 1 (CapacitorRuntime, its four hooks, usePageTransition, main.tsx shell code) and slice 2 (every isCapacitor()/isMobileApp() branch, the detection helpers and plugin types in `src/lib/capacitorUtils.ts`, hapticTap and its five callers, unused nativeShare/getPlatform, unrendered ImageViewer). `src/__tests__/noCapacitorShell.test.ts` now asserts no source file branches on the shell and the deleted exports stay gone.
- Slice 3: the `.capacitor-app` / `.cap-page-enter` / `.keyboard-visible` rules in `src/index.css` (from the "CAPACITOR / MOBILE APP OVERRIDES" banner at line 1043 to about line 1370; nothing adds the class any more) and the `isCapacitor` arm of the early error handler in `index.html` (around line 315). Trap: that inline script is pinned by hash in the CSP (`check-csp-hashes` in validate), so editing it means re-pinning the hash. Also stale comments naming Capacitor in OfflineBanner.tsx and integrations/supabase/client.ts. Once slice 3 lands, the story can pass; renaming capacitorUtils.ts to something like externalLinks.ts is optional and touches about 12 importers.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-FEAT-020 | this commit | Done. Decision (b): no web push. Deleted the unreachable Capacitor push hook (direct device_tokens write with columns the table lacks) and the dead local-notification branch in EventReminderSettings; guard test keeps device_tokens writes out of src. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Slice 1 of 3. Deleted CapacitorRuntime, its four hooks, usePageTransition and main.tsx's shell code (497 lines out). Ratchet test lists the 8 files still branching. validate exit 0, vitest 2791/2791. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Slice 2 of 3. Removed every isCapacitor()/isMobileApp() branch (web arm kept), the shell helpers and plugin types, hapticTap and its callers, and the unrendered ImageViewer (310 lines out). Guard now asserts zero branches. validate exit 0, vitest 2815/2815. |
