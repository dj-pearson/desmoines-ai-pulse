# App Store Metadata — Des Moines Insider

## App Information

- **App Name**: Des Moines Insider
- **Subtitle**: Events, Food & Local Guides
- **Bundle ID**: com.desmoines.aipulse
- **Category**: Travel (Primary), Food & Drink (Secondary)
- **Age Rating**: 4+ (No objectionable content)

## Description

Discover the best of Des Moines with Des Moines Insider — your AI-powered guide to events, restaurants, attractions, and local experiences.

**What You Can Do:**
- Browse hundreds of local events, from live music to food festivals
- Find top-rated restaurants with filters for cuisine, price, and dietary options
- Explore attractions, parks, and hidden gems across the metro
- Plan your perfect trip with our AI Trip Planner
- Set event reminders so you never miss out
- Save favorites and build your personal Des Moines bucket list
- Get real-time updates on what's happening right now

**For Locals & Visitors:**
Whether you're a lifelong Des Moines resident or planning your first visit, Des Moines Insider helps you experience everything the metro has to offer.

**Neighborhoods Covered:**
Downtown, East Village, Valley Junction, Ingersoll, Drake, Beaverdale, Ankeny, West Des Moines, Urbandale, Johnston, Clive, Altoona, and more.

## Keywords

des moines, iowa, events, restaurants, things to do, local guide, attractions, food, nightlife, trip planner, weekend, family activities, live music, festivals, downtown

## What's New (Release Notes Template)

- Discover events, restaurants, and attractions in Des Moines
- AI-powered trip planning for personalized itineraries
- Set reminders for upcoming events
- Save your favorite places and events
- Pull-to-refresh for the latest listings

## Screenshots Required

### iPhone 6.7" (iPhone 15 Pro Max / 16 Pro Max) — Required
- 1290 x 2796 px (portrait)
- Suggested screenshots:
  1. Home screen with hero and quick actions
  2. Events list with search and filters
  3. Event detail page with map
  4. Restaurant listings
  5. AI Trip Planner

### iPhone 6.1" (iPhone 15 / 16) — Required
- 1179 x 2556 px (portrait)
- Same scenes as 6.7"

### iPhone 5.5" (iPhone 8 Plus) — Optional but recommended
- 1242 x 2208 px (portrait)

### iPad Pro 12.9" (6th gen) — Required if supporting iPad
- 2048 x 2732 px (portrait)

### iPad Pro 11" — Optional
- 1668 x 2388 px (portrait)

## Privacy Nutrition Labels

### Data Collected

| Data Type | Purpose | Linked to Identity |
|-----------|---------|-------------------|
| Email Address | Account creation, event reminders | Yes |
| Name | User profile | Yes |
| Location (coarse) | Nearby events/restaurants | No |
| Usage Data | Analytics, app improvement | No |
| Device ID | Push notifications | No |

### Data NOT Collected
- Financial information (Stripe handles payments externally)
- Health & fitness data
- Contacts
- Browsing history
- Sensitive information

### Tracking
- **No tracking** across other companies' apps or websites

## App Store Connect Required Fields

| Field | Value |
|-------|-------|
| SKU | com.desmoines.aipulse |
| Content Rights | Does not contain third-party content requiring rights |
| Export Compliance | Uses HTTPS encryption (exempt) |
| IDFA | No (does not use Advertising Identifier) |
| Sign in with Apple | Not required (uses email/Google auth) |
| App Review Contact | [Your contact info] |
| Demo Account | [Provide test credentials for Apple review team] |
| App Review Notes | This app showcases Des Moines, Iowa local events and restaurants. No login required for browsing. |

## Fastlane Integration

Fastlane is configured in `mobile-app/fastlane/` for automated:
- Screenshot generation
- Build number management
- App Store submission

```bash
cd mobile-app
bundle exec fastlane screenshots    # Generate screenshots
bundle exec fastlane beta            # Submit to TestFlight
bundle exec fastlane release         # Submit to App Store
```
