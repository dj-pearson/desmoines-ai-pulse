# GSC Indexing Fixes Applied

Based on Google Search Console exports (Chart.csv, Critical issues.csv, Metadata.csv, Non-critical issues.csv), the following changes were made to improve page indexing.

## Summary of GSC Issues

| Issue | Pages | Status |
|-------|-------|--------|
| Soft 404 | 208 | Fixed |
| Duplicate without user-selected canonical | 39 | Fixed |
| Discovered - currently not indexed | 446 | Addressed |
| Crawled - currently not indexed | 163 | Addressed |

## Changes Made

### 1. **Soft 404 Fixes**

- **EventsSegmentHandler**: Created a new route handler for `/events/:slug` that correctly routes:
  - **Month-year URLs** (e.g. `/events/march-2026`) → MonthlyEventsPage (valid content)
  - **Event slugs** → EventDetails
  - Previously, month-year URLs like `/events/march-2026` were hitting EventDetails, which showed "Event Not Found" (Soft 404). Now they correctly show the monthly calendar.

- **MonthlyEventsPage**: Updated to use `slug` param (consistent with the unified route).

### 2. **Canonical URL Fixes**

- **HotelDetails**: Replaced relative canonical and og:url (`/stay/${slug}`) with absolute URLs using `getCanonicalUrl()`.
- **Index (homepage)**: Added explicit `canonicalUrl` to SEOStructure to prevent query param pollution (e.g. `?utm_source=google`).
- **index.html**: Added default `<link rel="canonical" href="https://desmoinesinsider.com/" />` for the homepage.

### 3. **Sitemap & Robots**

- **robots.txt**: Set primary sitemap to `https://desmoinesinsider.com/sitemap.xml` (Google's standard). All other sitemaps remain listed.
- **sitemap-static.xml**: Added `/stay` (hotels page) to the static sitemap.

### 4. **GSC Recommendations**

- **Submit sitemap.xml in GSC**: In Google Search Console → Sitemaps, add `https://desmoinesinsider.com/sitemap.xml` as the primary sitemap index. The Metadata.csv showed only `sitemap-events.xml`; the full index includes all content types.

## Additional Recommendations (Manual)

### For "Discovered - currently not indexed" (446 pages)

1. **Request indexing** in GSC for high-priority pages (URL Inspection → Request Indexing).
2. **Improve internal linking** from high-authority pages (homepage, /events, /restaurants) to newer or less-linked pages.
3. **Content quality**: Ensure each page has unique, valuable content (at least 300+ words).

### For "Crawled - currently not indexed" (163 pages)

1. **Avoid thin content**: Add more substantive content to pages that may be too thin.
2. **Check for accidental noindex**: Ensure important pages don't have `noindex` meta tags.
3. **Improve Core Web Vitals**: Faster pages may be indexed more readily.

### General

- **Run sitemap generation**: Ensure `npm run` or your CI script runs `scripts/generate-dynamic-sitemaps.ts` periodically to keep sitemaps fresh.
- **Monitor GSC**: Re-check the "Pages" report in 2–4 weeks to see if indexing improves.

## Files Modified

- `src/pages/HotelDetails.tsx` – Canonical URLs
- `src/pages/Index.tsx` – Canonical URL
- `src/pages/MonthlyEventsPage.tsx` – Param handling
- `src/App.tsx` – Route changes, EventsSegmentHandler
- `src/components/EventsSegmentHandler.tsx` – New file
- `index.html` – Default canonical
- `public/robots.txt` – Sitemap URL
- `public/sitemap-static.xml` – Added /stay
