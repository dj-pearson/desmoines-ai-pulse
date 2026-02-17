# iOS App Store Submission — Ready Reference

**Last Updated**: February 17, 2026
**App**: Des Moines Insider
**Bundle ID**: `com.desmoines.aipulse`
**Status**: Pre-submission

---

## 1. Apple Developer Account

| Item | Value | Status |
|------|-------|--------|
| Developer Program | Apple Developer Program (Individual or Organization) | TBD — Confirm active enrollment |
| Two-Factor Auth | Required on Apple ID | TBD |
| Agreements, Tax & Banking | Must be completed for paid apps / IAP | TBD |
| Team ID | Set in Xcode Signing & Capabilities | TBD |

---

## 2. App Identity

| Field | Value |
|-------|-------|
| **App Name** (≤30 chars) | Des Moines Insider |
| **Subtitle** (≤30 chars) | Events, Dining & Local Guide |
| **Bundle Identifier** | `com.desmoines.aipulse` |
| **SKU** | `desmoines-insider-ios` (or similar, set once) |
| **Primary Language** | English (U.S.) |

---

## 3. Categories & Age Rating

| Field | Value |
|-------|-------|
| **Primary Category** | Lifestyle |
| **Secondary Category** | Food & Drink |
| **Age Rating** | 4+ (no objectionable content — answer Apple questionnaire accordingly) |
| **Content Rights** | Does not contain third-party content requiring rights |

---

## 4. Version Information (v1.0)

### Description (≤4,000 characters)

> Des Moines Insider is your go-to guide for everything happening in the Greater Des Moines area. Whether you're a local looking for tonight's plans or a visitor exploring Iowa's capital city, we've got you covered.
>
> DISCOVER EVENTS
> Browse hundreds of upcoming events across Des Moines, West Des Moines, Ankeny, Urbandale, Johnston, and the surrounding metro. Filter by date, category, or location to find exactly what you're looking for — from live music and food festivals to art shows, family activities, and community gatherings.
>
> FIND GREAT RESTAURANTS
> Explore the Des Moines dining scene with our curated restaurant directory. Sort by cuisine, price range, rating, or popularity. Whether you want a quick bite, a date night spot, or the newest opening in town, Des Moines Insider helps you decide where to eat.
>
> EXPLORE THE MAP
> See events, restaurants, and attractions plotted on an interactive map. Find what's happening near you or discover new neighborhoods to explore. Perfect for planning a night out or a weekend adventure.
>
> SEARCH EVERYTHING
> Use our unified search to find events, restaurants, and attractions all in one place. Search by name, category, or keyword to quickly find what you need.
>
> SAVE YOUR FAVORITES
> Heart the events and restaurants you love to build your personal list. Keep track of upcoming plans and revisit your favorite spots anytime.
>
> YOUR PROFILE
> Sign in with email or Apple to sync your favorites across devices. Manage your profile, preferences, and saved content — all in one place.
>
> ALWAYS UP TO DATE
> Our events are updated daily so you never miss what's happening. Restaurant information is refreshed weekly to keep hours, menus, and details accurate.
>
> BUILT FOR DES MOINES
> Des Moines Insider is made by locals, for locals. We cover the entire Greater Des Moines metro including Des Moines, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Windsor Heights, and surrounding communities.

### Promotional Text (≤170 characters — editable anytime)

> Discover what's happening in Des Moines! Browse events, find top restaurants, explore attractions, and save your favorites — all in one app.

### Keywords (≤100 characters, comma-separated)

```
Des Moines,events,restaurants,Iowa,things to do,local guide,dining,attractions,DSM,food
```

### What's New (Release Notes — v1.0)

> Welcome to Des Moines Insider! Your new guide to events, restaurants, and attractions in the Greater Des Moines area.
>
> - Browse and search hundreds of local events
> - Explore the Des Moines restaurant scene
> - Interactive map with nearby events and dining
> - Save your favorite events and restaurants
> - Sign in with Apple or email to sync across devices

---

## 5. URLs & Contact Details

| Field | Value | Required |
|-------|-------|----------|
| **Privacy Policy URL** | https://desmoinesinsider.com/privacy-policy | Yes |
| **Support URL** | https://desmoinesinsider.com/contact | Yes |
| **Marketing URL** | https://desmoinesinsider.com | Optional (recommended) |
| **App Review Contact Email** | support@desmoinesinsider.com | Yes |
| **App Review Contact Phone** | TBD — Provide a monitored number | Yes |
| **Copyright** | © 2026 Des Moines Insider | Yes |

---

## 6. App Review Information

### Review Notes

> Des Moines Insider is a local city guide for Des Moines, Iowa. The app displays publicly available event and restaurant information. No demo account is required — all content is accessible without signing in. Sign-in (via Apple or email) is only needed to save favorites.
>
> The app requires a network connection to load content from our backend (Supabase). Location access is optional and used only to show nearby events and restaurants on the map.

### Demo Account

Not required — all core content is accessible without signing in. If the reviewer needs to test favorites/profile, Apple Sign-In is the primary auth method.

---

## 7. Pricing & Availability

| Field | Value |
|-------|-------|
| **Price** | Free |
| **Availability** | United States (initially — expand later) |
| **Release Strategy** | Manual Release After Approval (recommended for v1.0) |
| **Pre-Order** | No |

### In-App Purchases (Subscription Tiers via Stripe)

| IAP Product | Type | Monthly | Yearly | Notes |
|-------------|------|---------|--------|-------|
| **Des Moines Insider** | Auto-renewable subscription | $4.99/mo | $49.99/yr | Unlimited favorites, early access, ad-free, priority support |
| **Des Moines VIP** | Auto-renewable subscription | $12.99/mo | $129.99/yr | + VIP events, reservation assist, SMS alerts, concierge |

**Important**: Current implementation uses Stripe for web subscriptions. For iOS, Apple requires using their In-App Purchase system for digital goods/subscriptions. See the compliance build-out guide for migration requirements.

### Subscription Group

| Field | Value |
|-------|-------|
| **Group Name** | Des Moines Insider Premium |
| **Products** | Insider Monthly, Insider Yearly, VIP Monthly, VIP Yearly |
| **Display Name** | Des Moines Insider Premium |

---

## 8. App Privacy (Nutrition Label)

### Data Linked to You

| Data Type | Purpose | Linked to Identity |
|-----------|---------|-------------------|
| Email Address | Account management, communication | Yes |
| Name | Personalization, profile display | Yes |
| User ID | Account management, authentication | Yes |

### Data Not Linked to You

| Data Type | Purpose |
|-----------|---------|
| Approximate Location | Show nearby events/restaurants |
| Precise Location | Map view, nearby search |
| App Interactions | Analytics, feature improvement |
| Crash Logs | Diagnostics |

### Data Used to Track You

**None** — the app does not track users across other companies' apps or websites.

### Third-Party SDKs to Disclose

| SDK | Data Collected | Purpose |
|-----|----------------|---------|
| Supabase (Auth + DB) | Email, user ID, auth tokens | Backend services |
| Supabase Analytics | App interactions | Usage analytics |
| Apple Sign-In | Name, email (user-consented) | Authentication |

---

## 9. Export Compliance

| Field | Value |
|-------|-------|
| **Uses Encryption** | No (set `ITSAppUsesNonExemptEncryption = false` in Info.plist) |
| **Contains HTTPS only** | Yes — standard HTTPS/TLS only, no custom encryption |

This is already configured in `app.json`:
```json
"ios": {
  "infoPlist": {
    "ITSAppUsesNonExemptEncryption": false
  }
}
```

---

## 10. Screenshots Required

### iPhone Screenshots (required)

| Device | Size | Screenshots Needed |
|--------|------|--------------------|
| iPhone 16 Pro Max (6.9") | 1320 × 2868 | 3-10 screenshots |
| iPhone 15 Pro Max (6.7") | 1290 × 2796 | 3-10 screenshots |
| iPhone 8 Plus (5.5") | 1242 × 2208 | 3-10 screenshots (if supporting older) |

### iPad Screenshots (if supporting iPad)

| Device | Size | Screenshots Needed |
|--------|------|--------------------|
| iPad Pro 13" (M4) | 2064 × 2752 | 3-10 screenshots |

### Recommended Screenshot Sequence

1. **Home / Events Feed** — Featured events carousel, category filters
2. **Restaurant List** — Dining directory with filters
3. **Map View** — Interactive map with event pins
4. **Event Detail** — Full event info with calendar add + share
5. **Search** — Unified search across events/restaurants/attractions
6. **Favorites** — Saved events list
7. **Profile / Sign In** — Apple Sign-In flow

Screenshots are generated via the iOS Screenshots GitHub Actions workflow. Download from the `app-store-screenshots` artifact.

---

## 11. App Icon

| Requirement | Spec |
|-------------|------|
| **Size** | 1024 × 1024 px |
| **Format** | PNG, no alpha/transparency |
| **Location** | `ios/DesMoinesInsider/Resources/Assets.xcassets/AppIcon.appiconset/` |
| **Status** | TBD — Verify final icon is placed |

---

## 12. Technical Build Details

| Item | Value |
|------|-------|
| **Xcode** | 15+ |
| **iOS Deployment Target** | 17.0 |
| **Swift** | 5.9+ |
| **Architecture** | Native SwiftUI (not Capacitor wrapper) |
| **Backend** | Supabase (same as web app) |
| **Auth** | Supabase Auth + Apple Sign-In |
| **Maps** | MapKit (native) |
| **Backend SDK** | supabase-swift 2.x |

### Build & Upload

```bash
# Via GitHub Actions (recommended)
# Actions > "iOS Native Release - TestFlight" > Run workflow

# Via tag
git tag ios-native-v1.0.0
git push origin ios-native-v1.0.0

# Via Fastlane (local)
cd ios/
make beta      # TestFlight
make release   # App Store Connect
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `APPSTORE_ISSUER_ID` | App Store Connect API Issuer ID |
| `APPSTORE_API_KEY_ID` | App Store Connect API Key ID |
| `APPSTORE_API_PRIVATE_KEY` | `.p8` private key contents |
| `IOS_DISTRIBUTION_CERT_P12` | Base64-encoded distribution cert |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | Cert password |
| `IOS_PROVISIONING_PROFILE` | Base64-encoded provisioning profile |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

---

## 13. Pre-Submission Checklist

### A. Account & Build

- [ ] Apple Developer Program membership active, 2FA enabled
- [ ] Agreements, Tax & Banking completed (for subscriptions)
- [ ] Release build archived with Xcode 15+ and latest iOS SDK
- [ ] Build validated and uploaded to App Store Connect
- [ ] No crashes, test data, debug logs, or placeholder content in production

### B. App Store Metadata

- [ ] App Name "Des Moines Insider" set (unique in store)
- [ ] Subtitle "Events, Dining & Local Guide" written
- [ ] Primary (Lifestyle) and Secondary (Food & Drink) categories selected
- [ ] Age rating questionnaire completed (4+)
- [ ] App icon (1024×1024 PNG, no transparency) uploaded
- [ ] Description (see Section 4) pasted
- [ ] Promotional text entered
- [ ] Keywords field filled (100 chars max)
- [ ] What's New / release notes written
- [ ] Copyright "© 2026 Des Moines Insider" entered

### C. Screenshots & Media

- [ ] iPhone screenshots uploaded (6.9", 6.7", optionally 5.5")
- [ ] iPad screenshots uploaded (if supporting iPad)
- [ ] All screenshots show real UI, current version, no mocked data
- [ ] App previews (video) added if desired (optional)

### D. URLs & Contact

- [ ] Privacy Policy URL: https://desmoinesinsider.com/privacy-policy (verified live)
- [ ] Support URL: https://desmoinesinsider.com/contact (verified live)
- [ ] Marketing URL: https://desmoinesinsider.com (verified live)
- [ ] App Review contact email monitored
- [ ] App Review contact phone number provided

### E. Privacy & Compliance

- [ ] App privacy nutrition label completed in App Store Connect
- [ ] Third-party SDK data collection disclosed (Supabase)
- [ ] Location permission prompt explains why (`NSLocationWhenInUseUsageDescription`)
- [ ] Account deletion flow implemented and tested (see compliance guide)
- [ ] `ITSAppUsesNonExemptEncryption` set to NO
- [ ] Privacy policy accessible within the app (Settings > Privacy Policy)

### F. Monetization

- [ ] App set to Free
- [ ] In-App Purchase subscription group created ("Des Moines Insider Premium")
- [ ] 4 subscription products created (Insider Monthly/Yearly, VIP Monthly/Yearly)
- [ ] StoreKit 2 integration implemented (replaces Stripe for iOS)
- [ ] Subscription flows tested with Sandbox accounts
- [ ] Restore Purchases button present and working

### G. Accessibility

- [ ] VoiceOver labels on all tappable elements
- [ ] Dynamic Type supported
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Reduce Motion respected

### H. Final Review

- [ ] All App Store Connect warnings/errors resolved
- [ ] Review notes provided (Section 6 above)
- [ ] Backend production-ready and stable
- [ ] Release strategy selected (Manual Release recommended for v1.0)
- [ ] Submit for Review clicked

---

## Appendix: File Locations

| Item | Path |
|------|------|
| iOS native project | `ios/` |
| Xcode project generator | `ios/project.yml` |
| App Store metadata draft | `ios/metadata/app_store_metadata.md` |
| Capacitor mobile shell | `mobile-app/` |
| Stripe setup script | `scripts/setup-stripe-products.js` |
| Privacy Policy page | `src/pages/PrivacyPolicy.tsx` |
| Contact/Support page | `src/pages/Contact.tsx` |
| Subscription hook | `src/hooks/useSubscription.ts` |
| Config (iOS) | `ios/DesMoinesInsider/Configuration/Config.swift` |
| Settings view (iOS) | `ios/DesMoinesInsider/Views/Profile/SettingsView.swift` |
| Profile view (iOS) | `ios/DesMoinesInsider/Views/Profile/ProfileView.swift` |
