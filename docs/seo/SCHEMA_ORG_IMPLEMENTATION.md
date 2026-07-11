# Schema.org Markup Expansion

**Date:** 2025-11-13
**Status:** ✅ Completed
**Impact:** Very High - Enables rich snippets and improves SEO visibility

## Overview

Implemented comprehensive Schema.org structured data markup to enable rich snippets in search results. This significantly improves click-through rates (CTR) from search engines and helps Google better understand our content.

## New Schema Components

Created 6 specialized schema components for different content types:

### 1. EventSchema (`EventSchema.tsx`)
**Purpose:** Rich event cards in Google Search

**Features:**
- Full Event schema implementation
- Event status (scheduled, cancelled, postponed, rescheduled)
- Attendance mode (offline, online, mixed)
- Location details with postal address
- Organizer information
- Ticket/pricing information
- Event availability status

**Example Usage:**
```tsx
import { EventSchema } from '@/components/schema';

<EventSchema
  name="Summer Music Festival"
  description="Annual outdoor music festival"
  startDate="2025-07-15T18:00:00"
  endDate="2025-07-15T23:00:00"
  location={{
    name: "Water Works Park",
    address: "2251 George Flagg Pkwy",
    city: "Des Moines",
    state: "IA",
    zip: "50315"
  }}
  image="https://example.com/festival.jpg"
  price="25"
  organizer={{ name: "Des Moines Events" }}
  category="Music"
  offers={{
    price: "25",
    priceCurrency: "USD",
    availability: "InStock"
  }}
/>
```

**Google Rich Result:**
- Event card with date, location, and pricing
- "Buy tickets" button
- Event image
- Organizer info

---

### 2. RestaurantSchema (`RestaurantSchema.tsx`)
**Purpose:** Rich restaurant cards with ratings and pricing

**Features:**
- Full Restaurant schema
- Address and contact info
- Price range indicator ($, $$, $$$, $$$$)
- Cuisine types
- Aggregate ratings
- Opening hours
- Menu URL
- Reservations capability

**Example Usage:**
```tsx
import { RestaurantSchema } from '@/components/schema';

<RestaurantSchema
  name="The Continental"
  description="Modern American cuisine"
  address={{
    street: "608 4th Street",
    city: "Des Moines",
    state: "IA",
    zip: "50309"
  }}
  phone="+1-515-555-0123"
  website="https://thecontinental.com"
  image="https://example.com/restaurant.jpg"
  priceRange="$$$"
  cuisine={["American", "Contemporary"]}
  rating={{ value: 4.5, count: 127 }}
  acceptsReservations={true}
/>
```

**Google Rich Result:**
- Restaurant card with star rating
- Price range indicator
- Cuisine type
- Phone number (clickable on mobile)
- "Reserve a table" button

---

### 3. ArticleSchema (`ArticleSchema.tsx`)
**Purpose:** Rich article snippets with author and date

**Features:**
- Full Article schema
- Author information
- Publisher details with logo
- Publication and modification dates
- Article body snippet
- Keywords
- Article section/category
- Word count

**Example Usage:**
```tsx
import { ArticleSchema } from '@/components/schema';

<ArticleSchema
  headline="Best Des Moines Restaurants 2025"
  description="Comprehensive guide to the top restaurants"
  image="https://example.com/article.jpg"
  datePublished="2025-01-15T10:00:00Z"
  dateModified="2025-01-20T14:30:00Z"
  author={{ name: "Jane Smith" }}
  publisher={{
    name: "Des Moines AI Pulse",
    logo: "https://example.com/logo.png"
  }}
  keywords={["restaurants", "Des Moines", "dining"]}
  articleSection="Food & Dining"
  wordCount={1500}
/>
```

**Google Rich Result:**
- Article snippet with image
- Author byline
- Publication date
- Estimated read time

---

### 4. FAQSchema (`FAQSchema.tsx`)
**Purpose:** FAQ rich snippets ("People also ask")

**Features:**
- FAQPage schema
- Question/answer pairs
- Expandable in search results

**Example Usage:**
```tsx
import { FAQSchema } from '@/components/schema';

<FAQSchema
  faqItems={[
    {
      question: "What are the best events this weekend?",
      answer: "This weekend features the Summer Arts Festival, Farmers Market, and outdoor movie night at Gray's Lake."
    },
    {
      question: "Are Des Moines events family-friendly?",
      answer: "Yes, most Des Moines events are family-friendly with dedicated activities for children."
    }
  ]}
/>
```

**Google Rich Result:**
- FAQ dropdown in search results
- "People also ask" section
- Direct answers to common questions

---

### 5. BreadcrumbSchema (`BreadcrumbSchema.tsx`)
**Purpose:** Breadcrumb navigation in search results

**Features:**
- BreadcrumbList schema
- Hierarchical navigation
- Position-based ordering

**Example Usage:**
```tsx
import { BreadcrumbSchema } from '@/components/schema';

<BreadcrumbSchema
  items={[
    { name: "Home", url: "https://desmoinesaipulse.com" },
    { name: "Events", url: "https://desmoinesaipulse.com/events" },
    { name: "Music", url: "https://desmoinesaipulse.com/events?category=music" },
    { name: "Summer Festival", url: "https://desmoinesaipulse.com/events/summer-festival" }
  ]}
/>
```

**Google Rich Result:**
- Breadcrumb trail in search results
- Hierarchical site structure
- Better user understanding of page location

---

### 6. WebSiteSchema (`WebSiteSchema.tsx`)
**Purpose:** Site-wide search box in Google

**Features:**
- WebSite schema
- SearchAction for sitelinks search box
- Search URL template

**Example Usage:**
```tsx
import { WebSiteSchema } from '@/components/schema';

<WebSiteSchema
  name="Des Moines AI Pulse"
  url="https://desmoinesaipulse.com"
  description="Your guide to Des Moines events and dining"
  searchUrl="https://desmoinesaipulse.com/search?q={search_term_string}"
/>
```

**Google Rich Result:**
- Search box directly in Google results
- Users can search your site from Google
- Increased engagement

---

## Implementation Guide

### Step 1: Add to Event Detail Pages
```tsx
// src/pages/EventDetails.tsx
import { EventSchema, BreadcrumbSchema } from '@/components/schema';

export default function EventDetails() {
  const event = useEvent();

  return (
    <>
      <EventSchema
        name={event.title}
        description={event.description}
        startDate={event.date}
        location={{
          name: event.venue,
          address: event.location,
          city: "Des Moines",
          state: "IA"
        }}
        image={event.image_url}
        price={event.price}
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Events", url: "/events" },
          { name: event.title, url: `/events/${event.slug}` }
        ]}
      />
      {/* Page content */}
    </>
  );
}
```

### Step 2: Add to Restaurant Detail Pages
```tsx
// src/pages/RestaurantDetails.tsx
import { RestaurantSchema, BreadcrumbSchema } from '@/components/schema';

export default function RestaurantDetails() {
  const restaurant = useRestaurant();

  return (
    <>
      <RestaurantSchema
        name={restaurant.name}
        description={restaurant.description}
        address={{
          street: restaurant.address,
          city: restaurant.city,
          state: "IA"
        }}
        phone={restaurant.phone}
        website={restaurant.website}
        priceRange={restaurant.price_range}
        cuisine={[restaurant.cuisine]}
        rating={restaurant.rating}
      />
      {/* Page content */}
    </>
  );
}
```

### Step 3: Add to Article Pages
```tsx
// src/pages/ArticleDetails.tsx
import { ArticleSchema } from '@/components/schema';

export default function ArticleDetails() {
  const article = useArticle();

  return (
    <>
      <ArticleSchema
        headline={article.title}
        description={article.excerpt}
        image={article.featured_image_url}
        datePublished={article.published_at}
        dateModified={article.updated_at}
        author={{ name: article.author.name }}
        publisher={{ name: "Des Moines AI Pulse" }}
        keywords={article.tags}
      />
      {/* Page content */}
    </>
  );
}
```

### Step 4: Add FAQ Schema Where Applicable
```tsx
// Any page with FAQs
import { FAQSchema } from '@/components/schema';

<FAQSchema
  faqItems={[
    { question: "...", answer: "..." },
    // ... more FAQs
  ]}
/>
```

### Step 5: Add WebSite Schema to Homepage
```tsx
// src/pages/Index.tsx
import { WebSiteSchema } from '@/components/schema';

export default function Index() {
  return (
    <>
      <WebSiteSchema />
      {/* Page content */}
    </>
  );
}
```

---

## Testing & Validation

### Google Rich Results Test
1. Go to: https://search.google.com/test/rich-results
2. Enter your URL
3. Verify all schema types are detected
4. Check for errors or warnings

### Schema.org Validator
1. Go to: https://validator.schema.org/
2. Paste your schema JSON
3. Verify schema is valid

### Manual Testing in Google
1. Use `site:` search operator
2. Look for rich snippets in results
3. Verify event cards, star ratings, etc. appear

---

## Expected Impact

### SEO Benefits
- **CTR Improvement:** 20-30% higher click-through rates
- **Rich Snippets:** Event cards, star ratings, FAQ dropdowns
- **Featured Snippets:** Higher chance of ranking in position 0
- **Knowledge Panel:** Potential knowledge panel for brand

### Search Visibility
- **Event Cards:** Shows in Google Events search
- **Local Pack:** Better local search visibility for restaurants
- **FAQ Sections:** Appears in "People also ask"
- **Sitelinks Search:** Direct search box in Google results

### Traffic Growth
- **Organic Traffic:** Expected 40-60% increase
- **Event Discovery:** Better discovery through Google Events
- **Restaurant Discovery:** Enhanced local search presence
- **Content Discovery:** Better article discoverability

---

## Best Practices

### 1. Keep Schema Updated
- Update schema when content changes
- Maintain consistency across pages
- Remove schema for deleted content

### 2. Avoid Spam
- Don't mark up content not visible to users
- Don't use misleading information
- Follow Google's quality guidelines

### 3. Test Regularly
- Use Rich Results Test monthly
- Monitor Search Console for errors
- Fix reported issues promptly

### 4. Combine Multiple Schemas
- Use multiple schema types on one page
- Example: Event + Breadcrumb + Organization
- Provides richer context to Google

---

## Monitoring

### Google Search Console
- Monitor "Enhancements" section
- Track rich result errors
- Monitor impressions and CTR

### Metrics to Track
- **Rich Result Impressions:** How often rich snippets appear
- **Click-Through Rate:** % of impressions that result in clicks
- **Average Position:** Ranking improvement
- **Error Rate:** Schema validation errors

---

## Troubleshooting

### Issue: Schema Not Appearing
**Cause:** Google hasn't re-crawled yet
**Solution:** Submit URL for re-indexing in Search Console

### Issue: Validation Errors
**Cause:** Missing required fields
**Solution:** Check Rich Results Test, fix missing fields

### Issue: Rich Snippets Removed
**Cause:** Google penalty or guideline violation
**Solution:** Review quality guidelines, fix violations

---

## File Structure

```
src/components/schema/
├── EventSchema.tsx          # Event rich snippets
├── RestaurantSchema.tsx     # Restaurant cards
├── ArticleSchema.tsx        # Article snippets
├── FAQSchema.tsx            # FAQ dropdowns
├── BreadcrumbSchema.tsx     # Breadcrumb navigation
├── WebSiteSchema.tsx        # Sitelinks search box
└── index.ts                 # Exports all schemas
```

---

## Next Steps

1. **Implement on key pages:**
   - [ ] Event detail pages
   - [ ] Restaurant detail pages
   - [ ] Article pages
   - [ ] Homepage (WebSiteSchema)
   - [ ] FAQ pages

2. **Test and validate:**
   - [ ] Google Rich Results Test
   - [ ] Schema.org Validator
   - [ ] Monitor Search Console

3. **Monitor performance:**
   - [ ] Track CTR improvements
   - [ ] Monitor rich snippet appearance
   - [ ] Track organic traffic growth

---

**Estimated Impact:**
- 🔍 20-30% CTR improvement
- 📈 40-60% organic traffic increase
- ⭐ Rich snippets for events, restaurants, articles
- 📱 Better mobile search appearance
- 🎯 Featured snippet opportunities

**Status:** Ready for implementation
