# DesMoinesInsider.com — Local SEO + AI (GEO) Plan

**Scope:** Des Moines + suburbs (West Des Moines, Ankeny, Urbandale, Johnston, Altoona, Clive, Windsor Heights)  
**Focus:** Events, restaurants, attractions, playgrounds  
**Stack:** React + TypeScript

---

## 0) Goals

- Page 1 for **“Des Moines events”**, **“Des Moines restaurants”**, “things to do Des Moines”, plus suburb terms
- Win “today” and “this weekend” event searches with fresh pages
- Be cited by AI tools (Google AI Overview, Bing Copilot, ChatGPT, Perplexity)
- Grow email list and repeat visits

---

## 1) Information Architecture (clean, predictable URLs)

**Index hubs**

- `/events/`
- `/restaurants/`
- `/attractions/`
- `/playgrounds/`

**Time hubs**

- `/events/today/`
- `/events/this-week/`
- `/events/this-weekend/`
- `/events/{month}-{year}/` (e.g., `/events/march-2026/`)

**Type hubs**

- `/events/{category}/` (music, family, free, outdoors, holiday, etc.)
- `/restaurants/{cuisine}/` (pizza, sushi, burgers, etc.)

**Place hubs**

- `/events/{suburb}/`
- `/restaurants/{suburb}/`
- `/attractions/{suburb}/`
- `/playgrounds/{suburb}/`

**Detail pages (one per item)**

- `/event/{slug}/`
- `/restaurant/{slug}/`
- `/attraction/{slug}/`
- `/playground/{slug}/`

**Neighborhood pages**

- `/neighborhoods/{name}/` (Downtown, East Village, Beaverdale, WDM, Ankeny, etc.)

**Guides**

- `/guides/` (seasonal, best-of, kids, date night, rainy day)

**Rules**

- One URL per item, no duplicates
- Short slugs: `west-des-moines`, `date-night`, `rainy-day`
- Each hub: short intro (2–3 lines), filters, links to related hubs

---

## 2) Tech Setup (React/TS)

- SSR or prerender for all public pages; if not on Next.js, use a prerender service for Googlebot/Bingbot
- robots.txt + XML sitemaps (separate sitemaps per content type)
- Unique titles + meta per page
- Canonicals on each page
- Core Web Vitals: WebP/AVIF, lazy-load, route code split, CDN, cache static assets
- Breadcrumbs (UI + JSON-LD)
- 404 page with search and top links

**robots.txt**

```txt
User-agent: *
Allow: /
Sitemap: https://desmoinesinsider.com/sitemap.xml
```

**sitemap index**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-events.xml</loc></sitemap>
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-restaurants.xml</loc></sitemap>
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-attractions.xml</loc></sitemap>
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-playgrounds.xml</loc></sitemap>
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-guides.xml</loc></sitemap>
  <sitemap><loc>https://desmoinesinsider.com/sitemaps/sitemap-static.xml</loc></sitemap>
</sitemapindex>
```

**<head> basics (sample)**

```html
<title>Des Moines Events This Weekend | Des Moines Insider</title>
<meta
  name="description"
  content="See events in Des Moines and suburbs for this weekend. Dates, times, maps, and quick tips."
/>
<link
  rel="canonical"
  href="https://desmoinesinsider.com/events/this-weekend/"
/>
<meta property="og:type" content="website" />
<meta property="og:title" content="Des Moines Events This Weekend" />
<meta
  property="og:description"
  content="Fresh list of events. Easy filters. Map links."
/>
<meta
  property="og:url"
  content="https://desmoinesinsider.com/events/this-weekend/"
/>
<meta
  property="og:image"
  content="https://desmoinesinsider.com/og/weekend.jpg"
/>
<meta name="twitter:card" content="summary_large_image" />
```

---

## 3) Local Assets

- Google Business Profile (media/info service). Add name, site, city, short summary, logo. Post weekly (event roundups)
- Citations: Des Moines Partnership, Chambers, Bing Places, Apple Maps (media/guide), trusted local lists. Keep NAP the same everywhere
- About: who runs it, local roots, contact email, simple media kit
- Social: claim handles; post short updates that link to hubs

---

## 4) Schema Pack (JSON-LD)

Add on server render. Replace sample fields with real data.

**Organization**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Des Moines Insider",
    "url": "https://desmoinesinsider.com",
    "logo": "https://desmoinesinsider.com/static/logo.png",
    "areaServed": { "@type": "City", "name": "Des Moines" },
    "sameAs": [
      "https://www.instagram.com/desmoinesinsider",
      "https://www.facebook.com/desmoinesinsider"
    ]
  }
</script>
```

**WebSite + SearchAction**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Des Moines Insider",
    "url": "https://desmoinesinsider.com",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://desmoinesinsider.com/search?q={query}",
      "query-input": "required name=query"
    }
  }
</script>
```

**Breadcrumb**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Events",
        "item": "https://desmoinesinsider.com/events/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "West Des Moines",
        "item": "https://desmoinesinsider.com/events/west-des-moines/"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "Music Fest",
        "item": "https://desmoinesinsider.com/event/wdm-music-fest-2026/"
      }
    ]
  }
</script>
```

**Event**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "WDM Music Fest",
    "startDate": "2026-07-19T18:00:00-05:00",
    "endDate": "2026-07-19T22:00:00-05:00",
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": "Valley Junction",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "123 5th St",
        "addressLocality": "West Des Moines",
        "addressRegion": "IA",
        "postalCode": "50265",
        "addressCountry": "US"
      }
    },
    "image": ["https://desmoinesinsider.com/images/wdm-music-fest.jpg"],
    "description": "Live music, local vendors, family area.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "https://desmoinesinsider.com/event/wdm-music-fest-2026/"
    },
    "organizer": { "@type": "Organization", "name": "Valley Junction" }
  }
</script>
```

**Restaurant**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "name": "Lucca",
    "url": "https://desmoinesinsider.com/restaurant/lucca/",
    "image": "https://desmoinesinsider.com/images/lucca.jpg",
    "servesCuisine": ["Italian"],
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Des Moines",
      "addressRegion": "IA",
      "postalCode": "50309",
      "addressCountry": "US"
    },
    "telephone": "+1-515-555-0100"
  }
</script>
```

**Attraction / Playground**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    "name": "Gray's Lake Park",
    "url": "https://desmoinesinsider.com/attraction/grays-lake-park/",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Des Moines",
      "addressRegion": "IA",
      "addressCountry": "US"
    }
  }
</script>
```

**FAQ (for hubs and guides)**

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What’s on this weekend in Des Moines?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "See our weekend list with dates, times, and maps on one page."
        }
      },
      {
        "@type": "Question",
        "name": "Best kid-friendly spots?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Try these parks and casual eats; we note bathrooms, parking, and play areas."
        }
      }
    ]
  }
</script>
```

---

## 5) Page Templates

**Event page**

- H1 = event name
- Intro: what, where, when (2–3 lines)
- Key facts: date/time, price, parking, best for (families, live music, pets)
- Map link, venue link, ticket link
- “If you go” tips (1–2 bullets)
- Related: 3 nearby restaurants/attractions
- Event JSON-LD

**Restaurant page**

- H1 = name + area (e.g., “Lucca — Downtown”)
- Short summary (cuisine, style, price level)
- Hours, address, phone, menu/site link
- “Good for” tags (date night, groups, gluten-free, kids)
- Parking/nearby picks
- Restaurant JSON-LD

**Neighborhood page**

- H1 = area name
- Short intro (what to expect)
- “Top picks” boxes: 5 events, 5 eats, 5 things to do
- Parking/transit notes
- Links to all local hubs
- Breadcrumb + FAQ JSON-LD

**Guide page**

- H1 = clear topic (“Rainy Day Things To Do in Des Moines”)
- tl;dr (2 lines), then lists grouped by age/budget/indoor vs outdoor
- FAQ at bottom
- Links to live lists (events today/this weekend)

---

## 6) Content Plan

**Evergreen hubs**

- Events, Restaurants, Attractions, Playgrounds
- Neighborhood hubs (Downtown, East Village, WDM, Ankeny, etc.)
- Best-of lists (pizza, coffee, brunch, patios, date night, free things)

**Fresh**

- `/events/this-weekend/` (update Thu/Fri)
- `/events/today/` (roll at midnight)
- Monthly: `/events/{month}-{year}/` (publish week before the month)
- Seasonal: Summer, Fall, Winter holidays, Spring break
- Weather: rainy day, hot day, cold day

**Long-tail**

- “Under $20”, “with kids”, “date night under $50”, “late night eats”, “pet friendly”, suburb pages

**Tone**

- Short and clear
- Answer first, then details
- Lists and tables

---

## 7) AI (GEO) Tactics

- Put the answer first on every page/section (2–3 lines)
- Add Q&A blocks to hubs and guides (plus FAQ JSON-LD)
- Use lists with labels: price, hours, age fit, indoor/outdoor, parking
- Keep pages fresh; update often
- Use real place names; link listings both ways

---

## 8) Off-Site + Community

- Listings: Partnership, Chambers, city/suburb resource pages
- Outreach: neighborhood groups, venues, schools/parks, local blogs
- Guest posts: “Top 10 for this weekend” on local media (link back)
- Event partners: swap links (they link to your event page)
- Social: weekly roundups; ask locals to tag pics; give credit

---

## 9) Tracking

- GSC: submit sitemaps; check coverage weekly
- GA4: track outbound clicks, filter use, email signup
- Looker Studio: impressions, clicks, top pages, top queries, Web Vitals
- Keep a log of pages “Discovered, not indexed”; fix with links or tweaks

---

## 10) 12-Week Rollout

**Roles:** DEV (React/TS), SEO (on-page + links), CONTENT (writing), OPS (GSC/GA + outreach)

**Weeks 1–2: Access + crawl first pass**

- DEV: SSR/prerender; fix 4xx/5xx; add robots + sitemaps; add canonicals
- SEO: page map; title/meta pass on main hubs; add breadcrumbs
- OPS: GSC/GA4; baseline report; claim GBP + key citations
- CONTENT: short intros for `/events/`, `/restaurants/`, `/attractions/`, `/playgrounds/`

**Weeks 3–4: Schema + hubs + “weekend” page**

- DEV: JSON-LD (Org, WebSite, Breadcrumb, FAQ)
- CONTENT: publish `/events/this-weekend/` and `/events/today/`; add 10 event pages; 5 restaurant pages; 2 neighborhood pages
- SEO: internal links from hubs to new pages; add FAQ blocks

**Weeks 5–6: Speed + suburbs + guides**

- DEV: images WebP/AVIF, lazy load, route code split, CDN
- CONTENT: 2 suburb hubs (WDM, Ankeny), 2 guides (rainy day, date night)
- SEO: sitemaps per type; fix any “Discovered, not indexed”

**Weeks 7–8: Monthly + seasonal**

- CONTENT: `/events/{next-month}-{year}/`, “Summer in Des Moines”; +10 events; +5 eats
- SEO: add FAQ where useful; add “free” and “kids” lists
- OPS: outreach to 10 local sites for links (partners, groups, media)

**Weeks 9–10: Depth + proof**

- CONTENT: 2 “best of” lists (pizza, coffee); 2 more suburb hubs; add photos
- DEV: sticky filters on mobile; track filter use; add email signup
- SEO: refine titles/meta on pages with high impressions, low CTR

**Weeks 11–12: Scale + polish**

- CONTENT: +10 events; +5 restaurants; “fall” or “holiday” landing (as season fits)
- SEO: pass on internal links (from all new pages to hubs)
- OPS: report: ranks, clicks, top pages, links; next quarter plan

---

## 11) Page QA (use this every time)

- Clear H1; intro answers the main question fast
- Title ~60 chars; meta ~155 chars; include “Des Moines” or suburb
- One main topic; related terms used once or twice
- 2–3 internal links to hubs/nearby items
- JSON-LD added
- Images compressed; alt text set
- Loads fast on mobile
- CTA: map, hours, add-to-calendar, email signup

---

## 12) KPI Targets (first 90–180 days)

- Index coverage: all hubs + 80% of listings indexed
- Page-1 ranks: “events this weekend Des Moines”, “Des Moines events”, 5+ suburb terms
- Click growth: +100% by month 6
- Links: 15–30 local referring domains
- Email list: first 1–3k locals (from weekend page and guides)

---

## 13) Ready Copy Blocks

**Events hub intro**  
Find the best events in Des Moines and nearby suburbs. See dates, times, maps, and tips. Updated daily with weekend picks and today’s list.

**Restaurants hub intro**  
The best places to eat in Des Moines by area and style. See hours, menu links, and “good for” tags like kids, groups, and late night.

**Neighborhood hub intro (East Village)**  
East Village has shops, eats, and live shows near the river. Start with these picks, then browse eats and things to do a few blocks away.

---

## 14) Owner Table (fill in)

|  Week | Area    | Task                                              | Owner | Done |
| ----: | ------- | ------------------------------------------------- | ----- | ---- |
|   1–2 | DEV     | SSR/prerender, robots, sitemaps, canonicals       |       | ☐    |
|   1–2 | SEO     | Page map, titles/meta, breadcrumbs                |       | ☐    |
|   1–2 | OPS     | GSC/GA4, baseline, GBP + citations                |       | ☐    |
|   1–2 | CONTENT | Hub intros (events/eats/attractions/playgrounds)  |       | ☐    |
|   3–4 | DEV     | JSON-LD: Org, WebSite, Breadcrumb, FAQ            |       | ☐    |
|   3–4 | CONTENT | Weekend/Today pages; 10 events; 5 eats; 2 hoods   |       | ☐    |
|   3–4 | SEO     | Internal links; FAQ blocks                        |       | ☐    |
|   5–6 | DEV     | Speed pass: WebP, lazy, split, CDN                |       | ☐    |
|   5–6 | CONTENT | 2 suburb hubs; 2 guides                           |       | ☐    |
|   5–6 | SEO     | Sitemaps per type; fix “not indexed”              |       | ☐    |
|   7–8 | CONTENT | Next-month page; Summer page; +10 events; +5 eats |       | ☐    |
|   7–8 | OPS     | 10-site outreach (links)                          |       | ☐    |
|  9–10 | CONTENT | 2 best-of lists; 2 suburb hubs; photos            |       | ☐    |
|  9–10 | DEV     | Sticky filters; track use; email signup           |       | ☐    |
|  9–10 | SEO     | Title/meta tweaks (high impressions, low CTR)     |       | ☐    |
| 11–12 | CONTENT | +10 events; +5 eats; fall/holiday landing         |       | ☐    |
| 11–12 | SEO     | Link pass across new pages                        |       | ☐    |
| 11–12 | OPS     | Report; next quarter plan                         |       | ☐    |
