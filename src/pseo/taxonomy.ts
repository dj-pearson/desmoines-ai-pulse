/**
 * pSEO 2.0 Niche Taxonomy
 *
 * This file defines the complete taxonomy that powers programmatic page generation.
 * Every dimension value includes rich context objects that drive AI content generation,
 * ensuring each page combination produces substantively different, useful content.
 *
 * Dimensions:
 *   1. Content Type (what) — events, restaurants, attractions, activities
 *   2. Location (where) — neighborhoods, suburbs, districts
 *   3. Audience/Intent (who/why) — families, couples, foodies, tourists, etc.
 *   4. Temporal (when) — today, weekend, seasonal, monthly
 *   5. Category (specific) — cuisine types, event genres, attraction types
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DimensionContext {
  audience: string;
  pain_points: string;
  search_behavior: string;
  content_that_works: string;
  what_makes_it_useful: string;
  subtopics: string[];
}

export interface DimensionValue {
  slug: string;
  name: string;
  dimension: DimensionKey;
  tier: 1 | 2 | 3;
  context: DimensionContext;
}

export type DimensionKey =
  | 'content_type'
  | 'location'
  | 'audience'
  | 'temporal'
  | 'category';

export interface Dimension {
  key: DimensionKey;
  name: string;
  description: string;
  values: DimensionValue[];
}

// ---------------------------------------------------------------------------
// Dimension 1: Content Type (WHAT)
// ---------------------------------------------------------------------------

export const contentTypeDimension: Dimension = {
  key: 'content_type',
  name: 'Content Type',
  description: 'The primary entity type — determines page layout and data source',
  values: [
    {
      slug: 'things-to-do',
      name: 'Things to Do',
      dimension: 'content_type',
      tier: 1,
      context: {
        audience: 'Visitors planning a trip or locals looking for weekend activities',
        pain_points: 'Overwhelmed by generic listicles, want curated local picks not tourist traps',
        search_behavior: '"things to do in des moines", "what to do in des moines this weekend", "des moines activities"',
        content_that_works: 'Curated lists with insider tips, time estimates, and cost breakdowns',
        what_makes_it_useful: 'Combines events + attractions + restaurants into actionable plans with local context',
        subtopics: ['free activities', 'rainy day ideas', 'unique experiences', 'bucket list', 'hidden gems'],
      },
    },
    {
      slug: 'events',
      name: 'Events',
      dimension: 'content_type',
      tier: 1,
      context: {
        audience: 'Locals checking what is happening and visitors planning around specific dates',
        pain_points: 'Event info scattered across Facebook, Eventbrite, venue sites; hard to filter by interest',
        search_behavior: '"des moines events", "events near me today", "des moines concerts this weekend"',
        content_that_works: 'Date-sorted cards with price, venue, category; map view; calendar export',
        what_makes_it_useful: 'Single source of truth aggregating all Des Moines events with smart filtering',
        subtopics: ['concerts', 'festivals', 'fundraisers', 'community events', 'holiday events', 'sports'],
      },
    },
    {
      slug: 'restaurants',
      name: 'Restaurants',
      dimension: 'content_type',
      tier: 1,
      context: {
        audience: 'Locals deciding where to eat tonight and visitors looking for local food scene',
        pain_points: 'Google Maps reviews feel generic; Yelp is cluttered; want local-perspective recommendations',
        search_behavior: '"best restaurants des moines", "where to eat in des moines", "restaurants near me open now"',
        content_that_works: 'Curated lists with specific dish recommendations, atmosphere descriptions, price context',
        what_makes_it_useful: 'Local insider knowledge — what to actually order, when to go, reservation tips',
        subtopics: ['new openings', 'hidden gems', 'happy hour', 'brunch spots', 'late night eats'],
      },
    },
    {
      slug: 'attractions',
      name: 'Attractions',
      dimension: 'content_type',
      tier: 1,
      context: {
        audience: 'Tourists planning visits and locals looking for new experiences in their city',
        pain_points: 'Trip advisor is pay-to-play; hard to know what is actually worth visiting vs tourist trap',
        search_behavior: '"des moines attractions", "things to see in des moines", "des moines museums"',
        content_that_works: 'Honest reviews with visit duration, best time to go, parking tips, insider tricks',
        what_makes_it_useful: 'Real local perspective with practical logistics — not just a brochure rehash',
        subtopics: ['museums', 'parks', 'historic sites', 'art galleries', 'botanical gardens'],
      },
    },
    {
      slug: 'nightlife',
      name: 'Nightlife',
      dimension: 'content_type',
      tier: 2,
      context: {
        audience: 'Young professionals, college students, and visitors looking for evening entertainment',
        pain_points: 'Hard to know which bars/clubs are worth visiting; scene changes frequently',
        search_behavior: '"des moines nightlife", "best bars des moines", "des moines live music tonight"',
        content_that_works: 'Neighborhood bar guides with vibe descriptions, drink specials, crowd type',
        what_makes_it_useful: 'Honest vibe checks — know what to expect before you walk in',
        subtopics: ['cocktail bars', 'dive bars', 'live music venues', 'dance clubs', 'rooftop bars', 'brewery taprooms'],
      },
    },
    {
      slug: 'outdoors',
      name: 'Outdoor Activities',
      dimension: 'content_type',
      tier: 2,
      context: {
        audience: 'Active locals and visitors who want to explore Des Moines beyond indoor attractions',
        pain_points: 'Trail info outdated, park amenities unclear, seasonal conditions not documented',
        search_behavior: '"des moines trails", "parks near des moines", "hiking des moines area"',
        content_that_works: 'Trail maps with difficulty ratings, seasonal conditions, photo galleries',
        what_makes_it_useful: 'Current conditions, insider tips on best times, hidden spots locals know',
        subtopics: ['hiking trails', 'biking paths', 'kayaking', 'fishing spots', 'disc golf', 'dog parks'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Dimension 2: Location (WHERE)
// ---------------------------------------------------------------------------

export const locationDimension: Dimension = {
  key: 'location',
  name: 'Location',
  description: 'Neighborhoods and suburbs — drives geo-specific content and local SEO',
  values: [
    // --- Tier 1: Core Des Moines neighborhoods ---
    {
      slug: 'downtown',
      name: 'Downtown Des Moines',
      dimension: 'location',
      tier: 1,
      context: {
        audience: 'Office workers, convention visitors, hotel guests within walking distance',
        pain_points: 'Navigating skywalk system, finding parking, knowing what is open after 5pm',
        search_behavior: '"downtown des moines restaurants", "things to do downtown des moines"',
        content_that_works: 'Walkable itineraries, skywalk-accessible options, parking garage maps',
        what_makes_it_useful: 'Practical navigation tips specific to downtown grid and skywalk system',
        subtopics: ['skywalk dining', 'Court Avenue nightlife', 'Western Gateway park area', 'Civic Center events'],
      },
    },
    {
      slug: 'east-village',
      name: 'East Village',
      dimension: 'location',
      tier: 1,
      context: {
        audience: 'Young professionals, foodies, design-conscious visitors seeking trendy experiences',
        pain_points: 'Neighborhood changes fast — new spots open monthly, want to know what is current',
        search_behavior: '"east village des moines restaurants", "east village des moines bars"',
        content_that_works: 'Curated walking tours, new opening spotlights, aesthetic/vibe guides',
        what_makes_it_useful: 'Always-current guide to DSMs trendiest neighborhood with insider perspective',
        subtopics: ['boutique shopping', 'brunch spots', 'cocktail bars', 'art galleries', 'coffee shops'],
      },
    },
    {
      slug: 'valley-junction',
      name: 'Valley Junction',
      dimension: 'location',
      tier: 1,
      context: {
        audience: 'Shoppers, antique lovers, families looking for small-town charm within the metro',
        pain_points: 'Not sure which shops/restaurants are worth the drive, limited parking during events',
        search_behavior: '"valley junction des moines", "valley junction shops", "valley junction farmers market"',
        content_that_works: 'Shop-by-shop guides, event calendars, seasonal market schedules',
        what_makes_it_useful: 'Complete guide to this walkable historic district with specific shop recommendations',
        subtopics: ['antique shops', 'Thursday farmers market', 'holiday events', 'local boutiques', 'restaurants'],
      },
    },
    {
      slug: 'drake',
      name: 'Drake',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Drake University students, nearby residents, visitors exploring diverse dining',
        pain_points: 'Neighborhood perception vs reality — much more than a college area',
        search_behavior: '"drake neighborhood des moines", "restaurants near drake university"',
        content_that_works: 'Neighborhood character profiles, diverse cuisine guides, event listings',
        what_makes_it_useful: 'Highlights the underrated diversity of food and culture in the Drake area',
        subtopics: ['diverse cuisine', 'Drake Relays', 'campus events', 'Dogtown district', 'affordable eats'],
      },
    },
    {
      slug: 'beaverdale',
      name: 'Beaverdale',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Families, young homeowners, people wanting a neighborhood feel within the city',
        pain_points: 'Charming but less well-known to visitors; locals want to support local businesses',
        search_behavior: '"beaverdale des moines", "beaverdale restaurants", "beaverdale fall festival"',
        content_that_works: 'Neighborhood profiles with local business spotlights, seasonal event guides',
        what_makes_it_useful: 'Celebrates neighborhood character with practical guides to local favorites',
        subtopics: ['Beaverdale Fall Festival', 'local shops', 'family restaurants', 'parks', 'holiday events'],
      },
    },
    {
      slug: 'sherman-hill',
      name: 'Sherman Hill',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'History buffs, architecture lovers, residents of this historic district',
        pain_points: 'Beautiful neighborhood but not well-documented for visitors; hidden restaurant gems',
        search_behavior: '"sherman hill des moines", "historic des moines neighborhoods"',
        content_that_works: 'Historic walking tours, architectural highlights, local dining spotlights',
        what_makes_it_useful: 'Unlocks a historic neighborhood most visitors miss — with specific house/building stories',
        subtopics: ['Victorian architecture', 'historic homes tour', 'local dining', 'neighborhood walks'],
      },
    },
    {
      slug: 'ingersoll',
      name: 'Ingersoll',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Residents along the Ingersoll corridor, people seeking local dining and shopping',
        pain_points: 'Long corridor with many options — hard to know which stretch to visit',
        search_behavior: '"ingersoll avenue des moines", "ingersoll restaurants"',
        content_that_works: 'Corridor guides organized by block, walkable itineraries, local favorites',
        what_makes_it_useful: 'Block-by-block guide to one of Des Moines most walkable dining corridors',
        subtopics: ['restaurant row', 'coffee shops', 'boutiques', 'Greenwood Park area'],
      },
    },
    // --- Tier 1: Major suburbs ---
    {
      slug: 'west-des-moines',
      name: 'West Des Moines',
      dimension: 'location',
      tier: 1,
      context: {
        audience: 'Suburban families, business travelers near Jordan Creek, WDM residents',
        pain_points: 'Sprawling area with lots of chain restaurants — want to find the local gems',
        search_behavior: '"west des moines restaurants", "things to do west des moines", "jordan creek area"',
        content_that_works: 'Area-specific guides (Jordan Creek, Valley West, Historic Valley Junction)',
        what_makes_it_useful: 'Separates local gems from chain restaurants in a suburb known for both',
        subtopics: ['Jordan Creek area', 'Valley Junction', 'new restaurant openings', 'family activities', 'Asian cuisine corridor'],
      },
    },
    {
      slug: 'ankeny',
      name: 'Ankeny',
      dimension: 'location',
      tier: 1,
      context: {
        audience: 'Fast-growing suburb residents, families, people who want to stay close to home',
        pain_points: 'Fastest growing city in Iowa — new places opening constantly, hard to keep up',
        search_behavior: '"ankeny restaurants", "things to do in ankeny", "ankeny events"',
        content_that_works: 'New opening alerts, family-focused guides, community event calendars',
        what_makes_it_useful: 'Keeps pace with Ankenys explosive growth — always knows what just opened',
        subtopics: ['Prairie Trail district', 'new openings', 'family events', 'DMACC campus', 'Uptown Ankeny'],
      },
    },
    {
      slug: 'urbandale',
      name: 'Urbandale',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Urbandale residents and families looking for suburban activities',
        pain_points: 'Feels like a bedroom community but has genuine local gems worth discovering',
        search_behavior: '"urbandale restaurants", "things to do urbandale iowa"',
        content_that_works: 'Local business spotlights, park guides, family activity roundups',
        what_makes_it_useful: 'Highlights what makes Urbandale its own destination, not just a suburb',
        subtopics: ['Living History Farms', 'local dining', 'parks and trails', 'community events'],
      },
    },
    {
      slug: 'johnston',
      name: 'Johnston',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Johnston residents, families near Merle Hay corridor, Camp Dodge visitors',
        pain_points: 'Growing fast but local scene still developing; need to know what is worth visiting',
        search_behavior: '"johnston iowa restaurants", "things to do johnston iowa"',
        content_that_works: 'Community event guides, new business spotlights, family activity lists',
        what_makes_it_useful: 'Captures the emergence of Johnstons local identity as it grows',
        subtopics: ['Terra Park', 'Merle Hay corridor', 'community events', 'new developments'],
      },
    },
    {
      slug: 'altoona',
      name: 'Altoona',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Adventureland visitors, Prairie Meadows patrons, Altoona residents',
        pain_points: 'Known only for Adventureland — locals want recognition of broader community',
        search_behavior: '"altoona iowa things to do", "near adventureland des moines"',
        content_that_works: 'Beyond-Adventureland guides, casino dining, family day trip itineraries',
        what_makes_it_useful: 'Shows Altoona as more than a theme park stop — includes local dining and events',
        subtopics: ['Adventureland', 'Prairie Meadows', 'Outlet Mall', 'local restaurants', 'Bass Pro area'],
      },
    },
    {
      slug: 'clive',
      name: 'Clive',
      dimension: 'location',
      tier: 3,
      context: {
        audience: 'Clive residents, people along the 86th Street corridor',
        pain_points: 'Small suburb that often gets lumped in with Urbandale or West Des Moines',
        search_behavior: '"clive iowa restaurants", "things to do clive iowa"',
        content_that_works: 'Greenbelt trail guides, local dining spotlights, community events',
        what_makes_it_useful: 'Gives Clive its own identity with focus on Greenbelt Trail and local dining',
        subtopics: ['Clive Greenbelt Trail', 'local restaurants', 'community center events'],
      },
    },
    {
      slug: 'waukee',
      name: 'Waukee',
      dimension: 'location',
      tier: 2,
      context: {
        audience: 'Waukee families, new residents of one of Iowas fastest growing cities',
        pain_points: 'Explosively growing — new neighborhoods and businesses constantly, hard to track',
        search_behavior: '"waukee iowa restaurants", "things to do waukee"',
        content_that_works: 'New opening roundups, family guides, Kettlestone development updates',
        what_makes_it_useful: 'Tracks Waukees rapid transformation from small town to major suburb',
        subtopics: ['Kettlestone district', 'new restaurants', 'Raccoon River Valley Trail', 'family events'],
      },
    },
    {
      slug: 'pleasant-hill',
      name: 'Pleasant Hill',
      dimension: 'location',
      tier: 3,
      context: {
        audience: 'Pleasant Hill residents, Copper Creek Lake visitors',
        pain_points: 'Small but growing; limited local coverage in typical Des Moines guides',
        search_behavior: '"pleasant hill iowa", "copper creek lake"',
        content_that_works: 'Outdoor recreation guides, local business spotlights',
        what_makes_it_useful: 'Covers a community that is often overlooked in metro area guides',
        subtopics: ['Copper Creek Lake', 'local dining', 'parks', 'community events'],
      },
    },
    {
      slug: 'windsor-heights',
      name: 'Windsor Heights',
      dimension: 'location',
      tier: 3,
      context: {
        audience: 'Windsor Heights residents, University Avenue corridor visitors',
        pain_points: 'Tiny suburb with surprisingly good dining scene that gets overlooked',
        search_behavior: '"windsor heights des moines", "university avenue restaurants des moines"',
        content_that_works: 'Restaurant guides focused on the diverse University Ave dining corridor',
        what_makes_it_useful: 'Highlights the incredible ethnic food diversity along University Avenue',
        subtopics: ['diverse restaurants', 'University Avenue corridor', 'Colby Park', 'local events'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Dimension 3: Audience / Intent (WHO / WHY)
// ---------------------------------------------------------------------------

export const audienceDimension: Dimension = {
  key: 'audience',
  name: 'Audience / Intent',
  description: 'Who the page is for and what they are trying to accomplish',
  values: [
    {
      slug: 'families',
      name: 'For Families',
      dimension: 'audience',
      tier: 1,
      context: {
        audience: 'Parents with kids ages 0-12 looking for age-appropriate activities',
        pain_points: 'Need to know: is it stroller-friendly? Are there changing tables? Will my toddler be bored?',
        search_behavior: '"family friendly des moines", "things to do with kids des moines", "kid activities near me"',
        content_that_works: 'Age-range recommendations, stroller/accessibility notes, mess level warnings, cost per family',
        what_makes_it_useful: 'Parent-tested recommendations with the specific logistics families actually need',
        subtopics: ['toddler-friendly', 'rainy day activities', 'outdoor play', 'educational', 'birthday party venues'],
      },
    },
    {
      slug: 'date-night',
      name: 'Date Night',
      dimension: 'audience',
      tier: 1,
      context: {
        audience: 'Couples looking for romantic or special evening experiences',
        pain_points: 'Want to impress; tired of the same restaurants; need the full evening planned not just dinner',
        search_behavior: '"date night des moines", "romantic restaurants des moines", "date ideas des moines"',
        content_that_works: 'Complete evening itineraries: dinner + drinks + activity, with ambiance descriptions',
        what_makes_it_useful: 'Plans the entire evening — not just a restaurant list but a complete date experience',
        subtopics: ['romantic dinners', 'cocktail bars', 'live music dates', 'unique experiences', 'anniversary spots'],
      },
    },
    {
      slug: 'foodies',
      name: 'For Foodies',
      dimension: 'audience',
      tier: 1,
      context: {
        audience: 'Adventurous eaters, food bloggers, culinary tourists who prioritize food experiences',
        pain_points: 'Tired of basic "top 10" lists; want deep cuts, chef stories, dish-specific recommendations',
        search_behavior: '"best food des moines", "des moines food scene", "hidden gem restaurants des moines"',
        content_that_works: 'Specific dish recommendations, chef interviews, cuisine deep-dives, tasting menus',
        what_makes_it_useful: 'Goes beyond ratings to tell food stories — specific dishes, techniques, sourcing',
        subtopics: ['tasting menus', 'farm-to-table', 'food trucks', 'ethnic cuisine deep dives', 'new openings'],
      },
    },
    {
      slug: 'budget',
      name: 'Budget-Friendly',
      dimension: 'audience',
      tier: 1,
      context: {
        audience: 'Students, young professionals, families on a budget, cost-conscious visitors',
        pain_points: 'Everything seems expensive; free events poorly advertised; want value not just cheap',
        search_behavior: '"free things to do des moines", "cheap eats des moines", "budget des moines"',
        content_that_works: 'Price-transparent guides with exact costs, free alternatives, happy hour deals',
        what_makes_it_useful: 'Honest about costs with creative ways to experience Des Moines affordably',
        subtopics: ['free events', 'happy hour deals', 'cheap eats', 'free museums days', 'student discounts'],
      },
    },
    {
      slug: 'tourists',
      name: 'For Visitors',
      dimension: 'audience',
      tier: 1,
      context: {
        audience: 'First-time visitors, convention attendees, people passing through Iowa',
        pain_points: 'Know nothing about Des Moines; worried it will be boring; need efficient planning',
        search_behavior: '"visiting des moines", "des moines travel guide", "is des moines worth visiting"',
        content_that_works: 'Day-by-day itineraries, must-see lists, logistics (parking, transit, weather prep)',
        what_makes_it_useful: 'Convinces skeptics Des Moines is worth their time and helps them make the most of it',
        subtopics: ['first time visitor guide', '48 hour itinerary', 'getting around', 'best neighborhoods', 'what locals love'],
      },
    },
    {
      slug: 'couples',
      name: 'For Couples',
      dimension: 'audience',
      tier: 2,
      context: {
        audience: 'Couples beyond date night — weekend getaways, anniversary trips, exploring together',
        pain_points: 'Want shared experiences beyond dinner; looking for things to do together as a pair',
        search_behavior: '"couples things to do des moines", "romantic getaway des moines", "weekend trip des moines"',
        content_that_works: 'Paired activity suggestions, weekend getaway itineraries, experience-focused guides',
        what_makes_it_useful: 'Focuses on shared experiences that build connection, not just adjacent dining',
        subtopics: ['weekend getaways', 'cooking classes', 'wine tasting', 'outdoor adventures', 'spa days'],
      },
    },
    {
      slug: 'groups',
      name: 'For Groups',
      dimension: 'audience',
      tier: 2,
      context: {
        audience: 'Friend groups, bachelor/bachelorette parties, corporate outings, reunions',
        pain_points: 'Hard to find places that accommodate large groups; need activities everyone enjoys',
        search_behavior: '"group activities des moines", "party venues des moines", "team building des moines"',
        content_that_works: 'Group-size capacity notes, reservation tips, activity options for mixed interests',
        what_makes_it_useful: 'Solves the hardest part of group planning: finding something everyone agrees on',
        subtopics: ['group dining', 'team building', 'party venues', 'bar crawl routes', 'group activities'],
      },
    },
    {
      slug: 'seniors',
      name: 'For Seniors',
      dimension: 'audience',
      tier: 3,
      context: {
        audience: 'Retirees, older adults, snowbirds visiting family in Des Moines',
        pain_points: 'Accessibility concerns, pace preferences, want enriching not exhausting experiences',
        search_behavior: '"senior activities des moines", "things to do for seniors des moines"',
        content_that_works: 'Accessibility ratings, comfortable pace itineraries, cultural enrichment focus',
        what_makes_it_useful: 'Honest accessibility info and pace-appropriate recommendations',
        subtopics: ['museums', 'gardens', 'gentle trails', 'matinee shows', 'historical tours', 'senior discounts'],
      },
    },
    {
      slug: 'pet-friendly',
      name: 'Pet-Friendly',
      dimension: 'audience',
      tier: 2,
      context: {
        audience: 'Dog owners, pet parents who include pets in outings and travel',
        pain_points: 'Unclear which patios allow dogs, which trails are off-leash, which hotels accept pets',
        search_behavior: '"dog friendly des moines", "pet friendly restaurants des moines", "dog parks des moines"',
        content_that_works: 'Verified pet policies, patio guides, off-leash areas, pet-friendly hotel lists',
        what_makes_it_useful: 'Verified (not guessed) pet policies so you dont show up and get turned away',
        subtopics: ['dog-friendly patios', 'dog parks', 'pet-friendly hotels', 'dog-friendly trails', 'pet events'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Dimension 4: Temporal (WHEN)
// ---------------------------------------------------------------------------

export const temporalDimension: Dimension = {
  key: 'temporal',
  name: 'Temporal',
  description: 'Time-based modifiers that create urgency and relevance',
  values: [
    {
      slug: 'today',
      name: 'Today',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'Someone with immediate free time looking for something to do right now',
        pain_points: 'Need fast answers — no time to research; want to know what is actually happening now',
        search_behavior: '"things to do today des moines", "events today des moines", "what to do today"',
        content_that_works: 'Real-time listings sorted by start time, "still happening" badges, distance from user',
        what_makes_it_useful: 'Shows only what is actually happening today with real-time availability',
        subtopics: ['happening now', 'tonight', 'last minute plans', 'open today'],
      },
    },
    {
      slug: 'this-weekend',
      name: 'This Weekend',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'People planning their weekend by Wednesday-Friday, looking ahead 2-5 days',
        pain_points: 'Want to plan ahead but not too far; need to know what is worth committing to',
        search_behavior: '"things to do this weekend des moines", "des moines weekend events", "this weekend"',
        content_that_works: 'Friday/Saturday/Sunday breakdown with highlights, weather-contingent alternatives',
        what_makes_it_useful: 'Curated weekend preview — not just a list but editorial picks with reasoning',
        subtopics: ['Friday night', 'Saturday activities', 'Sunday brunch', 'all weekend events'],
      },
    },
    {
      slug: 'this-week',
      name: 'This Week',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'People planning their week, looking for weeknight activities',
        pain_points: 'Weeknight events underadvertised; most guides focus only on weekends',
        search_behavior: '"things to do this week des moines", "weeknight events des moines"',
        content_that_works: 'Day-by-day breakdown of the week with highlights for each evening',
        what_makes_it_useful: 'Covers the overlooked weeknight scene — trivia nights, happy hours, classes',
        subtopics: ['Monday specials', 'Tuesday trivia', 'Wednesday events', 'Thursday happy hours', 'weeknight dining'],
      },
    },
    // Seasonal
    {
      slug: 'spring',
      name: 'Spring',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'People emerging from winter, looking for outdoor activities as weather warms',
        pain_points: 'Unpredictable Iowa spring weather; want to know whats open/blooming/happening',
        search_behavior: '"spring things to do des moines", "des moines spring events", "spring activities iowa"',
        content_that_works: 'Weather-aware guides, bloom trackers, opening day info for seasonal attractions',
        what_makes_it_useful: 'Seasonal-specific tips like trail conditions, garden bloom status, patio openings',
        subtopics: ['patio season', 'gardens in bloom', 'farmers markets opening', 'spring festivals', 'outdoor dining'],
      },
    },
    {
      slug: 'summer',
      name: 'Summer',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'Families on break, tourists on summer trips, locals maximizing warm weather',
        pain_points: 'So much happening its overwhelming; Iowa heat and humidity limit outdoor plans',
        search_behavior: '"summer events des moines", "things to do summer des moines", "des moines summer 2026"',
        content_that_works: 'Summer bucket lists, air-conditioned alternatives, water activities, festival guides',
        what_makes_it_useful: 'Curated summer calendar with heat-smart planning — indoor backup options included',
        subtopics: ['Iowa State Fair', 'outdoor concerts', 'splash pads', 'summer festivals', 'lake activities', 'farmers markets'],
      },
    },
    {
      slug: 'fall',
      name: 'Fall',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'People seeking fall foliage, harvest events, football season activities',
        pain_points: 'Peak leaf season is short; want to time visits perfectly; pumpkin patch overload',
        search_behavior: '"fall activities des moines", "fall events des moines", "apple picking des moines"',
        content_that_works: 'Foliage trackers, harvest event calendars, football gameday guides, Halloween roundups',
        what_makes_it_useful: 'Times recommendations to peak experiences — when leaves peak, orchards open, etc.',
        subtopics: ['apple orchards', 'pumpkin patches', 'fall festivals', 'football tailgating', 'Halloween events', 'foliage drives'],
      },
    },
    {
      slug: 'winter',
      name: 'Winter',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'Locals battling cabin fever, holiday visitors, people needing indoor activities',
        pain_points: 'Cold and dark; limited outdoor options; need reasons to leave the house',
        search_behavior: '"winter things to do des moines", "indoor activities des moines", "holiday events des moines"',
        content_that_works: 'Indoor activity guides, holiday event calendars, cozy restaurant lists, snow day plans',
        what_makes_it_useful: 'Combats Iowa winter blues with creative indoor experiences and cozy picks',
        subtopics: ['holiday lights', 'ice skating', 'indoor play', 'cozy restaurants', 'holiday markets', 'New Years Eve'],
      },
    },
    // Monthly
    {
      slug: 'january',
      name: 'January',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Post-holiday locals looking for things to do, winter activity seekers',
        pain_points: 'Dead of winter; holiday buzz is over; need motivation to get out',
        search_behavior: '"january events des moines", "things to do january des moines"',
        content_that_works: 'Indoor events, restaurant week previews, winter sports, new year fitness activities',
        what_makes_it_useful: 'Curates the best reasons to brave the cold in Des Moines deepest winter month',
        subtopics: ['Restaurant Week', 'indoor events', 'winter sports', 'new year activities'],
      },
    },
    {
      slug: 'february',
      name: 'February',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Valentine planners, winter-weary locals, families during school breaks',
        pain_points: 'Valentines planning stress; still cold; looking forward to spring',
        search_behavior: '"february events des moines", "valentines day des moines", "winter break activities"',
        content_that_works: 'Valentines guides, winter break family activities, late-winter indoor picks',
        what_makes_it_useful: 'Comprehensive Valentines planning plus family winter break activity guides',
        subtopics: ['Valentines Day', 'winter break', 'indoor activities', 'romantic restaurants'],
      },
    },
    {
      slug: 'march',
      name: 'March',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Spring-anticipating locals, March Madness fans, St Patricks Day celebrators',
        pain_points: 'Weather teases spring but still cold; cabin fever at peak; want outdoor options',
        search_behavior: '"march events des moines", "st patricks day des moines", "spring break des moines"',
        content_that_works: 'Spring preview guides, St Patricks Day bar crawls, early outdoor options, March Madness watch spots',
        what_makes_it_useful: 'Bridges the gap between winter and spring with early-season outdoor picks',
        subtopics: ['St Patricks Day', 'March Madness viewing', 'spring break', 'early spring outdoors'],
      },
    },
    {
      slug: 'april',
      name: 'April',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Outdoor enthusiasts, garden lovers, Drake Relays fans',
        pain_points: 'Rainy season; events weather-dependent; want reliable indoor backup options',
        search_behavior: '"april events des moines", "drake relays", "spring events des moines"',
        content_that_works: 'Drake Relays guides, spring festival previews, garden opening info, rain-or-shine options',
        what_makes_it_useful: 'Rain-or-shine planning with indoor alternatives for every outdoor recommendation',
        subtopics: ['Drake Relays', 'Earth Day events', 'garden openings', 'spring festivals', 'patio openings'],
      },
    },
    {
      slug: 'may',
      name: 'May',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Outdoor lovers, graduation party planners, Memorial Day weekend visitors',
        pain_points: 'Perfect weather but busy season begins; graduation crowds; booking up fast',
        search_behavior: '"may events des moines", "memorial day des moines", "graduation dinner des moines"',
        content_that_works: 'Memorial Day guides, outdoor season openers, graduation celebration venues, farmers market launches',
        what_makes_it_useful: 'Helps plan around graduation season rush and Memorial Day weekend',
        subtopics: ['Memorial Day', 'graduation venues', 'farmers markets', 'outdoor concerts', 'patio dining'],
      },
    },
    {
      slug: 'june',
      name: 'June',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Summer visitors, families starting summer break, outdoor event seekers',
        pain_points: 'Summer calendar filling up fast; want to get tickets/reservations early',
        search_behavior: '"june events des moines", "summer activities des moines", "things to do june des moines"',
        content_that_works: 'Summer kickoff guides, outdoor music series, pool and splash pad guides, pride events',
        what_makes_it_useful: 'First full summer month guide with early-bird picks before things sell out',
        subtopics: ['Capital City Pride', 'outdoor music', 'summer camps', 'pool guides', 'road trips from DSM'],
      },
    },
    {
      slug: 'july',
      name: 'July',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Families, 4th of July visitors, peak summer travelers',
        pain_points: 'Heat management; crowded attractions; 4th of July planning; finding shade',
        search_behavior: '"july events des moines", "4th of july des moines", "summer things to do des moines"',
        content_that_works: 'Fireworks guides, beat-the-heat activities, water parks, shaded outdoor options',
        what_makes_it_useful: 'Heat-smart summer planning with the best fireworks viewing spots and AC escapes',
        subtopics: ['4th of July fireworks', 'water parks', 'cooling off spots', 'outdoor movies', 'summer concerts'],
      },
    },
    {
      slug: 'august',
      name: 'August',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'Iowa State Fair visitors (the biggest event of the year), back-to-school families',
        pain_points: 'State Fair logistics overwhelming; extreme heat; back-to-school crunch',
        search_behavior: '"iowa state fair", "august events des moines", "state fair tips", "back to school des moines"',
        content_that_works: 'Comprehensive State Fair guides (food, schedule, tips), back-to-school events, last-hurrah summer activities',
        what_makes_it_useful: 'THE definitive Iowa State Fair survival guide plus end-of-summer must-dos',
        subtopics: ['Iowa State Fair', 'State Fair food guide', 'State Fair tips', 'back to school', 'end of summer events'],
      },
    },
    {
      slug: 'september',
      name: 'September',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Football fans, fall activity seekers, people enjoying post-summer cool down',
        pain_points: 'Transition from summer to fall programming; football season logistics',
        search_behavior: '"september events des moines", "fall activities des moines", "football watch des moines"',
        content_that_works: 'Football gameday guides, early fall festival previews, back-to-routine activity lists',
        what_makes_it_useful: 'Eases the summer-to-fall transition with the best of both seasons',
        subtopics: ['football season', 'fall festivals', 'apple picking', 'Labor Day', 'harvest events'],
      },
    },
    {
      slug: 'october',
      name: 'October',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Halloween seekers, fall foliage chasers, pumpkin patch families',
        pain_points: 'Too many pumpkin patches — which are actually worth the drive? Halloween overload.',
        search_behavior: '"october events des moines", "halloween des moines", "pumpkin patch des moines", "haunted houses des moines"',
        content_that_works: 'Halloween event roundups, haunted house rankings, pumpkin patch comparisons, foliage peak guides',
        what_makes_it_useful: 'Cuts through pumpkin-spice overload with honest rankings and spooky-level ratings',
        subtopics: ['Halloween events', 'haunted houses', 'pumpkin patches', 'fall foliage', 'corn mazes', 'Oktoberfest'],
      },
    },
    {
      slug: 'november',
      name: 'November',
      dimension: 'temporal',
      tier: 2,
      context: {
        audience: 'Holiday planners, Thanksgiving hosts, early Christmas shoppers',
        pain_points: 'Thanksgiving restaurant options unclear; holiday event season starting; shopping stress',
        search_behavior: '"november events des moines", "thanksgiving des moines", "holiday events des moines"',
        content_that_works: 'Thanksgiving dining guides, holiday light preview, Black Friday local shopping guides',
        what_makes_it_useful: 'Thanksgiving restaurant guide plus early bird holiday event calendar',
        subtopics: ['Thanksgiving dining', 'holiday lights preview', 'Black Friday local', 'Small Business Saturday', 'holiday markets opening'],
      },
    },
    {
      slug: 'december',
      name: 'December',
      dimension: 'temporal',
      tier: 1,
      context: {
        audience: 'Holiday celebrators, families, visitors home for the holidays',
        pain_points: 'Overwhelmed by holiday events; need curated list not everything; NYE planning',
        search_behavior: '"december events des moines", "christmas des moines", "new years eve des moines", "holiday lights des moines"',
        content_that_works: 'Holiday light tours, Christmas event guides, NYE party rankings, gift shop guides',
        what_makes_it_useful: 'Curated holiday magic — the best lights, markets, and parties without the overwhelm',
        subtopics: ['holiday lights', 'Christmas events', 'New Years Eve', 'holiday markets', 'Santa visits', 'holiday dining'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Dimension 5: Category (SPECIFIC)
// ---------------------------------------------------------------------------

export const categoryDimension: Dimension = {
  key: 'category',
  name: 'Category',
  description: 'Specific content categories within each content type',
  values: [
    // --- Restaurant cuisines (Tier 1) ---
    {
      slug: 'italian',
      name: 'Italian',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Italian food lovers seeking pasta, pizza, and upscale Italian dining',
        pain_points: 'Hard to distinguish authentic Italian from Olive-Garden-level chains',
        search_behavior: '"italian restaurants des moines", "best pasta des moines", "pizza des moines"',
        content_that_works: 'Authenticity ratings, specific pasta/pizza recommendations, wine pairing notes',
        what_makes_it_useful: 'Separates authentic from Americanized Italian with specific dish deep-dives',
        subtopics: ['authentic Italian', 'best pizza', 'pasta dishes', 'Italian wine bars', 'Italian date night'],
      },
    },
    {
      slug: 'mexican',
      name: 'Mexican',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Mexican food enthusiasts, Hispanic community, taco lovers',
        pain_points: 'Huge range from Tex-Mex to authentic regional Mexican — want specificity',
        search_behavior: '"mexican restaurants des moines", "best tacos des moines", "authentic mexican des moines"',
        content_that_works: 'Regional cuisine guides (Oaxacan, Michoacan, etc.), specific taco rankings, margarita reviews',
        what_makes_it_useful: 'Differentiates between Tex-Mex and authentic regional Mexican with specific recommendations',
        subtopics: ['authentic tacos', 'margaritas', 'Tex-Mex', 'regional Mexican', 'food trucks', 'tamales'],
      },
    },
    {
      slug: 'asian',
      name: 'Asian',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Asian food lovers, Asian-American community, adventurous eaters',
        pain_points: 'Generic "Asian" category lumps together vastly different cuisines',
        search_behavior: '"asian restaurants des moines", "chinese food des moines", "thai food des moines", "pho des moines"',
        content_that_works: 'Cuisine-specific guides (Vietnamese, Thai, Chinese, Korean, Japanese), dish recommendations',
        what_makes_it_useful: 'Respects the diversity of Asian cuisines with specific regional recommendations',
        subtopics: ['Vietnamese pho', 'Thai curry', 'Chinese dim sum', 'Korean BBQ', 'Japanese ramen', 'sushi', 'bubble tea'],
      },
    },
    {
      slug: 'bbq',
      name: 'BBQ & Smokehouse',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'BBQ enthusiasts, meat lovers, people seeking Iowa/Midwest BBQ tradition',
        pain_points: 'Iowa BBQ underrated nationally; want to find real smoke not just sauce',
        search_behavior: '"bbq des moines", "best barbecue des moines", "smoked meat des moines"',
        content_that_works: 'Smoke method comparisons, meat-specific rankings (brisket, ribs, pulled pork), side dish reviews',
        what_makes_it_useful: 'Evaluates BBQ by the standards that matter — smoke ring, bark, tenderness, not just sauce',
        subtopics: ['brisket', 'ribs', 'pulled pork', 'BBQ sides', 'competition BBQ', 'smokehouses'],
      },
    },
    {
      slug: 'brunch',
      name: 'Brunch',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Weekend brunch seekers, mimosa lovers, late-morning socializers',
        pain_points: 'Long waits at popular spots; want to know wait times, reservation policies, bottomless deals',
        search_behavior: '"best brunch des moines", "brunch near me", "sunday brunch des moines"',
        content_that_works: 'Wait time estimates, reservation tips, bottomless mimosa deals, best specific dishes',
        what_makes_it_useful: 'Practical brunch intel: when to go, what to order, how to skip the wait',
        subtopics: ['bottomless mimosas', 'eggs benedict rankings', 'brunch buffets', 'weekend-only menus', 'outdoor brunch'],
      },
    },
    {
      slug: 'coffee',
      name: 'Coffee & Cafes',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Coffee enthusiasts, remote workers seeking workspaces, cafe culture lovers',
        pain_points: 'Want good coffee AND good atmosphere; need to know wifi quality and seating availability',
        search_behavior: '"best coffee des moines", "coffee shops des moines", "cafes near me", "work from cafe des moines"',
        content_that_works: 'Vibe ratings, wifi speed notes, best drinks, workspace-friendly rankings',
        what_makes_it_useful: 'Rates coffee shops on what actually matters: coffee quality, vibe, wifi, power outlets',
        subtopics: ['specialty coffee', 'work-friendly cafes', 'latte art', 'local roasters', 'drive-thru coffee'],
      },
    },
    {
      slug: 'steakhouse',
      name: 'Steakhouses',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Special occasion diners, meat lovers, business dinner hosts',
        pain_points: 'Expensive category — need to know which are worth the splurge',
        search_behavior: '"best steakhouse des moines", "steak restaurants des moines"',
        content_that_works: 'Cut comparisons, price-to-quality ratios, ambiance for occasions, best sides',
        what_makes_it_useful: 'Honest value assessments — which steakhouses are worth $60+ per person',
        subtopics: ['prime cuts', 'business dinners', 'special occasions', 'happy hour steak deals'],
      },
    },
    // --- Event categories ---
    {
      slug: 'live-music',
      name: 'Live Music',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Music fans, concert-goers, people seeking nightlife with live entertainment',
        pain_points: 'Events scattered across venue sites, Facebook, Songkick; want one consolidated calendar',
        search_behavior: '"live music des moines", "concerts des moines", "des moines shows tonight"',
        content_that_works: 'Venue guides, genre filters, upcoming show calendars, ticket price comparisons',
        what_makes_it_useful: 'Single source for ALL live music in Des Moines with venue vibe guides',
        subtopics: ['concerts', 'open mic nights', 'jazz clubs', 'country music', 'indie shows', 'cover bands'],
      },
    },
    {
      slug: 'festivals',
      name: 'Festivals',
      dimension: 'category',
      tier: 1,
      context: {
        audience: 'Festival-goers, families seeking multi-day community events',
        pain_points: 'Festival logistics unclear — parking, timing, what to bring, can you bring food/drinks',
        search_behavior: '"des moines festivals", "festivals near me", "des moines festival calendar"',
        content_that_works: 'Complete survival guides: what to bring, parking maps, must-see acts, food vendor picks',
        what_makes_it_useful: 'Goes beyond the lineup to give practical festival survival tips',
        subtopics: ['music festivals', 'food festivals', 'cultural festivals', 'art festivals', 'holiday festivals'],
      },
    },
    {
      slug: 'arts-culture',
      name: 'Arts & Culture',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Art lovers, theater-goers, culturally curious residents and visitors',
        pain_points: 'Des Moines arts scene underrated; people dont realize how much is available',
        search_behavior: '"des moines art", "theater des moines", "museums des moines", "gallery walk des moines"',
        content_that_works: 'Exhibition previews, show reviews, gallery walk guides, free art opportunities',
        what_makes_it_useful: 'Showcases Des Moines surprisingly rich arts scene with insider access',
        subtopics: ['galleries', 'theater shows', 'museum exhibitions', 'public art walks', 'art classes', 'Sculpture Park'],
      },
    },
    {
      slug: 'sports',
      name: 'Sports',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Sports fans, families wanting game experiences, fantasy sports players',
        pain_points: 'Local sports teams under-promoted; game day logistics unclear',
        search_behavior: '"des moines sports", "iowa cubs games", "iowa wolves", "des moines buccaneers"',
        content_that_works: 'Game day guides, tailgating tips, family-friendly game experiences, sports bar rankings',
        what_makes_it_useful: 'Complete gameday experience guides — not just scores but the whole outing',
        subtopics: ['Iowa Cubs', 'Iowa Wolves', 'Iowa Wild', 'Cyclones watch parties', 'Hawkeyes watch parties', 'youth sports'],
      },
    },
    {
      slug: 'farmers-markets',
      name: 'Farmers Markets',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Local food enthusiasts, health-conscious shoppers, weekend activity seekers',
        pain_points: 'Multiple markets on different days/locations; dont know which vendors are at which',
        search_behavior: '"des moines farmers market", "farmers markets near me", "saturday market des moines"',
        content_that_works: 'Market comparisons, must-visit vendor spotlights, seasonal produce guides, parking tips',
        what_makes_it_useful: 'Vendor-level detail so you know exactly which market to visit for what you want',
        subtopics: ['Downtown Saturday Market', 'vendor spotlights', 'seasonal produce', 'prepared food vendors', 'weekday markets'],
      },
    },
    // --- Attraction types ---
    {
      slug: 'museums',
      name: 'Museums',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Families, history buffs, art lovers, tourists checking off must-see attractions',
        pain_points: 'Admission costs add up; want to know which are genuinely worth the price',
        search_behavior: '"des moines museums", "museums near me", "free museum days des moines"',
        content_that_works: 'Visit duration estimates, best exhibits, free admission days, age-appropriate ratings',
        what_makes_it_useful: 'Honest time and value estimates — know if a museum is a 1-hour or 3-hour visit',
        subtopics: ['art museums', 'science center', 'historical museums', 'childrens museums', 'free admission days'],
      },
    },
    {
      slug: 'parks',
      name: 'Parks & Nature',
      dimension: 'category',
      tier: 2,
      context: {
        audience: 'Outdoor lovers, families with kids, fitness enthusiasts, nature seekers',
        pain_points: 'Park amenities unclear online; trail conditions not reported; playground quality varies',
        search_behavior: '"parks des moines", "hiking trails des moines", "playgrounds des moines"',
        content_that_works: 'Amenity checklists, trail difficulty ratings, playground equipment photos, seasonal notes',
        what_makes_it_useful: 'Actually tells you what is at each park — not just a pin on a map',
        subtopics: ['hiking trails', 'playgrounds', 'splash pads', 'picnic areas', 'fishing spots', 'dog parks'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// All Dimensions
// ---------------------------------------------------------------------------

export const allDimensions: Dimension[] = [
  contentTypeDimension,
  locationDimension,
  audienceDimension,
  temporalDimension,
  categoryDimension,
];

// ---------------------------------------------------------------------------
// Combination Logic & Page Generation
// ---------------------------------------------------------------------------

export interface PageCombination {
  /** URL slug path segments */
  slugPath: string;
  /** Human-readable page title */
  title: string;
  /** SEO-optimized H1 */
  h1: string;
  /** Meta description template */
  metaDescription: string;
  /** Dimensions involved */
  dimensions: Partial<Record<DimensionKey, DimensionValue>>;
  /** Estimated search volume tier */
  tier: 1 | 2 | 3;
}

/**
 * Returns all valid page combinations for a given page type.
 * Tier 1 combinations are generated first (highest priority).
 */
export function generateCombinations(
  pageType: PageTypeConfig
): PageCombination[] {
  const combos: PageCombination[] = [];
  const dims = pageType.dimensions;

  // Get values for each dimension slot
  const slotValues = dims.map((dimKey) => {
    const dim = allDimensions.find((d) => d.key === dimKey);
    return dim ? dim.values : [];
  });

  // Generate cross-product
  function crossProduct(
    index: number,
    current: DimensionValue[]
  ): void {
    if (index === slotValues.length) {
      const combo = buildCombination(pageType, current);
      if (combo) combos.push(combo);
      return;
    }
    for (const val of slotValues[index]) {
      crossProduct(index + 1, [...current, val]);
    }
  }

  crossProduct(0, []);

  // Sort by tier (1 first)
  combos.sort((a, b) => a.tier - b.tier);
  return combos;
}

function buildCombination(
  pageType: PageTypeConfig,
  values: DimensionValue[]
): PageCombination | null {
  const dims: Partial<Record<DimensionKey, DimensionValue>> = {};
  for (const v of values) {
    dims[v.dimension] = v;
  }

  // Calculate combined tier (average, rounded up)
  const avgTier = Math.ceil(
    values.reduce((sum, v) => sum + v.tier, 0) / values.length
  );
  const tier = Math.min(avgTier, 3) as 1 | 2 | 3;

  const slugPath = pageType.buildSlug(dims);
  const title = pageType.buildTitle(dims);
  const h1 = pageType.buildH1(dims);
  const metaDescription = pageType.buildMetaDescription(dims);

  return { slugPath, title, h1, metaDescription, dimensions: dims, tier };
}

// ---------------------------------------------------------------------------
// Page Type Config Interface
// ---------------------------------------------------------------------------

export interface PageTypeConfig {
  id: string;
  name: string;
  description: string;
  /** Which dimensions this page type combines */
  dimensions: DimensionKey[];
  /** URL pattern builder */
  buildSlug: (dims: Partial<Record<DimensionKey, DimensionValue>>) => string;
  /** Page <title> builder */
  buildTitle: (dims: Partial<Record<DimensionKey, DimensionValue>>) => string;
  /** H1 heading builder */
  buildH1: (dims: Partial<Record<DimensionKey, DimensionValue>>) => string;
  /** Meta description builder */
  buildMetaDescription: (dims: Partial<Record<DimensionKey, DimensionValue>>) => string;
  /** Estimated pages this type will generate */
  estimatedPages: number;
}

// ---------------------------------------------------------------------------
// Helper: Get all values for a dimension
// ---------------------------------------------------------------------------

export function getDimensionValues(key: DimensionKey): DimensionValue[] {
  const dim = allDimensions.find((d) => d.key === key);
  return dim ? dim.values : [];
}

export function getDimensionValue(
  key: DimensionKey,
  slug: string
): DimensionValue | undefined {
  return getDimensionValues(key).find((v) => v.slug === slug);
}

// ---------------------------------------------------------------------------
// Taxonomy Statistics
// ---------------------------------------------------------------------------

export function getTaxonomyStats() {
  const stats = {
    dimensions: allDimensions.length,
    totalValues: 0,
    byDimension: {} as Record<string, { total: number; tier1: number; tier2: number; tier3: number }>,
  };

  for (const dim of allDimensions) {
    const tier1 = dim.values.filter((v) => v.tier === 1).length;
    const tier2 = dim.values.filter((v) => v.tier === 2).length;
    const tier3 = dim.values.filter((v) => v.tier === 3).length;
    stats.byDimension[dim.key] = {
      total: dim.values.length,
      tier1,
      tier2,
      tier3,
    };
    stats.totalValues += dim.values.length;
  }

  return stats;
}
