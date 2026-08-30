# App Review Notes — Des Moines Insider (IOS-COMPLY-005)

Source of truth for the App Review "Notes" field and "Sign-In Information"
when submitting a release through App Store Connect (or the `ios-native-release`
workflow with `submit_for_review: true`).

The machine-readable version that `fastlane deliver` uploads lives at
`ios/fastlane/metadata/review_information/notes.txt`. Keep the two in sync.

## Why this app needs careful review

Version 1.2.0 introduces two parallel monetization engines plus a large native
feature set. The review-sensitive surfaces are: Apple IAP subscriptions, the
business advertiser flow, and labeled sponsored/ad content.

## 1. Consumer subscriptions (Apple IAP)

- **Products:** Insider (`prod_U4oa7Cpn0bRnuo`, $4.99/mo) and VIP
  (`prod_U4oaGFEy12auTx`, $12.99/mo) in subscription group `21957951`.
  Annual SKUs and intro offers may also be present.
- **What they unlock (digital features for the purchasing user):** AI Trip
  Planner, saved searches + custom alerts, unlimited favorites, writing
  reviews, exclusive content, ad-free experience.
- **Compliance:** Sold exclusively via StoreKit. Restore Purchases + EULA +
  Privacy Policy links are on the subscription screen. We do **not** steer users
  to an outside purchase path for these memberships.
- **Cross-platform entitlement sync:** Subscriptions purchased on web/Android
  are recognized on iOS (`user_subscriptions`) so a user is never double-billed.
  This is entitlement *recognition*, not an alternate purchase flow.

## 2. Advertiser / "Promote" flow (Guideline 3.1.3(e) / 3.1.5(a))

- Entry points labeled "Promote your business" link out (in-app browser) to our
  **web advertiser portal**.
- This is a **B2B real-world advertising service** for local venues — not a
  digital good or in-app feature consumed by the end user — so it is correctly
  handled **outside** IAP. The end consumer using the app is never charged here.

## 3. Sponsored / ad content labeling

- Free-tier users see ads and sponsored placements; **paid subscribers see none**.
- All ad/sponsored content is clearly labeled:
  - Banner ads → an **"Ad"** tag.
  - Sponsored/featured listings and deals → a **"Sponsored"** badge.
  - VoiceOver announces these (e.g. "Sponsored content", "… advertisement").

## 4. Demo account for premium review

- Provide a **VIP demo account** in App Store Connect → App Review Information →
  Sign-In Information. **Do not commit real credentials to the repo.**
- The reviewer can exercise every gated feature with that account; StoreKit
  sandbox covers the purchase flow itself.

## 5. Accessibility & offline (IOS-COMPLY-003 / 004)

- VoiceOver, Dynamic Type to AX5, and Reduce Motion are supported app-wide.
- Every screen handles offline + error states (cached content + retry); no
  screen is a blank dead end without a network.

## Release checklist

- [ ] `MARKETING_VERSION` bumped in `ios/project.yml` (now `1.2.0`).
- [ ] Description / keywords / release notes updated in `ios/fastlane/metadata/`.
- [ ] Screenshots regenerated: `fastlane ios screenshots` (Home, Discover, Trip
      Planner, Paywall, Content hub via the `--uiTestScreen` deep links).
- [ ] Demo VIP account entered in App Store Connect Sign-In Information.
- [ ] Release cut via the **`ios-native-release`** GitHub Actions workflow
      (`workflow_dispatch`), version input `1.2.0`. Set `submit_for_review: true`
      when ready to submit.
