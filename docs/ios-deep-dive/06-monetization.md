# 06 Monetization: subscriptions, paywall, StoreKit, ads, sponsored placements

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/`, `src/` or `.github/`.
Nothing Swift was compiled: the container has no Swift toolchain. Every StoreKit, SwiftUI and supabase-swift call
was checked against its definition in this repo or the iOS 17 SDK surface (`Product.PurchaseOption.appAccountToken`,
`.inAppPurchaseOptions`, `.onInAppPurchaseCompletion`, `FunctionsError.httpError`). The new XCTests have not been
run. The Deno suites touching this group were run (`npx deno test`, with deno.land/std mapped to jsr because the
proxy blocks deno.land): 61 passed, 0 failed.

## What the feature is

StoreKit 2 purchase, restore and `Transaction.updates`, validated server-side by `validate-ios-receipt` into
`user_subscriptions`; Free / Insider / VIP entitlements (`hasFeature`, `PremiumGate`, `PremiumFeature`); the
contextual `PaywallView`, the soft paywall and its frequency cap, `SubscriptionView`, the subscription and renewal
banners; and ads: `AdBannerView`/`AdSlot`, viewability, impression and click tracking, `get_active_ads`, affiliate
units, the interstitial and sponsored picks (`get-sponsored-pick`).

The audit found free permanent VIP for any signed-in account (`verify-apple-receipt` never asked Apple), one Apple
subscription unlocking any number of accounts, server rejections that could never revoke, purchases that never
reached the server, web trials reading as Free on iPhone, and every iOS ad impression refused by RLS. On the product
side: a storefront and paywalls selling features iOS does not have, Add to Calendar locked behind an "insider tips"
paywall that was a category template, two ad units per slot, a full-screen house paywall as the interstitial, and a
"free for 7 days" promise with no trial configured.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| M01 | done | `supabase/functions/verify-apple-receipt/index.ts` keeps its name and OPTIONS/401 handling, then answers 410 `{success:false, error:'deprecated', use:'validate-ios-receipt'}` with CORS. No Supabase client, no service role, no table access. It logs the caller's JWT `sub` (unverified, log-only) and `productId`. Test `supabase/functions/_tests/verify-apple-receipt-inert.test.ts`. |
| M02 | done | New `supabase/functions/_shared/appleOwnership.ts` (`decideAppleOwnership`) + `.test.ts` (7 cases). `validate-ios-receipt`: reads `txInfo.appAccountToken`, optional body `transfer`, stores Apple's `originalTransactionId` (not the client's), looks up other live iOS holders, answers 409 `owned_by_another_account` on refuse, cancels the other rows on transfer. `appstore-server-notifications-v2`: array lookup, one update over every matching row, row count in the log. iOS `StoreKitService`: `purchaseOptions(for:)`, purchases carry `.appAccountToken(userId)`, `ValidationPayload.transfer`, Restore is the only `transfer: true` caller. |
| M03 | done | `StoreKitService.ReceiptRejection`, `classifyValidationFailure(statusCode:body:)`, a `catch let FunctionsError` branch in `syncEntitlementToBackend`, `serverRejectionReason`. `SubscriptionView` shows "This subscription belongs to another account" for `.accountMismatch`. Server status codes unchanged. |
| M04 | done | `syncEntitlementsAfterSignIn(userId:)` (once per user per launch, never a transfer) and `shouldSyncAfterSignIn`. `AuthService` calls it for `.signedIn`/`.initialSession` in an un-awaited Task, so launch does not wait on Apple; it refreshes the backend tier itself after syncing. Cleared in `clearBackendTier()`. `PaywallView` shows the sign-in caption and a Sign in sheet when signed out, without blocking purchase. |
| M05 | done | `StoreKitService.handleCompletedPurchase(_:)`; `SubscriptionView` uses it in `onInAppPurchaseCompletion` and passes `.inAppPurchaseOptions` built from the signed-in user id. |
| M06 | done | `refreshBackendTier` reads `active`/`trialing`/`past_due` plus `current_period_end`, filtered by `isRowEntitled` (port of `isSubscriptionRowEntitled`, 14-day past_due grace). `parseTimestamp` handles fractional and whole seconds and strips microseconds as a last resort. |
| M07 | done | `AdTrackingService` sends impressions and clicks through `track-ad-event` (`TrackPayload`/`TrackResponse`). A failed send queues the row and keeps the dedupe key. `not_billable`/`automated`/HTTP 400 are dropped; everything else retries. Flush mints missing `client_event_id`s, sends at most 50 rows, and removes only sent or dropped keys from the live queue (`remainingAfterFlush`). `shouldShowAd` deleted. `CampaignAdService` sends `p_session_id` (`currentSessionId`) and `p_user_id`. `supabase/functions/_tests/client-contract.test.ts` gained a `track-ad-event` entry, which its own staleness check demanded once iOS called it. |
| M08 | done | `MainTabView`: `programmaticTabChange` (set only when the tab actually changes, so an unchanged deep link does not swallow the next tap), `shouldAskForInterstitial(isFree:programmatic:)`, fetch-then-present via `fullScreenCover(item:)`. `InterstitialAdView(campaign:)`: no house body, no store sheet, no fetch; Close is outside the fade; image or text layout; impression on viewability. |
| M09 | done | `AdBannerView` renders one unit: a renderable campaign (image or text card), else affiliate/house by `fallbackUnit(ordinal:hasAffiliate:)` (house every third slot, always when no affiliate). The unit is picked in `onAppear`, not in a `@State` initializer that would advance the counter on every parent redraw. `RestaurantsView` lost the ad above results. |
| M10 | done | `HouseAdCopy.context`; the house CTA opens `PaywallView(context:)`. Copy no longer sells advanced filters or device sync. `SubscriptionBanner` free-card copy updated. |
| M11 | done | `SubscriptionTier.features` and `SubscriptionView.featuresList` list only delivered features; VIP keeps unlimited Trip Planner and unlimited saved searches/alerts. `PremiumFeature.isOffered`; un-offered features get a neutral blurb ("See everything VIP includes.") instead of describing a feature that does not exist. `PaywallContext.advancedFilters` deleted; `.advancedFilters` maps to `.generic`. The free tier keeps "Weekly email digest" because iOS users can opt into it (`EmailPreferencesService`). |
| M12 | done | `Views/EventDetail/EventDetailInsiderTips.swift` deleted. `EventDetailActions` has no premium parameters; Add to Calendar is free. `EventDetailView` lost the tips block, the paywall sheet and the unused `storeKit`. `PaywallContext.insiderTips` deleted; onboarding bullets now say "Saved searches & event alerts". |
| M13 | done | `PaywallContext.favoritesProgress(used:limit:)`; `unlimitedFavorites` uses the real limit. `SoftPaywallService`: `present` only checks and posts (`favorites_soft` + `used`); `recordPresentation(source:)` writes the cap from the sheet's `onAppear`; `noteTripPlannerAttempt()` replaces `considerAfterTripPlannerAttempt`; `isEligible(defaults:isFree:now:)` is testable. `TripPlannerView` presents its own paywall. `MainTabView.softContext(for:userInfo:)`. `FavoritesLimitBanner` opens the progress context below the cap. |
| M14 | done | `PaywallView.initialTier(recommended:current:)`, a "You're on VIP" row instead of a dead CTA, disabled current-plan cards, "Recommended" hidden on the current plan, the Insider trip-quota subheadline, a products-failed row with Retry, a redacted price placeholder while loading, `infoMessage` for Ask to Buy, separate `isRestoring`. `ReviewsSection` sends signed-out users to sign-in, not the paywall. |
| M15 | done | `SubscriptionStatusBanner.visibleState(_:expiry:currentTier:now:)` and `dismissalKey(stateKey:expiry:)` (persisted in UserDefaults). "Resubscribe" replaces "See offer"; manage actions call `showManageSubscriptions()`. |
| M16 | done | `SubscriptionBanner.subscribedCard`: App Store subscribers get Apple's manage sheet; others get `PlanInfoSheet` (medium detent, no purchase controls or links). |
| M17 | done | `validate-ios-receipt` catch-all returns `reason: 'Internal server error'` with the computed `corsHeaders`. |
| M18 | done | `PremiumTokens.savingsFill` (#1E7B34). "Recommended" uses `urgencyFill` for Insider, "Save N%" uses `savingsFill`, `periodButton` uses `minHeight`, the period toggle stacks and the fine print moves into the scroll view at accessibility sizes, the 160pt bottom padding is gone. Renewal banner fills: `urgencyFill` and a darker red. |
| M19 | done | New `supabase/functions/_shared/sponsoredPickFilters.ts` (`centralToday`, `isEventStillOn`, `isRestaurantOpenForBusiness`, `buildReason`) + `.test.ts`. `get-sponsored-pick` uses the Central date, excludes merged/hidden/archived/past events and merged/closed restaurants, and captions "Sponsored · <Category>". Response shape unchanged. `SponsoredPickCard` presents `DeepLinkResolverView` (now internal) natively; `presentation(for:)` is testable. |
| M20 | done | `AdBannerView` and `InterstitialAdView` open advertiser links in `SafariView`. |
| M21 | done | `StoreKitService.isFreeTrialAvailable(for:)`. `OnboardingView` shows trial copy only when it is true (default false until StoreKit answers). `PaywallView.headline(for:hasTrial:)` / `subheadline(for:hasTrial:currentTier:)` drop the trial promise for onboarding without an eligible trial. |
| M22 | done | `PaywallView(onPurchased:)`, success haptic and "Welcome to <tier>" toast on purchase or restore. `TripPlannerView` sets a flag from `onPurchased` and re-runs `generate()` from the sheet's `onDismiss`, so the itinerary cover is not presented over a dismissing sheet. |

## Tests added or extended

- `DesMoinesInsiderTests/StoreKitTests.swift`: purchase options, six rejection classifications, sign-in sync gating, seven row-entitlement cases, timestamp parsing.
- `DesMoinesInsiderTests/AdsMonetizationTests.swift`: `TrackPayload` keys against the edge function, mid-flush enqueue survives, interstitial trigger, slot rotation, house copy and house contexts, sponsored pick native routing. The sponsored decode fixture no longer says "locals are loving".
- New `PaywallCopyTests.swift` (tier features, every preset and every `PremiumFeature.paywallContext` against the banned phrases; `initialTier`; onboarding headline), `SoftPaywallTests.swift`, `SubscriptionStatusBannerTests.swift`.
- Deno: `_tests/verify-apple-receipt-inert.test.ts`, `_shared/appleOwnership.test.ts`, `_shared/sponsoredPickFilters.test.ts`, all added to `.github/workflows/subscription-sync-tests.yml`.

## Deferred

- D03: a partial unique index on `user_subscriptions (apple_original_transaction_id) WHERE platform = 'ios'`. It would fail to build while duplicate rows exist; run the audit query below and clean up first.
- D06: VipGoldBadge shimmer (Reduce Motion) - the badge has no live consumer.
- `hasAppStoreSubscription` is read at sign-in; a device whose entitlements have not loaded at `.initialSession` now reloads them first, but a purchase that lands mid-launch still waits for the next sign-in or Restore.

## Rejected findings

- Move the interstitial trigger to detail dismissal: more churn than fixing the tab-change trigger.
- "`considerAfterFavorite` has no caller": `FavoritesService.swift:441` calls it.
- VIP as "Everything in Insider" only: the trip quota and saved-search cap are real differences, so they stay.
- House ads as fallback only: the affiliate service always fills, so house ads would never show; they rotate instead.
- Changing `WebView.swift` scheme handling for tel/sms: ad links now go to Safari instead.

## Open items and what a human must do

1. Deploy `verify-apple-receipt`, `validate-ios-receipt`, `appstore-server-notifications-v2` and `get-sponsored-pick`. No migration in this group.
2. Run this once against production and review the rows by hand (they may be grants from `verify-apple-receipt`; do not auto-cancel):
   `SELECT id,user_id,apple_transaction_id,platform,status FROM user_subscriptions WHERE apple_transaction_id IS NOT NULL AND (platform IS DISTINCT FROM 'ios') AND status IN ('active','trialing');`
3. Sandbox device check: buy through `SubscriptionView` and confirm one `validate-ios-receipt` 200 and the tier updates without a relaunch (M05); confirm the signed transaction carries `appAccountToken` and a second account on the same device gets the "belongs to another account" notice until it taps Restore (M02/M03).
4. Cross-group, not changed here: `validate-ios-receipt` and the App Store webhook write `status = 'expired'`, but the only CHECK on `user_subscriptions.status` (20251126000000) allows active/canceled/past_due/trialing/paused and no later migration relaxes it. If production matches, every expiry write fails. Check with `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.user_subscriptions'::regclass AND contype = 'c';`.
5. The onboarding trial only appears once the annual SKUs with a free-trial intro offer exist in App Store Connect; `Products.storekit` has none on the monthly SKUs.
