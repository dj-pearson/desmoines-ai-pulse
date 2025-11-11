# AI-First Transformation Roadmap
## Des Moines AI Pulse: From Directory to Conversational Intelligence Platform

**Document Version:** 1.0  
**Created:** 2024-11-11  
**Timeline:** 6 Months (Month 0 = November 2024)  
**Status:** Active Development Roadmap  
**Strategic Goal:** Become the undisputed leader in AI-powered local discovery, creating a moat competitors cannot cross

---

## Executive Vision

Transform Des Moines AI Pulse from a content aggregation platform into the **first truly conversational city guide** that understands context, learns from behavior, and proactively assists users across every channel (web, SMS, voice, ChatGPT). Build technical and data moats that create 12-18 month competitive advantages.

### North Star Metrics (6-Month Targets)
- **10,000+ monthly active users** (from current baseline)
- **50+ AI conversations daily** (SMS + ChatGPT + web chat)
- **5 paying hotel partners** at $500-2000/month each
- **100+ businesses** using analytics dashboard
- **1 white-label city** contract signed
- **$15k+ MRR** from B2B services

---

## Phase 1: Foundation - AI Enhancement Layer
**Timeline:** Month 1-2 (November-December 2024)  
**Theme:** "Make the AI Actually Intelligent"  
**Investment:** Development time + $500 infrastructure

### Month 1: Semantic Search & ChatGPT Plugin

#### Week 1: Infrastructure Setup
**Objective:** Enable semantic understanding of queries

**Deliverables:**
1. **Vector Database Integration**
   - Add pgvector extension to Supabase PostgreSQL
   - Create embeddings table schema: `content_embeddings`
   - Fields: `id`, `content_type`, `content_id`, `embedding`, `metadata`, `last_updated`
   - Index: IVFFlat index for similarity search

2. **Embedding Generation Pipeline**
   - Edge function: `generate-embeddings`
   - Input: Event/restaurant/article content
   - Process: Send to Claude/OpenAI for embedding generation
   - Store: Save embedding vectors to database
   - Batch process: All existing content (1000+ events, 200+ restaurants)
   
3. **Semantic Search API**
   - New edge function: `semantic-search`
   - Input: Natural language query ("romantic dinner with live music")
   - Process: Generate query embedding, cosine similarity search
   - Output: Ranked results with relevance scores
   - Fallback: Traditional keyword search if semantic fails

**Success Criteria:**
- "Find places like Zombie Burger but healthier" returns accurate results
- Search latency < 500ms
- Relevance score correlation > 0.8 with manual testing

**Technical Notes for Agent:**
- Use `pgvector` with cosine distance for similarity
- Embedding dimension: 1536 (OpenAI) or 768 (Claude)
- Cache embeddings, regenerate only on content updates
- Implement hybrid search: semantic + keyword + filters

---

#### Week 2-3: ChatGPT Plugin Development
**Objective:** Make Des Moines data accessible via ChatGPT

**Deliverables:**
1. **OpenAPI Specification**
   - File: `/.well-known/openapi.yaml`
   - Document all public endpoints:
     - `GET /api/v1/events/search` - Semantic event search
     - `GET /api/v1/events/{id}` - Event details
     - `GET /api/v1/restaurants/search` - Restaurant search
     - `GET /api/v1/restaurants/{id}` - Restaurant details
     - `GET /api/v1/recommendations` - Personalized suggestions
   - Include clear descriptions, parameter types, examples
   - Plain-English summaries for each endpoint

2. **Plugin Manifest**
   - File: `/.well-known/ai-plugin.json`
   - Plugin metadata:
     - Name: "Des Moines AI Pulse"
     - Description: "Discover 1000+ events, 200+ restaurants, and attractions in Des Moines, Iowa with AI-powered recommendations"
     - Auth: API key (later: OAuth)
     - Logo URL, legal info URL
   - Link to OpenAPI spec

3. **Endpoint Optimization**
   - Limit exposed endpoints to 5-6 (ChatGPT best practice)
   - Response format: Concise, structured JSON
   - Include "human-friendly" fields: formatted dates, readable addresses
   - Add contextual metadata: "This event is popular (127 views today)"

4. **Testing & Submission**
   - Test plugin in ChatGPT developer mode
   - Validate queries:
     - "What's happening in Des Moines this weekend?"
     - "Find me a good Italian restaurant downtown"
     - "Plan a day trip for a family with kids"
   - Submit to OpenAI plugin store
   - Create landing page: `/chatgpt-plugin`

**Success Criteria:**
- Plugin approved by OpenAI within 2 weeks
- 90%+ query success rate in testing
- Average response time < 2 seconds
- Zero authentication errors

**Technical Notes for Agent:**
- Keep responses under 2000 tokens (ChatGPT context limits)
- Include fallback descriptions if API fails
- Log all ChatGPT queries for analytics
- Rate limit: 100 requests/hour per user initially

---

#### Week 4: AI Trip Planner MVP
**Objective:** Signature feature - automated itinerary generation

**Deliverables:**
1. **Frontend Interface**
   - New page: `/trip-planner`
   - Form inputs:
     - Duration: 1-7 days
     - Interests: Multi-select (food, arts, music, family, outdoors, nightlife)
     - Hotel/location: Address or hotel name
     - Dates: Date range picker
     - Budget: $ to $$$$
     - Party size & composition (adults, kids)
   - Output: Interactive timeline view (FullCalendar)

2. **AI Planner Algorithm**
   - Edge function: `generate-trip-plan`
   - Process:
     1. Semantic search for events matching interests + dates
     2. Restaurant recommendations near events
     3. Calculate travel times (Google Maps API)
     4. Optimize schedule: Pack activities, add buffer time
     5. Add variety: Mix event types, avoid repetition
     6. Consider timing: Morning/afternoon/evening appropriateness
   - Use Claude for intelligent ordering and descriptions

3. **Itinerary Output**
   - Day-by-day breakdown
   - Hour-by-hour schedule with:
     - Activity name, address, duration
     - Travel time to next location
     - Estimated cost
     - Booking links / reservation buttons
   - PDF export capability
   - "Add to Calendar" for each activity
   - Share link (unique URL)

4. **Alternative Suggestions**
   - "If weather changes" alternatives
   - "If this is full" backups for each slot
   - Real-time availability checking (where possible)

**Success Criteria:**
- Generate complete 3-day itinerary in < 30 seconds
- User satisfaction survey: 8+ / 10 average
- 50+ itineraries generated in first month
- 30%+ conversion to actual bookings (tracked via links)

**Technical Notes for Agent:**
- Constraint solver for optimization (time + location + variety)
- Cache popular itinerary patterns
- Learn from user modifications (track what they change)
- Maximum 8 activities per day (avoid overwhelm)

---

### Month 2: SMS Concierge & Voice Interface

#### Week 5-6: WhatsApp/SMS Bot
**Objective:** Zero-friction conversational access via text

**Deliverables:**
1. **Twilio Integration**
   - Set up Twilio account
   - Purchase phone number: 515-DES-MOIN (or similar memorable number)
   - Configure webhook: Points to Supabase Edge Function
   - Enable WhatsApp Business API

2. **Conversational Engine**
   - Edge function: `sms-concierge`
   - Input: SMS/WhatsApp message from user
   - Process:
     1. Parse intent (dinner, event, plan, help)
     2. Extract entities (date, time, location, cuisine, price)
     3. Query database (semantic search)
     4. Format response for SMS (160 char-friendly)
     5. Store conversation context (multi-turn)
   - Use Claude for natural language understanding

3. **Conversation Flows**
   - **Discovery Flow:**
     - User: "dinner downtown tonight"
     - Bot: "Found 3 restaurants:
            1. Centro [Italian, $$, 7pm available]
            2. Malo [Mexican, $$, 6:30pm open]
            3. Harbinger [New American, $$$, 8pm table]
            Reply 1-3 for details or 'more' for options"
   
   - **Planning Flow:**
     - User: "plan saturday with kids"
     - Bot: "Great! What time do you want to start?
            Reply: Morning (9am) / Afternoon (1pm) / All day"
   
   - **Booking Flow:**
     - User: "1" (after seeing restaurants)
     - Bot: "Centro - 1003 Locust St
            Italian cuisine, $$, 4.5★ (89 reviews)
            Available: 7:00pm, 7:30pm, 8:00pm
            Reply time for reservation link"

4. **Sponsored Results**
   - Marked as "Featured" or "Sponsored"
   - Businesses can bid for top placement
   - Tracked separately for conversion metrics

5. **Marketing Campaign**
   - Landing page: `/sms` explaining the service
   - Social media: "Text 'dinner' to 515-DES-MOIN"
   - Physical marketing: Cards at hotels, restaurants
   - QR codes at tourist spots

**Success Criteria:**
- 500+ SMS conversations in first month
- 70%+ intent recognition accuracy
- Average conversation: 3-5 messages to resolution
- 20%+ conversion to action (reservation, ticket, visit)

**Technical Notes for Agent:**
- Store conversation history: Last 5 messages for context
- Timeout: 30 minutes, then reset context
- Rate limit: 10 messages per 5 minutes per number
- Cost estimate: $0.01-0.02 per message (Twilio)
- Support emoji responses: 👍 = yes, ❌ = cancel

---

#### Week 7-8: Voice Assistant Integration
**Objective:** "Alexa/Google, ask Des Moines AI what's happening tonight"

**Deliverables:**
1. **Alexa Skill**
   - Skill name: "Des Moines AI Pulse"
   - Invocation: "Ask Des Moines AI..."
   - Intents:
     - FindEvent: "what events are happening [date]"
     - FindRestaurant: "find [cuisine] restaurants [location]"
     - PlanDay: "plan a day for [party type]"
     - GetDetails: "tell me more about [event/restaurant name]"
   - Responses: Conversational, structured
   - Account linking for personalization

2. **Google Assistant Action**
   - Similar intents and responses
   - Use Actions on Google framework
   - Deep linking to web pages

3. **Backend API**
   - Edge function: `voice-assistant`
   - Parse Alexa/Google request JSON
   - Same logic as SMS concierge
   - Format response for voice:
     - Short sentences
     - Clear enumeration ("First option is...")
     - Avoid URLs (use "I've sent details to your phone")

4. **Cross-Channel Integration**
   - Voice → SMS: "I've texted you the details"
   - Voice → Email: "I've emailed you the itinerary"
   - Voice → App: "Open the app for more details"

**Success Criteria:**
- Skills live on Alexa and Google stores
- 100+ voice queries in first month
- 90%+ intent recognition accuracy
- Integration with user accounts (linked)

**Technical Notes for Agent:**
- Voice sessions are stateless (no context retention)
- Keep responses under 90 words (spoken limit)
- SSML for better pronunciation of street names
- Test with various accents and speech patterns

---

### Phase 1 Deliverables Summary
✅ Semantic search operational  
✅ ChatGPT plugin approved and live  
✅ AI Trip Planner generating itineraries  
✅ SMS concierge responding to queries  
✅ Voice assistants integrated  
✅ 1000+ user conversations handled

**Investment Recap:**
- Twilio: ~$50/month
- OpenAI/Claude embeddings: ~$200/month
- Development time: 160 hours
- Total: ~$500/month + labor

---

## Phase 2: Data Moat - Intelligence Layer
**Timeline:** Month 3-4 (January-February 2025)  
**Theme:** "Build the Intelligence No One Else Has"  
**Investment:** $1000/month + development time

### Month 3: Behavioral Analytics & Predictive Intelligence

#### Week 9-10: User Behavior Tracking System
**Objective:** Capture every interaction to build recommendation intelligence

**Deliverables:**
1. **Event Tracking Schema**
   - New table: `user_interactions`
   - Fields:
     - `user_id` (anonymous hash if not logged in)
     - `session_id`
     - `interaction_type` (view, search, favorite, share, book)
     - `content_type` (event, restaurant, article)
     - `content_id`
     - `context` (JSONB: search query, referrer, filters used)
     - `timestamp`
     - `device_type`, `location`
   - Privacy-first: Anonymize, aggregate, expire after 90 days

2. **Tracking Implementation**
   - Frontend: Event listeners on all interactions
   - Edge function: `track-interaction`
   - Batch sends: Queue interactions, send every 30 seconds
   - Offline support: Queue when offline, sync when online

3. **Analytics Dashboard (Internal)**
   - Admin page: `/admin/analytics/behavior`
   - Visualizations:
     - Search queries wordcloud
     - Popular event/restaurant combinations
     - User journey flowcharts
     - Drop-off points
     - Time-of-day patterns
   - Export: CSV for deeper analysis

4. **Pattern Detection**
   - Edge function: `analyze-patterns` (runs daily)
   - Detect:
     - "Users who search X often view Y"
     - "After viewing [event], users search [cuisine]"
     - "Weekend planners start searching Thursday 7pm"
     - "Families search Saturday morning for same-day activities"
   - Store patterns in `behavior_patterns` table

**Success Criteria:**
- Track 10,000+ interactions in Month 3
- Identify 20+ statistically significant patterns
- Zero PII leaks (GDPR compliant)
- Dashboard load time < 2 seconds

**Technical Notes for Agent:**
- Use PostHog or Mixpanel SDK (or custom)
- Implement consent banner (GDPR/CCPA)
- Hash IP addresses before storage
- Aggregate patterns, delete raw data after 90 days

---

#### Week 11-12: Predictive Analytics Engine
**Objective:** Predict demand, suggest optimal times, proactive recommendations

**Deliverables:**
1. **Demand Prediction Model**
   - For each venue/event:
     - Historical data: Views, bookings, capacity over time
     - Variables: Day of week, weather, competing events
     - Model: Simple regression or time-series (Prophet)
   - Output: Predicted attendance/demand for next 30 days

2. **Business Intelligence Dashboard**
   - New product: Subscription for businesses ($99-299/month)
   - Page: `/business/analytics` (auth-gated)
   - Features for restaurants/venues:
     - **Demand Forecast:** "Expect 200 customers next Saturday (±20)"
     - **Pricing Recommendations:** "You're underpriced - competitors charge 15% more"
     - **Optimal Hours:** "Your busiest hours: 6-8pm Fri/Sat, consider staffing up"
     - **Competitor Comparison:** Anonymous benchmarking
     - **Marketing Insights:** "Users searching 'date night' don't find you - add that keyword"
   - Exportable reports (PDF)

3. **User-Facing Predictions**
   - On event/restaurant pages:
     - "🔥 High demand - 127 people viewing now"
     - "⏰ Best time to visit: Tuesday 7pm (20% less busy)"
     - "🎟️ Likely to sell out - 73% of similar events sold out"
   - Smart notifications:
     - "Event you viewed is selling fast - 85% sold"
     - "Weather alert: Outdoor event you saved has rain forecast"

4. **Recommendation Engine v2**
   - Collaborative filtering: "Users like you also loved..."
   - Content-based: "Similar to [event] you attended"
   - Context-aware: Time, location, weather, calendar
   - Edge function: `generate-recommendations`
   - Real-time: Update as user browses

**Success Criteria:**
- Demand predictions within ±15% accuracy
- 5+ businesses sign up for analytics ($500+ MRR)
- User engagement +25% (time on site, return visits)
- Recommendation click-through rate >10%

**Technical Notes for Agent:**
- Start simple: Moving averages, not deep learning
- Requires 3+ months historical data for accuracy
- A/B test predictions vs. control (do they improve conversions?)
- Ethical: Don't manipulate pricing unfairly

---

### Month 4: Content Production & SEO Dominance

#### Week 13-14: AI Content Factory
**Objective:** Generate 100+ SEO-optimized pages automatically

**Deliverables:**
1. **Content Templates**
   - Create generation templates:
     - "Best [cuisine] Restaurants in Des Moines"
     - "[Month] Events Calendar for Des Moines"
     - "Things to Do in [Neighborhood] This Weekend"
     - "Family-Friendly Activities in Des Moines"
     - "[Event Type] Guide: Where to Go in Des Moines"
   - 50+ template variations

2. **Automated Generation Pipeline**
   - Edge function: `generate-content-pages` (scheduled weekly)
   - Process:
     1. Query database for current data
     2. Identify gaps in content (missing pages)
     3. Generate content via Claude:
        - SEO-optimized title, H1, meta description
        - 800-1500 word article
        - Natural language, not obviously AI
        - Include current data (event listings, restaurant details)
        - Internal links to relevant pages
     4. Store in `articles` table with status='auto_generated'
     5. Human review queue for admin approval

3. **Dynamic Content Pages**
   - Auto-generated pages are dynamic (update weekly):
     - "November 2024 Events" → updates as events added
     - "Best Pizza in Des Moines" → re-ranks as reviews change
   - URL structure: `/guides/[category]/[subcategory]`
   - Canonical URLs to prevent duplicate content issues

4. **SEO Optimization**
   - Schema.org markup for all generated pages:
     - Article schema
     - Event schema
     - Restaurant schema
     - FAQ schema
   - Image optimization: WebP, lazy loading, alt text
   - Internal linking: Connect related guides
   - Sitemap updates: Automatic inclusion

**Success Criteria:**
- 100+ pages generated in Month 4
- 50+ pages ranking on Google page 1 within 3 months
- Organic traffic +200% by Month 6
- Zero manual writing effort

**Technical Notes for Agent:**
- Quality control: Claude scores content 1-10, only publish 8+
- Uniqueness check: Avoid duplicate content (Copyscape API)
- Update schedule: Regenerate monthly for freshness
- Human oversight: Admin reviews 10% sample weekly

---

#### Week 15-16: Review Intelligence & Gap Analysis
**Objective:** Turn user reviews into competitive intelligence

**Deliverables:**
1. **Review Aggregation System**
   - Collect reviews from:
     - Internal user reviews (already have)
     - Scraped: Yelp, Google, Facebook (via APIs or Firecrawl)
     - Aggregated sentiment analysis
   - New table: `review_aggregations`
   - Fields per venue:
     - `overall_rating` (weighted average)
     - `review_count`
     - `sentiment_score` (-1 to +1)
     - `common_themes` (array: "romantic", "loud", "fast service")
     - `price_perception` ("good value", "overpriced")

2. **AI Review Insights**
   - Edge function: `analyze-reviews` (runs nightly)
   - Per restaurant/venue:
     - Extract themes via Claude: What do people love? What do they complain about?
     - Trending: "Service improved recently" or "Getting busier"
     - Comparison: "Reviewers say this is similar to [competitor]"
   - Display on detail pages:
     - "What people love: Cozy atmosphere, craft cocktails"
     - "Heads up: Parking can be challenging"

3. **Content Gap Identification**
   - Compare your content to competitors (Catch Des Moines, Visit DSM):
     - What events do they have that you don't?
     - What categories are they strong in?
     - What keywords do they rank for that you don't?
   - Dashboard: `/admin/content-gaps`
   - Auto-generate tasks: "Add [missing event]", "Create guide for [topic]"

4. **Business Feedback Loop**
   - Email businesses monthly:
     - "Your review summary: 4.5★ average (up 0.2 this month)"
     - "Customers love your [theme], but mention [issue]"
     - "Suggestion: Respond to recent reviews mentioning [topic]"
   - Upsell: "Get full analytics report for $99/month"

**Success Criteria:**
- Aggregate 10,000+ reviews
- Sentiment analysis 85%+ accuracy
- Identify 50+ content gaps
- 10+ businesses engage with feedback emails

**Technical Notes for Agent:**
- Scraping compliance: Respect robots.txt, rate limits
- Review storage: Cache scraped reviews, refresh monthly
- Sentiment: Use Claude or simple keyword-based model
- Privacy: Anonymize reviewer names in aggregations

---

### Phase 2 Deliverables Summary
✅ Behavioral tracking active (10k+ interactions)  
✅ Predictive analytics operational (5+ business customers)  
✅ 100+ AI-generated SEO pages live  
✅ Review intelligence aggregating 10k+ reviews  
✅ Content gap analysis identifying opportunities

**Investment Recap:**
- Analytics tools: ~$100/month
- API costs (scraping, Claude): ~$400/month
- Development time: 160 hours
- Revenue: $500+ MRR from analytics subscriptions

---

## Phase 3: Monetization - Turn Intelligence Into Revenue
**Timeline:** Month 5-6 (March-April 2025)  
**Theme:** "Monetize the Moat"  
**Investment:** $2000/month + development time  
**Target Revenue:** $15k+ MRR

### Month 5: B2B Partnerships & White-Label

#### Week 17-18: Hotel Concierge Platform
**Objective:** License AI concierge to hotels - $500-2000/month per hotel

**Deliverables:**
1. **Embedded Chat Widget**
   - JavaScript embed code: `<script src="desmoinesaipulse.com/embed.js">`
   - Customizable:
     - Hotel branding (logo, colors)
     - Pre-filled location (hotel address)
     - Custom welcome message: "Welcome to [Hotel]! How can I help you explore Des Moines?"
   - Widget appears: Bottom-right corner, expandable chat

2. **Hotel-Specific Features**
   - Pre-loaded suggestions:
     - "Walking distance restaurants" (within 0.5 miles of hotel)
     - "Things to do today" (dynamic based on current date)
     - "Getting around" (transit, parking info)
   - Room TV integration (API for smart TVs)
   - Concierge dashboard:
     - See what guests are asking
     - Add custom FAQs ("Where's the gym?")
     - Track engagement (how many chats, conversions)

3. **Partnership Materials**
   - Sales deck: `/partnerships/hotels` landing page
   - Case study: "How [Pilot Hotel] increased guest satisfaction 40%"
   - Pricing tiers:
     - **Basic ($500/mo):** Embedded chat widget, 1000 queries/month
     - **Pro ($1000/mo):** + TV integration, analytics dashboard, 5000 queries/month
     - **Enterprise ($2000/mo):** + Custom branding, dedicated support, unlimited queries
   - Contract template (simple SaaS agreement)

4. **Pilot Program**
   - Target: 3-5 hotels in Des Moines
   - Offer: Free for 2 months, then standard pricing
   - Support: Weekly check-ins, optimization
   - Success metric: 500+ guest interactions per hotel

**Success Criteria:**
- 5 hotels signed by end of Month 6
- $2,500-10,000 MRR from hotel partnerships
- 90%+ uptime for embedded chat
- 8+ / 10 guest satisfaction score

**Technical Notes for Agent:**
- Multi-tenancy: Each hotel = separate config
- Scalability: Expect 100+ hotels eventually
- Analytics: Track per-hotel metrics separately
- White-label option: Remove "Powered by Des Moines AI Pulse"

---

#### Week 19-20: White-Label Platform MVP
**Objective:** "Iowa City Pulse", "Cedar Rapids Pulse" - replicate for other cities

**Deliverables:**
1. **Multi-Tenant Architecture**
   - Database:
     - Add `city_id` to all tables (events, restaurants, articles)
     - New table: `cities`
       - Fields: `id`, `name`, `state`, `slug`, `config` (JSONB)
       - Config: Logo, colors, contact info, branding
   - Dynamic routing: `[city].aipulse.com` or `aipulse.com/[city]`

2. **City Onboarding Wizard**
   - Admin tool: `/admin/cities/new`
   - Wizard steps:
     1. City info (name, state, coordinates)
     2. Branding (logo, colors, tagline)
     3. Data import (CSV upload or API scraping)
     4. Content generation (auto-generate 50 initial pages)
     5. Domain setup (CNAME instructions)
     6. Go live!
   - Estimated time: 2-4 hours to launch a city

3. **Revenue Model**
   - Pricing:
     - **Setup Fee:** $2,500 (one-time)
     - **Monthly SaaS:** $999/month (up to 50k users/month)
     - **Enterprise:** Custom pricing for large cities
   - Includes:
     - Full platform (web, SMS, ChatGPT, voice)
     - Data management tools
     - Analytics dashboard
     - Monthly support
   - Partner share: 20% revenue from local ads/partnerships

4. **Pilot City: Iowa City**
   - Target: Iowa City, IA (~75k population, college town)
   - Partner: Local tourism board or chamber of commerce
   - Data: Import from existing sources (event sites, Yelp)
   - Launch: Full platform in 2 weeks
   - Case study for future sales

**Success Criteria:**
- 1 white-label city launched by end of Month 6
- $3,500 revenue from pilot (setup + 1 month)
- Platform supports 10 cities technically
- Documentation for easy replication

**Technical Notes for Agent:**
- Shared codebase, city-specific config
- Separate databases per city? Or shared with filtering?
- CDN: Cloudflare for multi-tenant routing
- Billing: Stripe for recurring payments

---

### Month 6: Advanced Monetization & Scale

#### Week 21-22: Dynamic Ad Bidding Platform
**Objective:** Real-time ad auctions for search results, SMS, ChatGPT

**Deliverables:**
1. **Ad Auction System**
   - When user searches "Italian restaurants":
     1. Identify query intent (category, location, price)
     2. Check which businesses bid on those keywords
     3. Run mini-auction (highest bid wins, but considers relevance)
     4. Insert "Sponsored" result at top
     5. Track impression, click, conversion
   - Auction rules:
     - Relevance score: Must match query (no random ads)
     - Quality score: Good reviews, complete profile (prioritized)
     - Bid amount: CPC (cost-per-click) model

2. **Business Ad Dashboard**
   - Page: `/business/advertising`
   - Campaign builder:
     - Set keywords: "Italian", "downtown", "date night"
     - Set bid: $0.50-5.00 per click
     - Set budget: Daily max ($50/day) and total ($500/month)
     - Set schedule: Days of week, hours of day
   - Real-time analytics:
     - Impressions, clicks, CTR
     - Conversions (tracked via unique links)
     - Cost per conversion
     - ROI estimate

3. **Ad Formats**
   - **Search results:** Top placement with "Sponsored" tag
   - **SMS concierge:** "Featured" option in recommendations
   - **ChatGPT:** Subtle mention ("Centro is popular and recommended")
   - **Display:** Banner ads on event/article pages (existing system)
   - **Email:** Sponsored spot in newsletters

4. **Self-Service Platform**
   - Businesses can create campaigns without approval (auto-moderate)
   - Stripe integration for payments
   - Minimum spend: $100/month
   - Pricing:
     - Search CPC: $1-3
     - SMS CPC: $2-5 (higher intent)
     - Display CPM: $10-20
   - Revenue share: 100% to platform (for now)

**Success Criteria:**
- 20+ businesses running ad campaigns
- $5,000+ ad revenue in Month 6
- 5% average CTR on search ads
- Zero spam/low-quality ads (moderation working)

**Technical Notes for Agent:**
- Auction algorithm: Second-price auction (winner pays 2nd-highest bid + $0.01)
- Fraud prevention: Rate limit clicks, detect click fraud
- Reporting: Real-time dashboard updates
- Compliance: FTC disclosure (all ads marked clearly)

---

#### Week 23-24: API Marketplace & Developer Platform
**Objective:** Monetize data via API access - $99-499/month per developer

**Deliverables:**
1. **API Product Tiers**
   - **Free Tier:**
     - 1,000 API calls/month
     - Public data only (events, restaurants)
     - Rate limit: 10 requests/min
   - **Developer Tier ($99/mo):**
     - 50,000 calls/month
     - Includes semantic search
     - Rate limit: 100 requests/min
     - Email support
   - **Business Tier ($299/mo):**
     - 200,000 calls/month
     - Includes recommendations API
     - Rate limit: 500 requests/min
     - Priority support
   - **Enterprise (Custom):**
     - Unlimited calls
     - Custom endpoints
     - SLA guarantees
     - Dedicated account manager

2. **Developer Portal**
   - Page: `/developers`
   - Features:
     - API documentation (interactive, Swagger UI)
     - API key management (generate, revoke, rotate)
     - Usage analytics (calls, quotas, errors)
     - Code examples (Python, JavaScript, cURL)
     - Webhooks (get notified of new events)
     - SDKs: JavaScript, Python libraries

3. **Use Cases & Marketing**
   - Target customers:
     - **Hotels:** Embed event feeds on their websites
     - **Tourism apps:** Power "Things to Do" sections
     - **Chatbots:** Other AI assistants need local data
     - **Media:** Local news sites auto-update event calendars
   - Case studies:
     - "How [Hotel Chain] Powers 20 Local Guides with One API"
     - "Building a Travel Chatbot with Des Moines AI API"
   - Landing page: `/developers/use-cases`

4. **Partnerships**
   - Reach out to:
     - Zapier (add Des Moines AI as integration)
     - Make.com (automation platform)
     - Hotel website platforms (e.g., Cloudbeds, Guesty)
   - Revenue share: 20% to partner, 80% to platform

**Success Criteria:**
- 50+ developers sign up for free tier
- 10+ paying API customers ($1,000+ MRR)
- API uptime 99.9%+
- Developer satisfaction: 8+ / 10

**Technical Notes for Agent:**
- API key management: UUID-based keys, rate limiting per key
- Billing: Stripe metered billing (charge per API call over limit)
- Documentation: Auto-generate from OpenAPI spec
- Versioning: `/v1/`, `/v2/` for breaking changes

---

### Phase 3 Deliverables Summary
✅ 5 hotel partnerships signed ($2.5-10k MRR)  
✅ 1 white-label city launched ($3.5k revenue)  
✅ 20+ businesses running ads ($5k ad revenue)  
✅ 10+ API customers ($1k MRR)  
✅ **Total Revenue: $15k+ MRR**

**Investment Recap:**
- Sales & marketing: ~$1,000/month
- API costs (increased usage): ~$800/month
- Development time: 160 hours
- Revenue: $15,000+ MRR

---

## Success Metrics Dashboard

### Key Performance Indicators (KPIs)

#### User Engagement (Month 6 Targets)
- **Monthly Active Users:** 10,000+ (5x baseline)
- **AI Conversations:** 1,500+ per month (50/day)
- **Average Session Duration:** 5+ minutes
- **Return Visit Rate:** 40%+
- **Organic Search Traffic:** 50,000+ visits/month

#### AI Performance
- **ChatGPT Plugin Queries:** 500+ per month
- **SMS Concierge Conversations:** 1,000+ per month
- **Voice Assistant Queries:** 200+ per month
- **Trip Planner Itineraries:** 300+ per month
- **Intent Recognition Accuracy:** 85%+

#### Content & SEO
- **AI-Generated Pages:** 100+ live pages
- **Google Page 1 Rankings:** 50+ keywords
- **Domain Authority:** 40+ (from ~20)
- **Backlinks:** 500+ (from ~50)
- **Content Updates:** Weekly (automated)

#### Revenue (Month 6 Targets)
- **Hotel Partnerships:** $2,500-10,000 MRR (5 hotels)
- **White-Label Cities:** $1,000 MRR (1 city)
- **Advertising Revenue:** $5,000 MRR (20 businesses)
- **Analytics Subscriptions:** $500 MRR (5 businesses)
- **API Revenue:** $1,000 MRR (10 developers)
- **Total MRR:** $15,000+
- **ARR:** $180,000+ (run rate)

#### Business Adoption
- **Businesses with Profiles:** 300+ (from 200)
- **Paid Business Accounts:** 40+ total
- **Ad Campaigns Active:** 20+
- **Average Campaign Spend:** $250/month

#### Technical Performance
- **API Uptime:** 99.9%+
- **Average Response Time:** <500ms
- **Semantic Search Accuracy:** 85%+
- **Prediction Accuracy:** ±15%
- **Zero Data Breaches:** 0 (critical)

---

## Risk Mitigation

### Technical Risks

**Risk 1: AI Hallucinations**
- **Mitigation:**
  - Always show data source ("Info from [restaurant website]")
  - Confidence scores on predictions
  - Human review queue for generated content
  - Fallback to keyword search if semantic fails

**Risk 2: API Costs Spiral**
- **Mitigation:**
  - Set hard monthly budget caps ($1,000/month Claude/OpenAI)
  - Cache embeddings and common queries
  - Rate limiting per user
  - Monitor costs daily, alert at 80% budget

**Risk 3: Scraping Legal Issues**
- **Mitigation:**
  - Respect robots.txt always
  - Only scrape publicly available data
  - Attribute sources (e.g., "Data from Yelp")
  - Use official APIs where available (pay for them)

**Risk 4: Platform Downtime**
- **Mitigation:**
  - Supabase 99.9% SLA
  - Cloudflare redundancy
  - Database backups (daily)
  - Monitoring & alerts (PagerDuty)
  - Status page for transparency

### Business Risks

**Risk 5: Low Hotel Adoption**
- **Mitigation:**
  - Offer 2-month free trial
  - Start with 1 pilot, prove ROI with case study
  - Personal outreach (not just email)
  - Partner with hotel associations

**Risk 6: ChatGPT Plugin Rejection**
- **Mitigation:**
  - Follow OpenAI guidelines strictly
  - Test extensively before submission
  - Have backup: SMS concierge is standalone
  - Resubmit with fixes if rejected

**Risk 7: Competitor Copies Features**
- **Mitigation:**
  - Focus on data moat (behavioral intelligence)
  - 6-12 month head start is significant
  - Patents/IP? (probably not worth it)
  - Execution speed > ideas

**Risk 8: User Privacy Concerns**
- **Mitigation:**
  - Clear privacy policy (GDPR/CCPA compliant)
  - Opt-in tracking (not default)
  - Easy data deletion (right to be forgotten)
  - Anonymize all analytics
  - Regular security audits

---

## Resource Requirements

### Team (Assumptions)
- **Developer(s):** 1-2 full-time (or AI agent + human oversight)
- **Marketing/Sales:** 1 part-time (Month 5-6)
- **Content Moderator:** 1 part-time (Month 4+)

### Budget Breakdown (6 Months)

| Category | Month 1-2 | Month 3-4 | Month 5-6 | Total |
|----------|-----------|-----------|-----------|-------|
| Infrastructure (Supabase, Cloudflare) | $100 | $150 | $200 | $450 |
| APIs (Claude, OpenAI, Twilio, Google) | $400 | $700 | $1,200 | $2,300 |
| Marketing (Ads, Materials) | $200 | $500 | $1,500 | $2,200 |
| Software/Tools | $100 | $100 | $200 | $400 |
| **Total** | **$800** | **$1,450** | **$3,100** | **$5,350** |

### Expected Revenue (6 Months)

| Revenue Stream | Month 1-2 | Month 3-4 | Month 5-6 | Total |
|----------------|-----------|-----------|-----------|-------|
| Hotel Partnerships | $0 | $0 | $5,000 | $5,000 |
| White-Label City | $0 | $0 | $3,500 | $3,500 |
| Advertising | $0 | $500 | $5,000 | $5,500 |
| Analytics Subscriptions | $0 | $200 | $500 | $700 |
| API Revenue | $0 | $0 | $1,000 | $1,000 |
| **Total** | **$0** | **$700** | **$15,000** | **$15,700** |

**Net Position:** +$10,350 (before labor)

---

## Agent Execution Guidelines

### For AI Agent Building This:

**General Approach:**
1. **Read the LTS first** - Understand current state, existing infrastructure
2. **Build iteratively** - Each week is a self-contained deliverable
3. **Test thoroughly** - Every feature must work before moving to next
4. **Document as you go** - Update LTS with changes
5. **Ask for clarification** - If requirements unclear, ask human

**Technical Standards:**
- **Code quality:** TypeScript strict mode, ESLint passing
- **Security:** Never expose API keys, validate all inputs
- **Performance:** <500ms API responses, <3s page loads
- **Accessibility:** WCAG 2.1 AA compliance
- **Testing:** Write Playwright tests for critical paths

**Decision-Making Authority:**
- **You can decide:** Implementation details, libraries, code structure
- **Ask human:** Product changes, pricing, partnerships, major architecture
- **Never do:** Commit to paid partnerships, change pricing, disable security

**Progress Reporting:**
- **Daily:** Brief update on what was completed
- **Weekly:** Demo of working features
- **Blockers:** Report immediately, don't waste time stuck

**Success Criteria:**
- Each phase deliverable meets "Success Criteria" listed
- No breaking changes to existing functionality
- All tests passing
- Human approves before moving to next phase

---

## Appendix: Implementation Notes

### Technology Stack Additions

**New Dependencies (add to package.json):**
```json
{
  "pgvector": "^0.1.0",        // Vector search
  "twilio": "^4.19.0",          // SMS/WhatsApp
  "fb-prophet": "^1.0.0",       // Time series forecasting (Python)
  "mixpanel-browser": "^2.47.0" // Analytics (or use PostHog)
}
```

**New Supabase Extensions:**
```sql
-- Add to migration
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- Fuzzy text search
```

### API Endpoints Summary (New)

```
POST /api/v1/semantic-search        - Semantic search across all content
POST /api/v1/trip-planner           - Generate itinerary
POST /api/v1/sms-webhook            - Twilio SMS webhook
POST /api/v1/voice-webhook          - Alexa/Google webhook
POST /api/v1/track-interaction      - User behavior tracking
POST /api/v1/generate-recommendations - Personalized suggestions
POST /api/v1/analyze-patterns       - Run pattern detection
POST /api/v1/predict-demand         - Demand forecasting
POST /api/v1/generate-content-page  - Auto-generate SEO page
POST /api/v1/analyze-reviews        - Review sentiment analysis
POST /api/v1/ad-auction             - Real-time ad bidding
GET  /api/v1/business/analytics/:id - Business intelligence data
```

### Database Schema Additions

**New Tables:**
```sql
-- Vector search
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Behavior tracking
CREATE TABLE user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  content_type TEXT,
  content_id UUID,
  context JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Patterns
CREATE TABLE behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  description TEXT,
  confidence_score DECIMAL(3,2),
  data JSONB,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions
CREATE TABLE demand_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  prediction_date DATE NOT NULL,
  predicted_attendance INTEGER,
  confidence_interval JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Multi-tenant cities
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  key_hash TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL, -- 'free', 'developer', 'business', 'enterprise'
  rate_limit INTEGER NOT NULL,
  calls_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

---

## Next Steps for Agent

**Immediate Actions:**
1. Read full LTS document to understand current platform
2. Confirm understanding of Phase 1 objectives
3. Ask any clarifying questions before starting
4. Begin Week 1: Vector database setup

**Questions to Confirm:**
- Current baseline metrics (users, traffic, revenue)?
- Budget approval for API costs?
- Access to necessary API keys (Claude, Google, Twilio)?
- Priority if timeline slips (which features are must-have)?

**Let's Build! 🚀**

---

**End of AI-First Transformation Roadmap**
