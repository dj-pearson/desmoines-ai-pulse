# Hotel Affiliate Programs

How the "Stay in Des Moines" hotel links earn commission, where to sign up for
each brand, and how to apply a link so it propagates to every hotel of that
brand automatically.

**Last verified:** 2026-07-30. Hotel groups move between affiliate networks with
little notice — re-confirm the network in your acceptance email before entering
credentials.

---

## 1. The problem this replaces

The affiliate links previously wired into the site (`src/lib/affiliateAds.ts`)
are **loyalty-program creatives**:

| Brand | Link | Lands on |
|---|---|---|
| Hyatt | `hyatt.jewn.net/DWyqGG` | World of Hyatt enrolment |
| IHG | `ihg.hmxg.net/5kaEq9` | IHG One Rewards enrolment |
| Marriott | `marriott.pxf.io/en1QGZ` | Bonvoy enrolment |

All three are **impact.com** short links (`pxf.io`, `hmxg.net`, and `jewn.net`
are impact.com tracking domains). They are valid tracking links — they just
point at the default creative, which for these programs is the rewards signup
page. A reader clicking "Book this hotel" lands on a membership form instead of
the property, and the room-revenue commission never fires.

The fix is not a different program, it is **deep linking**: keep the same
credentials, append the property's own booking URL as the destination. That is
what `build_hotel_affiliate_url` does.

The same three links were also the click-through for the **display banners**
(`src/lib/affiliateAds.ts` → `AffiliateAdBanner`). Those are now deep linked as
well — see §3.1.

### UTM parameters are not affiliate tracking

Worth stating plainly, because the two get conflated: `utm_source` /
`utm_campaign` are analytics tags read by *your* Google Analytics. They carry no
payment attribution. Commission is only attributed when the click passes through
the network's redirect domain (`prf.hn`, `awin1.com`, `anrdoezrs.net`, or your
impact.com vanity domain), which drops the tracking cookie. You can add UTMs on
top of the destination URL for your own reporting, but the redirect is what pays.

---

## 2. Program directory

Commission rates and cookie windows below are what public sources reported as of
July 2026 and are indicative only — your actual terms come from the offer you
are approved for.

| Brand (`brand_parent`) | Network | Where to apply | Reported commission | Cookie | Notes |
|---|---|---|---|---|---|
| **Marriott** | impact.com | [marriott.pxf.io](https://marriott.pxf.io/) · [program FAQ](https://www.marriott.com/marriott/affiliateprogramfaq.mi) | ~3–7% of room revenue | ~7 days | Pays on completed stays, max 9 rooms. Supports deep links + data feeds. |
| **Hilton** | Awin | [Awin merchant profile 3624](https://ui.awin.com/merchant-profile/3624) | ~4% base | varies | Paid after each completed stay. Excludes Hilton Grand Vacations and SLH properties. |
| **IHG** | impact.com or Partnerize | [partnerconnect.ihg.com](https://partnerconnect.ihg.com/) | % of room revenue | ~7 days | IHG has run on both networks across its portfolio — confirm which one you land on. |
| **Hyatt** | impact.com | [hyatt.jewn.net](https://hyatt.jewn.net/) · also listed on [Sovrn Commerce](https://commerce.sovrn.com/merchants/41237/hyatt-hotels-and-resorts-affiliate-program) | ~2–5% (reports vary) | 7–30 days | Commission on completed stay. |
| **Choice** | Partnerize (PHG) | [join.partnerize.com/choicehotels](https://join.partnerize.com/choicehotels/en) · [choicehotels.com/affiliate](https://www.choicehotels.com/affiliate) | ~2–5% on completed stay | 7 days | Covers Comfort, Quality, Sleep Inn, Cambria, Country Inn & Suites. |
| **Wyndham** | CJ Affiliate | [CJ publisher signup](https://signup.cj.com/member/signup/publisher/) | ~3% per sale | ~30 days | Commission reverses on cancellation/no-show. Covers Days Inn, Super 8, La Quinta, Ramada, Baymont. |
| **Best Western** | CJ Affiliate | [bestwestern.com affiliate program](https://www.bestwestern.com/en_US/about/affiliate-program.html) | ~3% per completed stay | 30 days | US program runs through CJ. |
| **Drury** | — | none found | — | — | Privately held, no public affiliate program. Route via the fallback or link direct. |
| **Independent** | — | none | — | — | Surety Hotel, Hotel Fort Des Moines, etc. Use the fallback. |

### Fallback / OTA aggregators (the `*` row)

For Drury, independents, and any brand you have not been approved for yet.
These accept a deep link to a specific property, so the reader still lands on
the right hotel:

| Option | Sign up | Notes |
|---|---|---|
| **Stay22** | [stay22.com](https://www.stay22.com/) | Purpose-built for publishers; auto-converts accommodation links and has hotel-map widgets. Generally the strongest hotel conversion of this group. |
| **Travelpayouts** | [travelpayouts.com](https://www.travelpayouts.com/) | Aggregates 50+ travel brands (hotels, flights, insurance, car rental) under one account — broader inventory, more setup. |
| **Booking.com** | [Booking.com affiliate partner program](https://www.booking.com/affiliate-program/v2/index.html) | Huge inventory including independents; pays a share of Booking's commission. |
| **Expedia (EAN / Rapid)** | [partners.expediagroup.com](https://partners.expediagroup.com/) | Also runs through Partnerize for some publisher tiers. |

> **Rate-parity caveat.** Brand-direct programs generally do not commission
> bookings made on logged-in member rates, and several exclude points
> redemptions and group blocks. Sending readers to an OTA for a chain hotel you
> *do* have a direct program with usually pays less, because the OTA's net-rate
> markup is stripped before commission is calculated. Prefer brand-direct for
> chains, aggregator only for the gaps.

---

## 3. How the system applies a link

```
hotel_affiliate_programs (one row per brand)
        │  admin edits credentials + flips is_enabled
        ▼
AFTER trigger: reapply_hotel_affiliate_program()
        │  touches every hotel with that brand_parent
        ▼
BEFORE trigger on hotels: sync_hotel_affiliate_url()
        │  calls build_hotel_affiliate_url(brand_parent, website)
        ▼
hotels.affiliate_url + affiliate_provider + affiliate_url_updated_at
        │
        ▼
HotelCard / HotelDetails / EventHotelCallout  →  hotel.affiliate_url || hotel.website
```

Because generation lives in a `BEFORE INSERT OR UPDATE` trigger on `hotels`, a
hotel added *after* you configure a brand gets its affiliate link on insert. No
regen run required.

### Setting a brand up

1. Apply to the program (table above). Wait for approval.
2. Open **Admin → Hotels → Affiliate Programs**.
3. Pick the **Network** you were approved on, fill in the credential fields —
   the labels match each network's own vocabulary:

   | Network | `account_id` | `ad_id` | `campaign_id` | `tracking_domain` |
   |---|---|---|---|---|
   | impact.com | Account ID | Ad ID | Campaign ID | vanity domain (`marriott.pxf.io`) |
   | Partnerize | camref | — | — | — |
   | CJ | PID | AID (advertiser link ID) | — | — |
   | Awin | awinaffid | awinmid | — | — |
   | Sovrn | API key | — | — | — |
   | custom | — | — | — | — (uses **Link template**) |

4. Check the **Preview** line renders a sane URL.
5. Toggle **Enabled**, hit **Save & apply**. Every hotel of that brand is
   rewritten in the same transaction.

### 3.1 Display banners

The banner ad units use the *same* brand credentials, but a banner is
brand-level rather than property-level, so it needs its own destination:

```
hotel_affiliate_programs.ad_destination_url   ← brand's Des Moines search page
        │  BEFORE trigger: sync_affiliate_ad_url()
        ▼
hotel_affiliate_programs.ad_url               ← wrapped in the brand's redirect
        │  get_affiliate_ad_links()  (SECURITY DEFINER, granted to anon)
        ▼
useAffiliateAdLinks → useAffiliateAd → AffiliateAdBanner
```

`ad_url` is NULL while the program is disabled or has no destination, and the
banner then falls back to the static link in `affiliateAds.ts`. So banners never
go blank — they just stay on the old loyalty link until you configure the brand.

The table is admin-only under RLS and stays that way. `get_affiliate_ad_links()`
is a `SECURITY DEFINER` function returning only `brand_parent`, `display_name`
and the finished `ad_url` — no credentials, no operator notes, and it takes no
arguments, so it cannot be used to mint a link for an attacker-chosen
destination. The `anon` grant is load-bearing: banners render for logged-out
visitors on every public page.

> **Seeded destinations are unverified.** Migration `20260730000002` fills in
> best-effort Des Moines search URLs for the seven chain brands. Hotel groups
> rewrite their search URL patterns often. **Open each one and confirm it loads a
> Des Moines result list before enabling that brand** — a 404 destination
> converts at zero, and some programs treat repeated dead-link traffic as a
> compliance issue.

Only Hyatt, IHG and Marriott have banner creative assets today. Adding a fourth
brand means dropping 728x90 / 300x250 / 160x600 images into
`public/ads/affiliates/<brand>/` and adding an entry to `AFFILIATE_PARTNERS`
with its `brandParent` set to the matching `hotel_affiliate_programs` row.

#### Reading impact.com IDs off an existing link

A tracking link like `https://marriott.pxf.io/c/1987654/1234567/15676` gives you
all four values: domain `marriott.pxf.io`, account `1987654`, ad `1234567`,
campaign `15676`. The generator appends `?u=<encoded destination>&subId1=<sub id>`.

Deep linking on impact.com only works for **permitted domains** configured by
the brand. If deep links bounce to the homepage, ask the program manager to add
the brand's booking domain to the permitted list.

#### Custom templates

Set network to `custom` and use placeholders:

| Placeholder | Expands to |
|---|---|
| `{destination_encoded}` | percent-encoded hotel URL (what you almost always want) |
| `{destination}` | raw hotel URL |
| `{subid}` | the Sub ID field, percent-encoded |

Example for Stay22:

```
https://www.stay22.com/l/YOURID?address={destination_encoded}
```

### Pinning a hand-written link

Set `hotels.affiliate_url_managed = false` on that row. The trigger will leave
its `affiliate_url` alone. Everything else stays automatic.

---

## 4. Operational notes

- **Disabling a program clears the links it generated.** Hotels fall back to
  `hotel.website`, which is the correct behaviour — a dead redirect converts
  worse than a plain link.
- **The edge function still works.** `generate-hotel-affiliate-urls` now reads
  `hotel_affiliate_programs` first and falls back to the legacy
  `*_CJ_PID` / `*_AWIN_MID` secrets, so nothing breaks mid-migration. Once every
  brand is in the table those secrets can be retired.
- **Disclosure is required.** The FTC requires affiliate relationships be
  disclosed; `AffiliateDisclosureBanner` and `/affiliate-disclosure` already
  cover this. Several programs also require it contractually.
- **Sub ID** defaults to `desmoines-insider`. Vary it per brand if you want
  network reports broken out.

---

## 5. Sources

- [Hilton Affiliate Programme — Awin merchant profile](https://ui.awin.com/merchant-profile/3624)
- [Marriott Affiliate Program FAQ](https://www.marriott.com/marriott/affiliateprogramfaq.mi)
- [IHG PartnerConnect](https://partnerconnect.ihg.com/)
- [Choice Hotels affiliate program](https://www.choicehotels.com/affiliate) · [Partnerize signup](https://join.partnerize.com/choicehotels/en)
- [Best Western affiliate program](https://www.bestwestern.com/en_US/about/affiliate-program.html)
- [CJ publisher signup](https://signup.cj.com/member/signup/publisher/) · [CJ account numbers explained](https://junction.cj.com/article/identification-its-everywhere)
- [impact.com — Create a deep link for an ad](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/tracking/tracking-links/create-and-manage-links/create-a-deep-link-for-an-ad)
- [impact.com — Permitted domains for deep linking](https://help.impact.com/brand/what-would-you-like-to-learn-about/account-administration/program-settings/tracking-settings/set-up-permitted-domains-for-deep-linking)
- [Partnerize publisher signup guide](https://help.phgsupport.com/hc/en-us/articles/20079182273565-How-to-Sign-Up-to-Partnerize-as-a-Partner)
- [Hyatt Hotels & Resorts on Sovrn Commerce](https://commerce.sovrn.com/merchants/41237/hyatt-hotels-and-resorts-affiliate-program)
- [Stay22 vs Travelpayouts comparison](https://blog.stay22.com/are-you-using-the-right-travel-affiliate-program)
