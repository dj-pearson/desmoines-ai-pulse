# Compliance Audit — Des Moines AI Pulse

**Date:** 2026-07-23
**Scope:** Required legal documents & pages, ADA/WCAG 2.1 AA accessibility, and data-privacy (GDPR + US state laws: CCPA/CPRA, VCDPA, CPA, CTDPA, UCPA).
**Method:** Static code audit of the web app (`src/`), Supabase edge functions (`supabase/functions/`), and CI config. No production data was accessed.

> ⚠️ **Not legal advice.** This report and the accompanying policy-text changes are a good-faith engineering compliance pass. Have qualified counsel review the legal documents (especially the Privacy Policy) before relying on them, and fill in the bracketed placeholders noted below.

---

## Executive summary

The platform starts from an **unusually strong compliance baseline**: 11 substantive legal pages, a granular opt-in cookie banner with a consent audit log, a real self-service DSAR export/delete panel, a full accessibility preference widget, and a comprehensive axe-core test suite. The gaps were not "missing basics" — they were a small number of **high-impact wiring and completeness defects**, plus items that need a human/business decision.

The single most serious finding: **cookie consent was decorative.** The banner recorded the user's choice, but no tracking code read it — analytics fired for every user regardless of "Reject." That is the classic "UI promises opt-in that the backend ignores" exposure. **This is now fixed.**

| Dimension | Baseline | Headline gap (now fixed) | Biggest remaining item (flagged) |
|---|---|---|---|
| Legal documents | 9/11 PASS | Privacy Policy was stale + missing GDPR/CPRA clauses | Real postal address; DMCA agent registration |
| Privacy (GDPR/US) | Strong scaffold | Consent not enforced on analytics | Age gate / COPPA at signup |
| Accessibility (WCAG) | Strong foundation | Duplicate/nested `<main>` landmarks | App-wide landmark nesting refactor + CI gating |

---

## What was fixed in this change

### Privacy / GDPR / CPRA

1. **Consent is now enforced.** `usePageTracking` and `useContentTracking` now short-circuit unless the user granted the `analytics` cookie category via `hasConsent('analytics')`. Absence of a record = denial, and a GPC-recorded rejection is covered by the same check. Previously these hooks wrote to `user_analytics` / `content_metrics` on every user. (`src/hooks/usePageTracking.ts`, `src/hooks/useContentTracking.ts`)
2. **Functional, non-destructive opt-out control.** Added `reopenConsentBanner()` — the mounted banner re-opens pre-filled with the current choices instead of wiping them (the old `resetConsentPrompt()` cleared the record and reloaded). Wired into the Cookie Policy page and the Profile privacy panel. (`src/components/CookieConsentBanner.tsx`, `src/pages/CookiePolicy.tsx`, `src/components/PrivacyControls.tsx`)
3. **Conspicuous footer "Your Privacy Choices" link** (CPRA §1798.135) available logged-in or logged-out, plus a previously-missing "Help & Support" footer link. (`src/components/Footer.tsx`)
4. **Erasure & export completeness (GDPR Art. 17 / Art. 15).** Account deletion now also purges `user_analytics` (by `user_id`) and `newsletter_subscribers` (by email); the self-service export now includes `user_analytics`. (`supabase/functions/delete-user-account/index.ts`, `src/components/PrivacyControls.tsx`)
5. **Privacy Policy rewrite** (see next section).

### Legal documents

6. **Privacy Policy** (`src/pages/PrivacyPolicy.tsx`) refreshed and expanded to close audit gaps:
   - Refreshed date (was Nov 2025, ~8 months stale vs sister docs).
   - Added **GDPR Art. 6 legal bases** (contract / consent / legitimate interest / legal obligation).
   - Added **data-controller identification** and an **EU/UK Art. 27 representative** section (placeholder — appoint if you target EEA/UK).
   - Added **right to object** and **right to restriction** to the rights list.
   - Added **CPRA right to correct**, **right to limit use of sensitive PI**, and a dedicated **"Do Not Sell or Share My Personal Information"** section with a working opt-out button.
   - Reconciled the **sub-processor list** with the DPA (added Resend/SendGrid, OpenAI/Anthropic) and reconciled the "no sale" language with the advertising-cookie reality.
   - Cross-linked the **Cookie Policy** and **DPA**; added a US-state-laws section (VA/CO/CT/UT).

### Accessibility

7. **Removed duplicate/nested `<main>` landmarks** (WCAG 1.3.1 / 4.1.1) in `src/pages/SearchResults.tsx` (which also duplicated `id="main-content"`) and `src/pages/ThingsToDoHub.tsx` — both now use `<div>` since `App.tsx` provides the single top-level `<main>`.
8. **Keyboard-operable image zoom** (WCAG 2.1.1): the `ImageViewer` opener now exposes `role="button"`, `tabIndex`, an `aria-label`, and Enter/Space handling — but only in the Capacitor app where the opener is actually interactive. (`src/components/ImageViewer.tsx`)
9. **Global `:focus-visible` fallback** (WCAG 2.4.7) added as a safety net so any raw interactive element without a shadcn ring utility still shows a keyboard focus indicator. (`src/index.css`)

**Verification:** type-check (via `tsc -p tsconfig.app.json`) and ESLint pass on all changed files with no new errors; a production `vite build` completes successfully.

---

## Remaining items — require a decision or a larger, separately-tested change

These were intentionally **not** auto-applied because they need business input, real data, or an app-wide refactor that must be validated against the full Playwright suite.

### Priority 1 — legal / business inputs

| Item | Why it matters | Action needed |
|---|---|---|
| **Real registered postal address** | CAN-SPAM §5(a)(5) requires a valid physical postal address (street or PO box) in marketing email; the footer + Contact + Privacy Policy show only "Des Moines, Iowa, USA". | Supply a real address; replace the `TODO(legal)` placeholders in `Footer.tsx`, `Contact.tsx`, `PrivacyPolicy.tsx`. |
| **DMCA agent registration** | `DMCAPolicy.tsx` self-discloses the agent is "in the process of" registering. DMCA §512 safe harbor is not perfected until the agent is registered with the U.S. Copyright Office. | Complete the Copyright Office registration, then update the page. |
| **EU/UK Art. 27 representative** | Required if you target or monitor EEA/UK data subjects. | Decide EEA/UK scope; appoint a representative and fill the placeholder in `PrivacyPolicy.tsx`. |
| **Standalone Refund/Cancellation Policy** | `Terms.tsx` references "our refund policy" twice, but no such page exists. | Author a refund policy page (or remove the references). |

### Priority 2 — engineering, needs full-suite validation

| Item | Why it matters | Recommended approach |
|---|---|---|
| **App-wide landmark nesting** | `App.tsx` wraps the whole routed tree in `<main id="main-content">`, but every page renders its own `<Header>` (banner/nav) and `<Footer>` (contentinfo) *inside* it. This nests banner/nav/contentinfo within `main` on **every page** (axe `landmark-*-is-top-level`) and undercuts the skip link. Likely the root of the quarantined `PROD-A11Y-001` backlog. | Hoist `<Header>`/`<Footer>` out of the routed `<main>` (render once in `App.tsx` around it) and drop the per-page copies — or demote the App wrapper to a `<div>` and let each page own exactly one `<main>`. Requires touching many pages; run `npm run test:a11y` to confirm before/after. |
| **Gate a11y tests in CI** | `test:a11y` exists but no required check runs it; `e2e.yml` quarantines the broad suites as non-blocking, so a11y regressions merge freely. | Once the landmark refactor lands and the axe suite is green, promote `test:a11y` (or grow the `smoke` lane) to a required PR check and retire `PROD-A11Y-001`. |
| **Age gate / COPPA** | No age attestation exists at signup or newsletter. For a US consumer service, a "13+" attestation (16+ where EU consent applies) is expected. | Add an age attestation checkbox to the signup and newsletter flows (product decision on UX). |
| **Newsletter consent for GDPR** | Footer newsletter is single opt-in (submitting = consent) — fine for CAN-SPAM, not GDPR-affirmative-consent. | If EEA/UK is in scope, add a separate unchecked opt-in checkbox and consider double opt-in. |
| **`analytics-tracker.ts` / other trackers** | References `window.gtag` and POSTs to `/api/analytics`. No third-party trackers are currently loaded, but if any are added they must also be gated on `hasConsent()`. | Route any future analytics/ad script injection through the consent check; treat the banner's advertising toggle as the on/off switch. |
| **`consent_records` on erasure** | Retained on account deletion as proof-of-consent (legitimate legal basis), but contains hashed email + user_id. | Confirm the retention rationale with counsel; document it (already noted in the Privacy Policy retention section). |

### Priority 3 — documentation / nice-to-have

- Minor accessibility polish: persist the live-region node in `announceToScreenReader` (`useAccessibility.ts`); consider a focus trap on the Accessibility widget panel; verify light-mode `muted-foreground` and the fixed-dark Footer text against AA contrast with the suite's `color-contrast` check.
- Optional standalone pages some reviewers expect: public **Subprocessor list**, **Community Guidelines**, discrete **EULA** (currently folded into Terms §10).

---

## Document inventory (reference)

| Page | Route | Verdict (pre-fix) |
|---|---|---|
| Privacy Policy | `/privacy-policy` | PARTIAL → **updated** |
| Terms of Service | `/terms` | PASS |
| Accessibility Statement | `/accessibility` | PASS |
| Cookie Policy | `/cookie-policy` | PASS |
| DMCA Policy | `/dmca` | PASS (agent registration pending) |
| Acceptable Use Policy | `/acceptable-use` | PASS |
| Data Processing Agreement | `/dpa` | PASS |
| Affiliate Disclosure | `/affiliate-disclosure` | PASS (FTC-adequate) |
| Unsubscribe | `/unsubscribe` | PASS (utility) |
| Contact | `/contact` | PASS |
| Support | `/support` | PASS (now footer-linked) |

---

_Generated during the compliance audit on branch `claude/compliance-audit-docs-accessibility-yfxyk7`._
