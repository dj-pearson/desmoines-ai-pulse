# App Store Connect Metadata — Des Moines Insider

Use this file as a reference when filling in App Store Connect fields.
Copy/paste the sections below into the corresponding fields.

---

## ASO Strategy Notes

Apple's search algorithm indexes **only** Title + Subtitle + Keyword field (160 chars total).
The Description is NOT indexed for search — it exists for conversion, not ranking.

**Rules:**
1. Title has the highest indexing weight — put your most valuable keywords here
2. Subtitle and Keyword field have equal weight (second tier)
3. NEVER repeat a word across Title/Subtitle/Keywords — Apple indexes all three together
4. Use singular forms in keywords (Apple matches both singular and plural)
5. No spaces after commas in the keyword field to save characters
6. Use all 100 keyword characters — every unused character is a missed opportunity

**Target searches:** "Des Moines", "Des Moines events", "things to do in Des Moines",
"Des Moines restaurants", "Des Moines food", "Des Moines nightlife"

---

## App Information

- **App Name:** Des Moines Insider - Events _(27/30 chars)_
- **Subtitle:** Restaurants & Things to Do _(26/30 chars)_
- **Bundle ID:** com.desmoines.aipulse
- **Primary Category:** Lifestyle
- **Secondary Category:** Food & Drink
- **Age Rating:** 4+ (no objectionable content)
- **Content Rights:** Does not contain third-party content that requires rights

> **Why this Title:** Puts "Des Moines" AND "Events" in the highest-weight field.
> A user searching "Des Moines Events" now gets an exact match in the title.
> Previous title ("Des Moines Insider") wasted 12 chars of indexing power.
>
> **Why this Subtitle:** Captures "Restaurants" and "Things to Do" — two high-volume
> search phrases. Combined with "Des Moines" from the title, Apple will match
> "Des Moines restaurants" and "things to do in Des Moines" automatically.
> Stays at 26 chars to avoid the known App Store bug where the last word of a
> 30-char subtitle sometimes doesn't get indexed.

---


## URLs

- **Privacy Policy URL:** https://desmoinesinsider.com/privacy-policy
- **Support URL:** https://desmoinesinsider.com/contact
- **Marketing URL:** https://desmoinesinsider.com

---

## Promotional Text (170 chars max — can be updated without a new build)

> **Note:** Promotional text is NOT indexed for search. Its job is conversion — convincing
> users who land on your page to tap Install. Update seasonally for relevance.

Discover what's happening in Des Moines! Browse events, find top restaurants, explore attractions, and plan your weekend — all in one free app.

---

## Description (4000 chars max)

> **Note:** Apple does NOT index the description for search ranking. However, it heavily
> influences conversion rate (install/view ratio), which indirectly affects ranking.
> Front-load the most compelling value prop in the first 3 lines (visible before "Read More").

Des Moines Insider is the #1 local guide for events, restaurants, and things to do in the Greater Des Moines area. Whether you're looking for tonight's plans or planning a weekend trip to Iowa's capital city, we've got you covered.

DES MOINES EVENTS — UPDATED DAILY
Browse hundreds of upcoming events across Des Moines, West Des Moines, Ankeny, Urbandale, Johnston, and the surrounding metro. Filter by date, category, or location to find exactly what you're looking for — from live music and food festivals to art shows, family activities, and community gatherings. Never miss what's happening tonight or this weekend.

TOP RESTAURANTS & DINING
Explore the Des Moines dining scene with our curated restaurant directory. Sort by cuisine, price range, rating, or dietary needs. Whether you want a quick bite, a date night spot, the best happy hour, or the newest opening in town, Des Moines Insider helps you decide where to eat.

NIGHTLIFE & BARS
Discover the best bars, breweries, and nightlife spots across the metro. Plan your night out with hours, locations, and what's happening tonight all in one place.

INTERACTIVE MAP
See events, restaurants, and attractions plotted on a live map. Find what's happening near you or discover new neighborhoods to explore. Perfect for planning a night out or a weekend adventure in Des Moines.

SEARCH & DISCOVER
Use unified search to find events, restaurants, and attractions instantly. Search by name, category, or keyword to find exactly what you need.

SAVE YOUR FAVORITES
Heart the events and restaurants you love to build your personal list. Keep track of upcoming plans and revisit your favorite spots anytime.

SYNC ACROSS DEVICES
Sign in with Apple or email to sync your favorites everywhere. Manage your profile, preferences, and saved content — all in one place.

BUILT FOR DES MOINES, BY DES MOINES
Made by locals, for locals. We cover the entire Greater Des Moines metro including Des Moines, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Windsor Heights, Grimes, Altoona, Pleasant Hill, and surrounding communities. Updated daily so you always have the freshest local info.

---

## Keywords (100 chars max, comma-separated, no spaces after commas)

Iowa,dining,food,attraction,DSM,nightlife,tonight,weekend,local,guide,live music,festival,family,bar

> **Keyword budget breakdown (100/100 chars used):**
>
> Words indexed from **Title** (free — don't repeat): des, moines, insider, events
> Words indexed from **Subtitle** (free — don't repeat): restaurants, things, to, do
>
> **Keyword field adds 14 NEW searchable terms:**
> Iowa, dining, food, attraction, DSM, nightlife, tonight, weekend,
> local, guide, live music, festival, family, bar
>
> **Combined searchable phrases Apple can now match:**
> - "Des Moines events" (title exact match)
> - "Des Moines restaurants" (title + subtitle)
> - "things to do in Des Moines" (subtitle + title)
> - "Des Moines nightlife" (title + keyword)
> - "Des Moines food" / "Des Moines dining" (title + keyword)
> - "Des Moines bars" (title + keyword)
> - "events tonight" / "events this weekend" (title + keyword)
> - "live music Des Moines" (keyword + title)
> - "food festivals Des Moines" (keyword + keyword + title)
> - "family events Des Moines" (keyword + title)
> - "Iowa events" / "Iowa restaurants" (keyword + title/subtitle)
> - "local guide" / "DSM events" (keyword + title)
>
> **Previous keyword field wasted ~35 chars** on words already in title/subtitle:
> "Des Moines" (10), "events" (6), "restaurants" (11), "local guide" (11)

---

## What's New (Release Notes — for version 1.0)

Welcome to Des Moines Insider! Your new guide to events, restaurants, and attractions in the Greater Des Moines area.

- Browse and search hundreds of local events
- Explore the Des Moines restaurant scene
- Interactive map with nearby events and dining
- Save your favorite events and restaurants
- Sign in with Apple or email to sync across devices

---

## Review Notes (for Apple's review team)

Des Moines Insider is a local city guide for Des Moines, Iowa. The app displays publicly available event and restaurant information. No demo account is required — all content is accessible without signing in. Sign-in (via Apple or email) is only needed to save favorites.

The app requires a network connection to load content from our backend (Supabase). Location access is optional and used only to show nearby events and restaurants on the map.

---

## Screenshots

Generated automatically via the iOS Screenshots GitHub Actions workflow.
Devices: iPhone 16 Pro Max, iPhone 15 Pro Max, iPad Pro 13-inch (M4).
Download from the `app-store-screenshots` artifact in GitHub Actions.

---

## App Clip

### Bundle ID
`com.desmoines.aipulse.Clip`

### Invocation URL
`https://desmoinesinsider.com/clip`

(Also handles `/events/:id` and `/restaurants/:id` for deep-linked clips from QR/NFC.)

### Header Image
- **Format:** JPG or PNG, RGB color space
- **Size:** 1800 × 1200 px
- **Content:** Des Moines skyline with "What's Happening Today" overlay text.

### Subtitle (50 chars max)
```
Today's events in Des Moines
```

### Action (choose from App Store Connect dropdown)
`Open App` — reveals the full Des Moines Insider app install prompt.

### Default App Clip Link
`https://desmoinesinsider.com/clip`

### App Clip Demo URL (for Apple review)
`https://desmoinesinsider.com/clip`

### Associated Domain (added to both targets)
`appclip:desmoinesinsider.com`

### Apple App Site Association (AASA) — add to desmoinesinsider.com
The following JSON block must be served at:
`https://desmoinesinsider.com/.well-known/apple-app-site-association`

```json
{
  "appclips": {
    "apps": ["<TEAM_ID>.com.desmoines.aipulse.Clip"]
  },
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAM_ID>.com.desmoines.aipulse"],
        "components": [
          { "/": "/events/*" },
          { "/": "/restaurants/*" },
          { "/": "/clip" }
        ]
      }
    ]
  }
}
```

Replace `<TEAM_ID>` with your Apple Developer Team ID.

### What the Clip Shows
- Today's upcoming **featured events** (max 5), fetched without requiring sign-in
- Each card shows: event title, venue/location, date/time, price, category icon
- Tapping a card opens the full event page in Safari / the full app
- "Get Des Moines Insider — Free" button deep-links to the App Store listing

### Source Files
| File | Purpose |
|------|---------|
| `ios/DesMoinesInsiderClip/DesMoinesInsiderClipApp.swift` | `@main` entry point, handles `NSUserActivityTypeBrowsingWeb` |
| `ios/DesMoinesInsiderClip/ClipRootView.swift` | Single-screen UI (hero + event list + CTA) |
| `ios/DesMoinesInsiderClip/ClipEventCard.swift` | Individual event row card |
| `ios/DesMoinesInsiderClip/ClipEventsViewModel.swift` | Fetches featured events from Supabase |
| `ios/DesMoinesInsiderClip/DesMoinesInsiderClip.entitlements` | `on-demand-install-capable` + `appclip:` domain |
| `ios/DesMoinesInsiderClip/Info.plist` | Clip bundle info + `NSAppClip` key |

