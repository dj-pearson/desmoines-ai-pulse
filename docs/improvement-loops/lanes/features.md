# Lane: features

**Mission.** Platform features an enterprise-grade product is expected to have: accounts, notifications, personalization, admin tooling.

**Owns.** src/pages/Profile*, Dashboard, Admin*, src/contexts/, notification + personalization hooks and functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (platform stories), WEB-BE. See `../README.md` for the loop.

## Handoff

WEB-FEAT-039 (Capacitor shell is dead code), slice 1 of 3 done.

- Done: CapacitorRuntime and its four hooks (useDeepLinks, useSwipeBack, useStatusBarStyle, useKeyboardAware), usePageTransition, and main.tsx's capacitor-app class, link interceptor, window.open override and splash hide. Guard: `src/__tests__/noCapacitorShell.test.ts`, whose `REMAINING_BRANCHES` list may only shrink.
- Slice 2: drop the isCapacitor() branches in AdBanner, AffiliateAdBanner, EnhancedHero, EventQuickView, Footer, ImageViewer and useNetworkStatus (keep the web branch of each), then remove isCapacitor/isMobileApp and the plugin types from `src/lib/capacitorUtils.ts`. Keep `openExternalUrl`, `toSafeExternalUrl` and the other web-used helpers (AC3); their tests in `src/lib/__tests__/openExternalUrl.test.ts` stub window.Capacitor and need trimming, not deleting. Take each file off `REMAINING_BRANCHES` as it goes.
- Slice 3: the `.capacitor-app` / `.cap-page-enter` / `.keyboard-visible` rules in `src/index.css` (about 320 lines from line 1047, all unreachable now that nothing adds the class) and the `isCapacitor` arm of the early error handler in `index.html` (around line 315). Trap: that inline script is pinned by hash in the CSP (`check-csp-hashes` in validate), so editing it means re-pinning the hash.
- Trap: the component tests that mock `@/lib/capacitorUtils` (AffiliateAdBanner.label, favoriteButtonA11y, checkInAndSignInLinks, ratingSystemA11y) mock isCapacitor; drop that key from the mock when the export goes.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-FEAT-020 | this commit | Done. Decision (b): no web push. Deleted the unreachable Capacitor push hook (direct device_tokens write with columns the table lacks) and the dead local-notification branch in EventReminderSettings; guard test keeps device_tokens writes out of src. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Slice 1 of 3. Deleted CapacitorRuntime, its four hooks, usePageTransition and main.tsx's shell code (497 lines out). Ratchet test lists the 8 files still branching. validate exit 0, vitest 2791/2791. |
