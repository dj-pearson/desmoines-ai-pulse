# Lane: ui-ux

**Mission.** Every screen looks finished, behaves predictably, and passes WCAG 2.1 AA on mobile first.

**Owns.** src/components/**, src/pages/** (presentation only), tailwind.config.ts, tests/accessibility*

**Backlog.** Open stories in `prd.json` with prefix WEB-UX. See `../README.md` for the loop.

## Handoff

**WEB-UX-056, slice 2 of 2.** Done in slice 1: `scripts/check-icon-button-names.mjs` (TS AST scan of src/components and src/pages for icon-only `Button`/`button`/`Toggle` with no aria-label, aria-labelledby or title), wired into `validate` with `.github/icon-button-names-baseline.json`; 47 buttons named in ContentTable, ArticleEditor, cms/EnhancedArticleEditor, cms/RichTextEditor (whole toolbar), cms/CategoryTagManager, RestaurantFilters and EventPhotoUpload. Next: the 32 left in 23 files (`node scripts/check-icon-button-names.mjs --list`), then `--write` to lock the baseline at 0 and close the story. Traps: the scanner skips buttons with a `{...spread}`, any `{expression}` child or `asChild`, so its count is a floor; name the action and its target (`Delete ${name}`), not just the verb; icons that only appear on hover (`opacity-0 group-hover:`) also need `group-focus-within:opacity-100` or keyboard focus lands on an invisible button.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-UX-052 | this commit | /social forum, thread and group rows were div onClick with no tab stop; now stretched buttons in the row heading, focus moves to the opened view heading and back to the row. vitest 2713/2713 (new spec red on old code), type ratchet 61/61, check-ui-craft 3 <= 7. WEB-UX-037 left open: still gated on the owner's SiteDirectory SEO call. |
| 2026-11-07 | WEB-UX-053 | this commit | Create Forum / Create Thread dialog fields on /social now use the shared Label with htmlFor/useId ids, and the reply box got a visible "Your reply" label. New communityForumsLabels.test.tsx fails 2/2 on old code, passes now; vitest 2739/2739, type ratchet 61/61, check-ui-craft 3 <= 7. |
| 2026-11-07 | WEB-UX-054 | this commit | /social passed groupName="Selected Group" to EnhancedGroupPlanner; it now looks the picked group up by id, passes its name, and closes the planner if that group leaves the list. New socialGroupPlannerName.test.tsx fails 2/2 on old Social.tsx, passes 2/2 on this one and on the rolling branch's Social.tsx with this patch applied; type ratchet 61/61, eslint 0 errors. Low reach until friend groups are stored (groupsAvailable is false). |
| 2026-11-07 | WEB-UX-055 | this commit | New story. EventFeedback's like/dislike/interested buttons (on every event card for signed-in readers) were icon-only with no name or pressed state; now "Like <title>" etc. with aria-pressed. Same fix for the /submit-event add/remove tag buttons, the /social planner add button and the footer newsletter form. New iconButtonNames.test.tsx fails 4/4 on old code, passes 4/4; vitest 2812/2812, type ratchet 61/61, check-ui-craft 3 <= 7. Admin icon buttons (~55) not touched. |
| 2026-11-07 | WEB-UX-057 | this commit | Nine mouse-only Card/div click targets in admin (MediaLibrary grid+list, ImageBackfill categories, ContentQueue filter cards, ContentTemplateSelector, AIArticleGenerator suggestions, both menu upload drop zones) now have one real button each: stretched name buttons with aria-pressed, or a button over the drop zone. Shared class in src/lib/stretchedButton.ts. ImageViewer.tsx from the story no longer exists (deleted by WEB-FEAT-039). New adminClickableCards.test.tsx fails 3/4 on old code, passes 4/4; vitest 2837/2837, type ratchet 61/61, check-ui-craft 3 <= 7. |
| 2026-11-07 | WEB-UX-056 | this commit | Slice 1 of 2. New check-icon-button-names ratchet (in validate) found 79 icon-only Button/button/Toggle with no name; 47 fixed (ContentTable row actions and view toggle, both article editors, the whole CMS rich-text toolbar, CategoryTagManager, RestaurantFilters close, EventPhotoUpload remove), baseline 32. Tag actions also show on keyboard focus now. New adminIconButtonNames.test.ts: 7 file cases fail on old code (47 hits), 11/11 pass; vitest 2868/2868, type ratchet 61/61, eslint 0 errors, check-ui-craft 3 <= 7. |
