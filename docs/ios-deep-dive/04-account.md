# 04 Account: auth, profile, settings, onboarding, consent, deletion

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `src/`.
Nothing here was compiled: the container has no Swift toolchain. Every SDK call was checked against
supabase-swift 2.55 source (`AuthResponse.session`, `resend(email:type:)`, `update(user:)`,
`UserAttributes(password:)`, `upsert(_:onConflict:returning:count:ignoreDuplicates:)`,
`FunctionsError.httpError(code:data:)`), and the new XCTests have not been run.

## What the feature is

Email sign-in and sign-up plus Apple Sign-In, email verification, password reset, session handling,
the biometric lock, the admin session timeout, Keychain storage, profile editing, Settings
(notifications, consent, subscription, offer codes, appearance, delete account), first-launch
onboarding and the EU consent screen.

The audit found that every email sign-up showed an error for an account that had just been created,
and dropped the interests and the email opt-in on the way. An unconfirmed user hit a dead end:
there was no way to resend, and the attempt counted toward the lockout. A reset link signed the user
in but never let them set a password. The session timeout reset itself on every token refresh, raced
the auth listener at launch, and signed ordinary browsers out after an hour. The biometric lock could
be skipped by a race at launch, the app-switcher snapshot showed content, and cancelling the prompt
counted as a failure. Deletion hid the server's refusal reason and never mentioned an App Store
subscription. Clearing a profile field didn't clear it on the server. The interest vocabulary didn't
match the web's and ranked nothing. The consent toggles didn't redraw, and "Email Communications"
wrote a key nothing read. On the server, a user could rewrite `profiles.email` and
`stripe_customer_id` on their own row.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| ACC-01 | done | `AuthService.signUp(email:password:firstName:lastName:interests:emailOptIn:) -> SignUpOutcome` (`.signedIn` when a session came back, else `.checkInbox`, which also covers a reused address). Sends `interests` (normalized ids) and `consent.email_marketing_consent` in the metadata for `handle_new_user`. `createProfile` is gone. `updateProfile` upserts a seed row (`ignoreDuplicates`) only when no profile was fetched. The sign-up form drops the interest chips and adds "Email me weekly Des Moines picks" (off). The view model sets `ConsentService.emailConsent` on success. |
| ACC-02 | done | `SessionTimeoutService`: admin-only. The new `startTracking(isAdmin:resetClock:)` stops tracking for regular users, and the clock resets only on `.signedIn`. Also new: `updateRole(isAdmin:)` for token refreshes, `expireIfStaleOnLaunch()`, `noteForeground()` (check before recording), and `recordActivity` is a no-op when not tracking. The listener runs the stale check first on `.initialSession` and sets `launchSignOutMessage`. The launch `.task` check is deleted, and the "Signed Out" alert shows either message. |
| ACC-03 | done | New `Models/InterestCatalog.swift` (`InterestOption`, `all`, `normalize`, `label(for:)`, `option(for:)`). `AuthViewModel.availableInterests` removed. The profile loads normalized ids and saves ids only. Unknown ids get their own chip. `UserProfile.preview` uses ids. |
| ACC-04 | done | New `Services/InterestPreferences.swift` (`onboarding_interests_v1`). Onboarding is now Welcome, then "What are you into?", then the trial. The two static pages are gone. The interest step has a chip grid with a haptic and the selected trait, and its button reads "Skip" until something is picked. Page, interest and trial bodies are in `ScrollView` with `.scrollBounceBehavior(.basedOnSize)`, the logo and hero icon are `@ScaledMetric` and capped, and the checkmarks are hidden from VoiceOver. On `.signedIn` the listener copies the local picks to a fetched profile that has none (`updateInterests`). `ForYouService` reranks Trending with `InterestCatalog.rerank`. `recommendationReason` is now `var`. |
| ACC-05 | done | `awaitingBiometric` starts as `BiometricAuthService.shared.isEnabled` and clears once auth settles signed out. It locks on `.background`, and a `PrivacyCoverView` covers the root while the scene is not active. `BiometricAuthService.evaluate(reason:policy:) -> Outcome` defaults to `.deviceOwnerAuthentication` (passcode fallback). The "Use Password" cancel title is gone. `countsAsFailure` counts only `.failed`, and `authenticate` wraps `evaluate`. The lock screen auto-prompts once per foreground, only while active, and its copy reads "Unlock with Face ID or your passcode". The Settings Security section shows when available or enabled. |
| ACC-06 | done | New `Services/AuthErrorMapper.swift` (`AuthFailure`, `classify`, `message(for:mode:)`). `AuthService.resend(email:)` is on `AuthProviding`. "Email not confirmed" sets `pendingVerificationEmail` and doesn't count toward the lockout. `resendVerification()` has a 60 s cooldown. `AuthView` shows a "Check your inbox" panel with Resend, Open Mail and Use a different email. The Check Your Email alert no longer dismisses while an address is pending. |
| ACC-07 | done | New `Views/Auth/SetNewPasswordView.swift`. `AuthService`: `needsPasswordReset`, the `pending_password_recovery_at` marker written by `resetPassword`, `noteAuthCallback` (called in `onOpenURL` before `handle`), `static isRecoveryCallback(url:markedAt:now:)`, `.passwordRecovery` handling, `updatePassword`, `dismissPasswordReset`. The flag clears on password sign-in and on sign-out. It's routed after the biometric gate. `AuthViewModel.strength(of:)` and `PasswordStrengthBar` are internal. |
| ACC-08 | done | `AccountDeletionService`: `DeletionError.server(status:code:message:)` from `decodeFailure`, `offersManageSubscription`, `ConfirmResponse` with `complete` and `store_subscriptions_still_active`, `DeletionResult`, `notice(for:)`, `confirmationMessage`, and `confirmIdentity()` (passcode/biometric re-auth; cancel aborts silently, no passcode proceeds). `StoreKitService.hasAppStoreSubscription` and `showManageSubscriptions()`. Both confirmation alerts gain the Apple billing sentence and Manage Subscription. A post-deletion notice shows when the server lists live store subscriptions. The billing-teardown refusal (409 BILLING_TEARDOWN_FAILED) offers Manage Subscription (web `/subscription`) instead of Try Again; the transient 503 SUBSCRIPTION_LOOKUP_FAILED keeps Try Again. The Settings sections are now "Account" and "Delete Account", the second with a footer. |
| ACC-09 | done | `ProfileUpdate` is top level in `AuthService.swift` and encodes every key (nil as null, interests `[]`). `loadProfile` empties the form when there's no profile, and there's a snapshot and `isDirty`. Save is disabled unless dirty and reloads after saving, with a "Profile saved" toast and haptic replacing the alert. `ProfileView` reloads on `isAuthenticated` changes, and Interests sits above Personal Info. |
| ACC-10 | done | New `Services/EmailPreferencesService.swift` (`load`, optimistic `setWeeklyDigest` with rollback, `static decode`, `reset` on sign-out). Settings shows "Weekly picks email" for signed-in users with the requested footer, plus the new Location footer. On `.signedIn` the listener syncs an earlier EU email opt-in once per account (marker `email_consent_synced_v1.<uid>`). |
| ACC-11 | done | `ConsentService` getters call `access(keyPath:)` and setters wrap `withMutation(keyPath:)`. Settings binds `$consent.x` from `@State consent`. The app file's `consentCompleted` workaround stays. |
| ACC-12 | done | `supabase/migrations/20261010000001_profiles_guard_protected_columns.sql`: `guard_profile_protected_columns()` trigger, BEFORE INSERT OR UPDATE. Nested triggers, non-`authenticated`/`anon` roles and admins pass. UPDATE refuses changes to email, stripe_customer_id and the lifecycle/churn/reengage columns (jsonb compare). INSERT refuses a foreign email or any stripe_customer_id. The writer grep ran: create-campaign-checkout and the agent functions all use `SUPABASE_SERVICE_ROLE_KEY`. `check-migrations-parse` passes (447 files), and `check-migration-drift` reports only the baseline. |
| ACC-13 | done | `checkAdminRole` decodes `[RoleRow]` with `static isAdmin(roles:)`. An error or no rows falls back to `profiles.user_role`, and no profile means false. |
| ACC-14 | done | `.environment(\.colorScheme, .dark)` on VerifyEmailView, LaunchScreenView, BiometricLockView, ConfigurationErrorView and PrivacyCoverView. The banner is black on orange with a `ViewThatFits` two-line fallback and a VoiceOver announcement. |
| ACC-15 | done | `AuthView(isModal:)` gets a Cancel button, and MainTabView's sheet passes true. The error alert title follows the mode. The Apple button is white in dark mode (`.id(colorScheme)` to rebuild). Forgot Password with no valid email sets an inline `emailFieldHint` and focuses the field. |
| ACC-16 | done | An Appearance picker in Settings General, bound to `@AppStorage("themeMode")`. `ThemeMode` was already `CaseIterable` with `displayName`; it has four cases (System, Light, Dark, OLED). |

Deviations, all deliberate:

- ACC-01: sign-up and reset errors also go through `AuthErrorMapper`, not only sign-in. The
  unclassified case still passes the server text, so "Password should contain..." still reads.
- ACC-02: `isSessionValid()` treats data without the admin flag as valid, so a regular user whose
  older build left timestamps is not signed out on the first launch of this one.
- ACC-04: the interest page's secondary "Skip" (skip all onboarding) stays next to the primary
  "Skip". The web ids and labels come from `src/lib/interests.ts`, and the "Because you like X" word
  is the label's first word.
- ACC-05: enabling Face ID in Settings still evaluates biometrics only
  (`.deviceOwnerAuthenticationWithBiometrics`); a passcode shouldn't turn on Face ID.
- ACC-07: `SetNewPasswordView` has its own `validationMessage` with the sign-up rules rather than
  reusing `AuthViewModel.signUp`'s guards. Its success toast goes through `AppToastCenter` because the
  view disappears as soon as the flag clears.
- ACC-08: ProfileView's post-deletion alert is on the outer `Group`, since the signed-in `List` is
  gone by the time it shows. The notice says "billed by Apple" only when an `ios` row is listed.
- ACC-13: an empty `user_roles` result falls back to the profile column, as `.single()`'s error did.

## Tests added or extended

New: `InterestCatalogTests` (web ids, normalize, labels, `rerank` order and reasons),
`InterestPreferencesTests`, `AuthErrorMapperTests`, `BiometricPolicyTests`, `SessionTimeoutTests`
(regular user untracked, refresh keeps the clock, sign-in resets it, legacy data is not an expiry;
skips without a writable keychain), `AccountDeletionTests` (409/503 decode, fallback copy,
`ConfirmResponse`, notice), `ProfileUpdateEncodingTests`, `EmailPreferencesTests`.

Extended: `AuthRoutingTests`. `FakeAuth` returns a configurable `SignUpOutcome`, records the
interests and opt-in it was given, and gains `resend`. New cases cover check-inbox, signed-in, the
interest ids sent, email-not-confirmed staying out of the lockout, resend plus cooldown, and the
Forgot Password hint. The existing sign-in, reset and forgot-password assertions now expect the
mapped copy. `AuthTests` gains the recovery-callback and `isAdmin(roles:)` cases, and
`ConsentServiceTests` gains `testSettingConsentNotifiesObservers`. None of this has been run.

Not unit-tested (views, listeners, network): the auth listener paths, the lock and privacy cover,
onboarding, SetNewPasswordView, the deletion alerts, the email-preference round trip. Check them in
the simulator, in particular a PKCE reset link end to end, since whether the SDK emits `.signedIn`
or `.passwordRecovery` for it was not verified.

## Deferred

- ACC-D2: server-side re-authentication for deletion (a v2 `delete-user-account` contract).
  The client re-auth here is a device check only.
- ACC-D4: an interest boost inside `get_personalized_recommendations`. The rerank is client-side
  and only touches the Trending fallback.
- ACC-D6: the onboarding trial step's placement and copy (a Monetization decision). It's unchanged.
- Android `createProfile` after sign-up has the same 23505 / RLS failure as ACC-01 (Platform, not
  this group). The new guard trigger does not change that: its email equals the auth email.

## Rejected

- ACC-02 sub-point "keep biometric on timeout sign-out": signOut's `KeychainService.deleteAll()` wipes
  the flag anyway, and only admins time out now.
- ACC-06 sub-claim that email links go to the site URL: `SupabaseService.swift:48` sets
  `redirectToURL` to `<bundleId>://auth-callback`.
- ACC-10 Location half as stated: `locationConsent` does gate the one third-party location share
  (open-meteo); only its footer changed.
- ACC-12 `referral_code` in the guard list: the referral RPC (20261006000002) writes it as the user.
- ACC-15 interest-chip hit targets on the sign-up form: the chips are gone (ACC-01).

## What a human must do

1. Run the iOS test target (`xcodegen`, then the DesMoinesInsiderTests scheme). Nothing here has been
   compiled.
2. Apply `supabase/migrations/20261010000001_profiles_guard_protected_columns.sql`
   (`supabase db push`). Then run the psql check in its header: an `authenticated` UPDATE of
   `stripe_customer_id` must raise, and a `service_role` UPDATE of `lifecycle_stage` must pass.
   Before applying, confirm no admin tool edits `profiles.email` as a non-admin role.
3. On a device, run through: sign up (confirmation on) and check that the profile has the onboarding
   interests and `user_email_preferences.weekly_digest_enabled` matches the toggle; sign in
   unconfirmed, then Resend; Forgot Password, open the link on the phone, set a password; enable
   Face ID, background the app, and check the app switcher shows the cover.
4. Existing regular users who had timeout timestamps in the Keychain are not signed out; the data
   is cleared on their next `.initialSession`. No action needed, but expect no "Signed Out" alerts
   for non-admins after this ships.
