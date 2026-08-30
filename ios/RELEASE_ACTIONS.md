# iOS Release — Action Required

Manual / out-of-band steps that the **iOS Layout & Monetization** work
(`claude/prd-stories-ios-gaps-4gesH`) depends on. Code is in place; these are the
things a human has to do in App Store Connect / deploy consoles before the
features work in production. Check each off as part of the release.

> Most PRD stories stay `passes:false` until the macOS CI `xcodebuild` gate is
> green — that's expected CI, not a manual step. The items below are the ones
> CI **cannot** do for us.

---

## 1. App Store Connect — Annual subscriptions + free trial (IOS-SUB-012) — **BLOCKING**

The annual plans and 7-day trial are wired in code + `Products.storekit`, but the
real products must exist in App Store Connect or annual purchases will fail to
load (and `validate-ios-receipt` will reject unknown IDs).

In **App Store Connect → Subscriptions → "Des Moines Insider Premium" group
(ID `21957951`)** create two auto-renewable subscriptions:

| Plan | Product ID (exact) | Duration | Price | Intro offer |
|---|---|---|---|---|
| Insider Annual | `prod_insider_annual` | 1 year | $49.99 | 7-day free trial |
| VIP Annual | `prod_vip_annual` | 1 year | $129.99 | 7-day free trial |

Steps:
1. Create each subscription with the **exact** Product ID above. (Or, if ASC
   forces a different ID, update the constants in
   `Services/StoreKitService.swift` → `insiderAnnualID` / `vipAnnualID` **and**
   `Resources/Products.storekit` **and** the `INSIDER_PRODUCT_IDS` /
   `VIP_PRODUCT_IDS` sets in both edge functions — all four must agree.)
2. Set duration = 1 year, prices = $49.99 / $129.99 (≈17% off monthly×12).
3. Add an **Introductory Offer → Free → 7 days** to each (one per customer;
   eligibility is enforced by StoreKit automatically).
4. Add localized display name + description, submit for review with the build.

The IDs are mirrored in **four** places — keep them in sync:
`StoreKitService.swift`, `Products.storekit`,
`supabase/functions/validate-ios-receipt/index.ts`,
`supabase/functions/appstore-server-notifications-v2/index.ts`.

## 2. Deploy the updated edge functions (IOS-SUB-012) — **BLOCKING for annual**

The annual product IDs were added to the App Store receipt/webhook handlers.
Redeploy so annual purchases validate and webhooks resolve tier:

```bash
supabase functions deploy validate-ios-receipt
supabase functions deploy appstore-server-notifications-v2
```

## 3. Win-back & promotional offers (IOS-SUB-014) — config + backend signing

The in-app pieces are done: an **offer-code redemption** entry in Settings
(`.offerCodeRedemption`), a **renewal/win-back banner** (expiring / billing-retry
/ grace / expired) that deep-links to Apple subscription management or the
win-back paywall, and analytics. To make the actual *discounted* offers
redeemable you still need:

1. **App Store Connect:** create the offers on the annual subscriptions —
   - **Offer codes** (for the Settings redemption sheet) — works as soon as the
     codes exist; no app change needed.
   - **Promotional offers** (e.g. "winback50" — 50% off the first year) for
     lapsed users.
   - **Win-back offers** (iOS 18+) shown automatically by the App Store.
2. **Backend signing (promotional offers only):** promotional offers must be
   redeemed with a server-generated signature passed as
   `Product.PurchaseOption.promotionalOffer(offerID:signature:)`. Add a Supabase
   edge function that signs (keyID, nonce, timestamp) with the subscription key,
   then have the win-back paywall request + apply it. **Until that endpoint
   exists, the win-back paywall sells the standard product** (still recovers the
   user, just without the discount).
3. **iOS 18 win-back offers** need no signing — the system surfaces them. Our
   deployment target is iOS 17, so they only show for iOS 18+ users.

## 4. Analytics — Firebase not yet wired (IOS-SUB-010)

The contextual paywall logs `paywall_present / dismiss / purchase_start /
purchase_complete / restore` (each with the surface `context` id) via
`AnalyticsService`, **but** that service is still a local-logging facade
(`AppLogger`) — Firebase isn't integrated yet. To actually capture per-surface
conversion data, complete the Firebase setup described at the top of
`Services/AnalyticsService.swift` (add the SPM package, `GoogleService-Info.plist`,
uncomment the `Analytics.logEvent` calls, update `PrivacyInfo.xcprivacy`). No
call-site changes needed — the events already fire.

## 5. Verify hosted legal pages (IOS-SUB-010)

The paywall links to `https://desmoinesinsider.com/terms` and
`/privacy-policy` (Apple requires functional Terms/EULA + Privacy links on any
IAP screen). Confirm both resolve before submission.

---

## Known caveats / optional follow-ups (non-blocking)

- **Favorites-cap cold-start race (IOS-SUB-011):** `StoreKitService.currentTier`
  can read `.free` for a moment on launch before backend entitlements resolve,
  so a premium user saving a 4th favorite in that first instant could see the
  upgrade paywall once (clears on retry). Tune by gating
  `FavoritesService.enforceFavoritesCap()` behind an "entitlements loaded" flag
  if it proves noticeable.
- **Quota features awaiting their screens:** Saved searches / alerts
  (IOS-PARITY-008) and the AI Trip Planner quota (IOS-PARITY-001) have their
  `PremiumFeature` entries, per-tier limits, and quota helpers ready, but can't be
  enforced until those screens exist. See `Models/PremiumFeature.swift`.
- **DeepLinkHandler test drift (from IOS-IA-002):** `DeepLinkHandlerTests.swift`
  predates a handler refactor (wrong scheme/label) and can't compile against the
  current implementation — needs a dedicated chore to reconcile.
