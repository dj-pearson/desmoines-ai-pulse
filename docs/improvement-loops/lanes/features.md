# Lane: features

**Mission.** Platform features an enterprise-grade product is expected to have: accounts, notifications, personalization, admin tooling.

**Owns.** src/pages/Profile*, Dashboard, Admin*, src/contexts/, notification + personalization hooks and functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (platform stories), WEB-BE. See `../README.md` for the loop.

## Handoff

None. WEB-FEAT-047 is done in one loop. Optional follow-ups, not started: (1) rename `src/lib/capacitorUtils.ts` (now only toSafeExternalUrl/openExternalUrl/shareWithOutcome) to something like `externalLinks.ts`; about 12 importers. (2) The same unrendered-code shape exists for `src/components/UsageDisplay.tsx` + `src/hooks/useUsage.ts` (nothing imports UsageDisplay; get_current_usage, record_usage_event and usage_events are all in schema-baseline.json). (3) Migration 20251209000000_crm_infrastructure.sql still defines the crm_contacts/deals/tasks tables nobody reads now; it was never applied, leave it or retire it with WEB-QA-018.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-FEAT-020 | this commit | Done. Decision (b): no web push. Deleted the unreachable Capacitor push hook (direct device_tokens write with columns the table lacks) and the dead local-notification branch in EventReminderSettings; guard test keeps device_tokens writes out of src. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Slice 1 of 3. Deleted CapacitorRuntime, its four hooks, usePageTransition and main.tsx's shell code (497 lines out). Ratchet test lists the 8 files still branching. validate exit 0, vitest 2791/2791. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Slice 2 of 3. Removed every isCapacitor()/isMobileApp() branch (web arm kept), the shell helpers and plugin types, hapticTap and its callers, and the unrendered ImageViewer (310 lines out). Guard now asserts zero branches. validate exit 0, vitest 2815/2815. |
| 2026-11-07 | WEB-FEAT-039 | this commit | Done (slice 3 of 3). Deleted 324 lines of .capacitor-app/.cap-page-enter/.keyboard-visible CSS and the isCapacitor arm of index.html's early error handler; re-pinned its CSP hash. Guard test covers CSS and index.html. check-csp-hashes OK, vitest 2835/2835, type-check ratchet 61/61, vite build OK. |
| 2026-11-07 | WEB-FEAT-043 | this commit | Done (new story). Dashboard "Clear all" now deletes the signed-in user's recently_viewed rows, and a clear/remove discards an in-flight server merge; before, the history merged back on reload and on other devices. 4 of 5 new hook tests failed before the fix, 5/5 after; type-check ratchet 61/61. |
| 2026-11-07 | WEB-FEAT-047 | this commit | Done (new story). Deleted the second, unrendered CRM (src/components/crm, eight useCrm* hooks, src/types/crm.ts; 6,082 lines) written against crm_contacts/deals/tasks/segments, which production never had. /admin/crm (CrmBoard + useCrm via crm-console) untouched. 36 schema-baseline entries gone. validate exit 0, vitest 2909/2909, type ratchet 32/32 (was 61). |
