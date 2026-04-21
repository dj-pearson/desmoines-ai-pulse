# Google Play Store Submission Packet — Des Moines Insider

**App**: Des Moines Insider
**Package**: `com.desmoines.aipulse`
**Version**: 1.0.0 (versionCode 1)
**AAB**: `android/app/release/app-release.aab`
**Category**: Travel & Local
**Target SDK**: 35 / Min SDK: 26
**Last updated**: 2026-04-21

---

## 0. Submission order (do it in this order)

1. Complete **Policy → App content** (every row in §3)
2. Complete **Grow users → Store presence → Main store listing** (§4) and **Store settings** (§5)
3. Create **Subscriptions** in Monetize with Play (§6)
4. Enroll in **Play App Signing** on first AAB upload; back up the keystore (§7)
5. Add the Play-issued signing SHA-1 to Firebase + Google Cloud OAuth client (§7)
6. Upload AAB to **Internal testing** first; fix any Pre-launch report issues (§8)
7. Promote to Closed/Open/Production per your checklist
8. Submit for review

Items marked **[BLOCKING]** will stop Google review until completed.

---

## 1. Basic app info (Play Console → Dashboard)

| Field | Value |
|---|---|
| App name | Des Moines Insider |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | Free (with in-app subscriptions) |
| Declaration – contains ads | No |

---

## 2. App signing & identity

| Field | Value |
|---|---|
| Package name | `com.desmoines.aipulse` |
| Signing keystore | `des-moines-insider.keystore` (repo root) |
| Keystore base64 backup | `keystore-base64.txt` (repo root — move to password vault before release) |
| Play App Signing | **Enroll on first AAB upload (recommended)** |
| Upload key SHA-1 | Run `keytool -list -v -keystore des-moines-insider.keystore` to get — needed for Firebase + Google Cloud OAuth |
| Play App Signing SHA-1 | Google will generate after enrollment — **MUST be added to Firebase + Google Cloud OAuth client or Google Sign-In and FCM break on Play-installed builds** |

---

## 3. App content (Policy → App content) — [BLOCKING]

Every row below must be completed before Google will review a production release.

### 3.1 Privacy policy
- **URL**: `https://desmoinesinsider.com/privacy-policy`
- Must be publicly accessible (no login wall), include the app name, and describe every data type listed in §3.8.

### 3.2 App access
- Selection: **All or some functionality is restricted**
- Reason: Login required for Favorites, Profile, and Subscriptions
- **Reviewer credentials to provide**:
  - Email: `_______________________` (create a dedicated test account)
  - Password: `_______________________`
  - Instructions: "Launch app → tap Profile tab → Sign in with the provided email and password. Favorites, subscription tier, and settings will be visible."

### 3.3 Ads
- Selection: **No, my app does not contain ads**

### 3.4 Content rating (IARC questionnaire)
Answers for the questionnaire — expect IARC to return **Everyone (3+)**:

| Question | Answer |
|---|---|
| Does your app contain violence? | No |
| Sexuality / nudity? | No |
| Profanity or crude humor? | No |
| Controlled substances (drugs/alcohol/tobacco references)? | Possible – Restaurants may list alcohol serving → answer **Yes, references** |
| Simulated gambling? | No |
| User-generated content shared with other users? | Yes – ratings and reviews on restaurants/events |
| Users interact / share personal info? | Yes – profile + reviews |
| Shares user's physical location with other users? | No |
| Allows purchases of digital goods? | Yes – subscription (Insider / VIP) |
| Unrestricted web access (in-app browser)? | **Answer based on your WebViewScreen** – if WebView only loads privacy/terms URLs you control → No; if it loads arbitrary external pages → Yes |

### 3.5 Target audience and content
- **Target age group**: 18 and over (simplest — avoids Families policy)
- If you select 13+, you trigger additional ads-to-minors restrictions; avoid unless you have a business reason
- Appeals to children: **No**

### 3.6 News app
- **No**

### 3.7 COVID-19 contact tracing
- **No**

### 3.8 Data safety form
Complete this in Play Console. Declarations based on current dependencies (Supabase Auth, Google Sign-In, Google Play Billing, Google Maps, Firebase Messaging):

**Data collected:**

| Data type | Collected | Shared with 3rd parties | Linked to user | Optional/Required | Purpose |
|---|---|---|---|---|---|
| Email address | Yes | No | Yes | Required | Account management, App functionality |
| Name (from Google Sign-In) | Yes | No | Yes | Optional | Account management |
| User IDs (Supabase UID) | Yes | No | Yes | Required | Account management, App functionality |
| Approximate location | Yes | No | No | Optional | App functionality (nearby results) |
| Precise location | Yes | No | No | Optional | App functionality (distance, map) |
| Purchase history | Yes | Yes (Google Play Billing) | Yes | Required | App functionality (subscription tier) |
| App interactions | Yes | No | Yes | Optional | Analytics, App functionality (favorites) |
| Search history (in-app) | Yes | No | Yes | Optional | App functionality |
| Crash logs | Yes | Yes (Firebase) | No | Optional | Analytics, App performance |
| Diagnostics | Yes | Yes (Firebase) | No | Optional | Analytics, App performance |
| Device or other IDs (Advertising ID, FCM token) | Yes | Yes (Firebase) | Yes | Required | Analytics, Communications (push) |

**Security practices:**
- Data is encrypted in transit: **Yes** (HTTPS everywhere — Supabase, Firebase, Google APIs)
- Users can request data deletion: **Yes** (Profile → Settings → Delete Account)
- Developer follows Google Play Families Policy: N/A (target is 18+)
- Committed to Play's Data Safety standards: **Yes**

### 3.9 Advertising ID
- Uses Advertising ID: **Yes**
- Purposes: **Analytics** and **Communication (push notifications)** — NOT advertising or ad personalization

### 3.10 Government apps
- **No**

### 3.11 Financial features
- **No** (in-app subscriptions do not count as financial features here)

### 3.12 Health
- **No**

### 3.13 Actors & roles (EU DSA trader status) — required for EU distribution
- Trader status: **Trader** (business selling subscriptions)
- Legal entity name: `_______________________`
- Registered address: `_______________________`
- Contact email: `_______________________`
- Contact phone: `_______________________`
- Without this, EU distribution is blocked.

---

## 4. Main store listing (Grow users → Store presence → Main store listing)

### 4.1 Text

**App name** (≤30 chars):
```
Des Moines Insider
```

**Short description** (≤80 chars — 79 chars used):
```
Events, restaurants, and hidden gems in Des Moines — curated daily by AI.
```

**Full description** (≤4000 chars):
```
Des Moines Insider is your AI-powered guide to everything happening in Iowa's capital city. From the best new restaurant openings to tonight's live music, weekend festivals to family-friendly attractions — we surface what's worth your time.

WHAT YOU'LL FIND

• Events — Concerts, festivals, shows, classes, markets, sports, and free things to do, updated every day. Filter by date, category, neighborhood, or price.

• Restaurants — Hundreds of Des Moines restaurants with menus, hours, cuisine, dietary options, ratings, and photos. Find what's open now, what's nearby, or the best brunch spots on a Sunday.

• Attractions — Museums, parks, trails, breweries, art galleries, and local landmarks across the metro.

• Nearby & Map View — See everything near you, get directions with one tap, and plan your route.

• AI Trip Planner — Tell us the vibe ("date night under $50," "rainy Saturday with kids") and we'll build you an itinerary.

• Favorites & Reminders — Save places and events, get reminders before they start, and build your own Des Moines list.

• Smart Search — Ask naturally: "pizza open late," "live music this weekend," "free things to do downtown."

INSIDER & VIP SUBSCRIPTIONS

Free forever for browsing and discovery. Upgrade to Insider or VIP for unlimited favorites, event reminders, saved searches, early access to featured openings, and ad-free browsing.

• Insider — Unlimited favorites, event alerts, and saved searches
• VIP — Everything in Insider plus priority support, early event access, and exclusive local partner perks

Subscriptions auto-renew monthly or annually unless cancelled at least 24 hours before the renewal date. Manage or cancel anytime in Google Play → Subscriptions.

WHY DES MOINES INSIDER

Built by locals, powered by AI. Unlike national apps, we actually know the difference between East Village and Valley Junction, and we only cover what's happening inside Polk, Dallas, Warren, and surrounding counties. Every event and restaurant is verified, categorized, and refreshed daily.

LOCATIONS COVERED

Des Moines, West Des Moines, Ankeny, Urbandale, Clive, Waukee, Johnston, Altoona, Pleasant Hill, Windsor Heights, Norwalk, Indianola, and surrounding metro areas.

Privacy policy: https://desmoinesinsider.com/privacy-policy
Terms of service: https://desmoinesinsider.com/terms
Support: support@desmoinesinsider.com
Website: https://desmoinesinsider.com
```

### 4.2 Graphic assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, no transparency | **TODO** — export from `DMI-Logo.psd` |
| Feature graphic | 1024×500 PNG or JPG, no transparency, no critical content in outer 10% | **TODO** — `generate_feature_graphic2.py` exists in repo, verify it's current |
| Phone screenshots | 2–8 images, 16:9 or 9:16, min 320 px, max 3840 px, PNG or JPG | **TODO** — capture on Android emulator, **cannot reuse iOS screenshots** |
| 7" tablet screenshots | Optional, 1–8, same specs | Recommended |
| 10" tablet screenshots | Optional, 1–8, same specs | Recommended for better ranking |
| Promo video (YouTube URL) | Optional | Skip for v1 |

**Screenshot shot list** (matches your iOS set — capture at 1080×2400 on Pixel 7 emulator):
1. Home screen (hero + featured events/restaurants)
2. Restaurants list
3. Search results
4. Map view
5. Favorites
6. Profile / Subscription
7. Event detail
8. Restaurant detail

**Capture tips**:
- Use release build, not debug
- Use demo data that looks good (no "TEST EVENT" strings)
- Turn off developer options (no debug overlays)
- Use status bar with full signal, full battery, clean clock — emulator flag `-show-kernel=false`, `adb shell settings put global sysui_demo_allowed 1`

---

## 5. Store settings (Grow users → Store presence → Store settings)

| Field | Value |
|---|---|
| App or game | App |
| Category (primary) | **Travel & Local** |
| Category (secondary) | News & Magazines (optional) |
| Tags (up to 5) | Travel, Events, Restaurants, Maps & Navigation, Local |
| Store listing contact – email (public) | `support@desmoinesinsider.com` |
| Store listing contact – phone | (optional) |
| Store listing contact – website | `https://desmoinesinsider.com` |
| External marketing | Allow Google to promote outside Play |

---

## 6. Monetization (Monetize with Play → Products → Subscriptions) — [BLOCKING for billing flows]

You must create subscription products **before** testing in-app purchases or publishing any release that references them.

### 6.1 Subscription products to create

| Product ID | Base plan | Price | Grace period | Account hold |
|---|---|---|---|---|
| `com.desmoines.aipulse.insider.monthly` | Auto-renewing, P1M | $_____ | 3 days | 30 days |
| `com.desmoines.aipulse.insider.annual` | Auto-renewing, P1Y | $_____ | 3 days | 30 days |
| `com.desmoines.aipulse.vip.monthly` | Auto-renewing, P1M | $_____ | 3 days | 30 days |
| `com.desmoines.aipulse.vip.annual` | Auto-renewing, P1Y | $_____ | 3 days | 30 days |

> Verify the exact product IDs match the constants defined in `android/app/src/main/java/.../SubscriptionScreen.kt` and your BillingClient setup. Play Billing will error if they don't.

### 6.2 Real-content review assets (per product)
For each product, upload:
- Screenshot showing the paywall + what the user unlocks
- Screenshot showing the feature working after purchase
- Short description of the benefit

Without these, Google will reject the subscription submission.

### 6.3 Server-side validation (per PRD task 584)
- Supabase Edge Function: `validate-android-purchase`
- Requires secret: `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`
- Uses Google Play Developer API v3 (`androidpublisher`)
- Create the service account in Google Cloud, grant "Finance" + "View financial data" in Play Console → Users and permissions

### 6.4 Tax & compliance
- Tax category: **Digital services (standard)**
- Play handles VAT/sales tax collection in most countries

---

## 7. App signing & security setup

### 7.1 Play App Signing enrollment
- Enroll when you upload the first AAB (select "Use Play App Signing")
- Google generates the **app-signing key**; your `des-moines-insider.keystore` becomes the **upload key**

### 7.2 Critical: add the Play App Signing SHA-1 to Firebase + Google Cloud OAuth
After enrollment, Play Console shows a new SHA-1 under App integrity → App signing. Add it here:

1. **Firebase Console** → Project Settings → Android app → Add fingerprint → paste Play App Signing SHA-1
   - Re-download `google-services.json` and replace `android/app/google-services.json`
   - Rebuild and upload a new AAB
2. **Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client (Android) → add Play App Signing SHA-1
   - Without this, Google Sign-In will fail on Play-installed builds only (debug builds work — classic trap)

### 7.3 Keystore backup
Move these out of the repo to a password manager / secure vault before launch:
- `des-moines-insider.keystore`
- `keystore-base64.txt`
- Keystore password, key alias, key password (store in 1Password / Bitwarden)

Losing the upload keystore means you can reset it via Play Console (email support with the current AAB). Losing the app-signing key (if you used legacy JKS signing instead of Play App Signing) means you can never update the app again.

---

## 8. Testing strategy

### 8.1 Internal testing (first — recommended)
- Path: Release → Testing → **Internal testing** → Create new release
- Up to 100 testers, instant rollout, **no Google review**
- Add testers by email (personal Gmail accounts, not @desmoinesinsider domain — Play prefers consumer Gmails for realism)
- Use this to verify:
  - Google Sign-In works against Play App Signing SHA-1
  - Subscription purchase flow end-to-end (use a test account enrolled as a license tester)
  - Push notifications (FCM) are received
  - Deep links from web / other apps open the right screen
  - App doesn't crash on Pixel 4a (minSdk 26 coverage)

### 8.2 Closed testing (your checklist)
- Up to thousands of testers via Google Groups or email lists
- **Google does review** closed test releases
- Use this for broader beta before production

### 8.3 Open testing
- Anyone can join via Play Store listing
- Useful for last-mile feedback
- Feedback does not affect public rating

### 8.4 Pre-launch report
Automatically runs when you upload to any track. Check:
- **Stability**: No crashes on robo-tested devices
- **Accessibility**: No WCAG violations flagged
- **Security & trust**: No insecure webview, no SSL errors
- **Performance**: Startup time, frame pacing

Fix any red items before promoting to production.

---

## 9. Permissions declarations (in AndroidManifest.xml)

Expected permissions based on current dependencies. Play will require a justification for each sensitive one.

| Permission | Sensitive? | Justification to provide |
|---|---|---|
| `INTERNET` | No | Core networking |
| `ACCESS_NETWORK_STATE` | No | Detect offline for cache fallback |
| `ACCESS_FINE_LOCATION` | **Yes** | "Show nearby events and restaurants, calculate distance, and display the user's position on the map. Used only in-session while the user views map or nearby results. Not used in background." |
| `ACCESS_COARSE_LOCATION` | **Yes** | Same as above; used when precise location is not granted |
| `POST_NOTIFICATIONS` (API 33+) | **Yes** | "Send event reminders and subscription status notifications that the user has opted in to." |
| `BILLING` | No | Google Play Billing (automatic) |
| `USE_BIOMETRIC` / `USE_FINGERPRINT` | Low | Biometric unlock for Profile/Settings (via androidx.biometric) |

**Do NOT declare** — these each trigger an extra Play policy review and you don't need them:
- `ACCESS_BACKGROUND_LOCATION`
- `MANAGE_EXTERNAL_STORAGE` / `ALL_FILES_ACCESS`
- `QUERY_ALL_PACKAGES`
- SMS / Call Log permissions

---

## 10. Countries & regions

Launch recommendation:
- **Phase 1 (launch)**: United States only — avoids EU DSA trader form delay
- **Phase 2 (after 30-day stability)**: Canada, United Kingdom, Australia, New Zealand
- **Phase 3**: EU — requires completed DSA trader declaration (§3.13)

---

## 11. Release notes (for first rollout)

**What's new — v1.0.0**:
```
Welcome to Des Moines Insider — your AI-powered guide to the best events, restaurants, and attractions in the Des Moines metro.

• Discover thousands of local events updated daily
• Browse hundreds of restaurants with menus, hours, and ratings
• Use the AI Trip Planner to build personalized itineraries
• Save favorites, set reminders, and get notified about what matters to you
```

---

## 12. Final pre-submission checklist

Before clicking "Send for review":

- [ ] AAB uploaded (`app-release.aab`, 11 MB)
- [ ] Play App Signing enrolled
- [ ] Play-issued SHA-1 added to Firebase + Google Cloud OAuth client
- [ ] Fresh `google-services.json` rebuilt into AAB
- [ ] Privacy policy live at `https://desmoinesinsider.com/privacy-policy`
- [ ] All 12 App content sections green
- [ ] Data safety form submitted
- [ ] Content rating completed (IARC certificate issued)
- [ ] DSA trader declaration (only if targeting EU at launch)
- [ ] Subscription products created, priced, real-content review uploaded
- [ ] `validate-android-purchase` Edge Function deployed with service account key
- [ ] Main store listing: name, short description, full description, app icon, feature graphic, 8 phone screenshots
- [ ] Store settings: category, tags, support email, website
- [ ] Reviewer login credentials provided in App access
- [ ] Internal testing release shipped, installed, and verified end-to-end on a real device
- [ ] Pre-launch report is green (no crashes, no critical security findings)
- [ ] Release notes written
- [ ] Countries & regions selected (US only for launch)
- [ ] Keystore and passwords backed up outside the repo
- [ ] `des-moines-insider.keystore` + `keystore-base64.txt` removed from git tracking before any public push

---

## 13. Assets still to produce (action list)

| # | Asset | Source | Owner |
|---|---|---|---|
| 1 | App icon 512×512 | Export from `DMI-Logo.psd` | |
| 2 | Feature graphic 1024×500 | Run `generate_feature_graphic2.py` and verify | |
| 3 | 8 phone screenshots | Pixel 7 emulator, release build | |
| 4 | 4–8 tablet screenshots (optional) | Pixel Tablet emulator | |
| 5 | Subscription benefit screenshots (4 products × 2 each) | Emulator | |
| 6 | Reviewer test account (email + password) | Create a real Supabase account | |
| 7 | Service account JSON for `validate-android-purchase` | Google Cloud Console | |
| 8 | DSA trader info (legal name, address, contact) — only if EU at launch | Business records | |

---

**Questions / follow-ups**
- If you want a shell script to capture all 8 screenshots deterministically from an Android emulator, ask and I'll write one.
- If you want me to draft the subscription real-content review blurbs, ask.
