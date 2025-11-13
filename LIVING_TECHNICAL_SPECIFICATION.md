# Living Technical Specification (LTS)
## Des Moines AI Pulse Platform

**Document Version:** 1.1
**Last Updated:** 2025-11-13
**Status:** Active
**Purpose:** Single source of truth for the current state of the Des Moines AI Pulse platform

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Current Features & Functionality](#current-features--functionality)
5. [Database Architecture](#database-architecture)
6. [API & Edge Functions](#api--edge-functions)
7. [Frontend Architecture](#frontend-architecture)
8. [Security & Authentication](#security--authentication)
9. [Infrastructure & Deployment](#infrastructure--deployment)
10. [Performance & Optimization](#performance--optimization)
11. [Testing Strategy](#testing-strategy)
12. [Growth Opportunities](#growth-opportunities)
13. [Technical Debt & Known Issues](#technical-debt--known-issues)
14. [Maintenance & Operations](#maintenance--operations)

---

## 1. Executive Summary

### What is Des Moines AI Pulse?

Des Moines AI Pulse is a modern, AI-powered web platform that serves as a comprehensive guide to Des Moines, Iowa. It aggregates and enhances information about local events, restaurants, attractions, and playgrounds, providing visitors and residents with intelligent, personalized recommendations.

### Key Metrics (Current State)

- **Codebase Size:** ~53MB (excluding node_modules and .git)
- **Documentation Files:** 110+ markdown documents
- **Database Tables:** 20+ core tables
- **Edge Functions:** 50+ Supabase Edge Functions (~19,372 lines of code)
- **Frontend Pages:** 45+ React pages
- **Frontend Components:** 218+ React components
- **Custom Hooks:** 79+ React hooks
- **UI Components:** 58+ shadcn/ui primitives
- **Database Migrations:** 108 migration files
- **Test Suites:** 10+ Playwright test suites
- **Content Items:** 1000+ events, 500+ restaurants, 100+ attractions, 75+ playgrounds
- **Supported Devices:** Desktop, Mobile (iOS/Android via Capacitor), Tablet

### Project Information

- **Repository:** GitHub (private)
- **Primary Branch:** `main`
- **Development Platform:** Lovable.dev
- **Project URL:** https://lovable.dev/projects/c6f56135-984a-4df0-b477-f9d3a03c55e7
- **Backend:** Supabase (Project ID: wtkhfqpmcegzcbngroui)
- **Hosting:** Cloudflare Pages
- **Node Version:** >= 20.0.0

---

## 2. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER LAYER                           │
│  (Web Browsers, Mobile Devices, ChatGPT Plugin)            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   FRONTEND LAYER                            │
│  • React 18 + TypeScript + Vite                            │
│  • shadcn/ui + Tailwind CSS                                │
│  • React Router v6 (Client-side routing)                   │
│  • TanStack Query (State management)                       │
│  • Three.js (3D visualizations)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                SUPABASE BACKEND LAYER                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  PostgreSQL Database (20+ tables, 108 migrations)   │ │
│  │  • Row Level Security (RLS)                         │ │
│  │  • Real-time subscriptions                          │ │
│  │  • Full-text search                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Edge Functions (50+ Deno functions)                │ │
│  │  • API endpoints                                    │ │
│  │  • AI content generation                           │ │
│  │  • Scraping & data enrichment                      │ │
│  │  • SEO automation                                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Authentication (Supabase Auth)                     │ │
│  │  • Email/Password                                   │ │
│  │  • OAuth providers (Google, etc.)                  │ │
│  │  • JWT tokens                                      │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              EXTERNAL SERVICES LAYER                        │
│  • Anthropic Claude API (AI content generation)            │
│  • Google APIs (Maps, PageSpeed, Search Console)           │
│  • Firecrawl (Web scraping)                                │
│  • Stripe (Payments)                                       │
│  • Cloudflare (CDN, Pages hosting)                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Patterns

1. **User Interaction → Frontend → Supabase Client → Database**
2. **Scheduled Jobs → Edge Functions → Database**
3. **AI Enhancement → Edge Functions → Claude API → Database**
4. **Content Scraping → Edge Functions → External APIs → Database**

---

## 3. Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.3.1 | UI framework |
| **TypeScript** | 5.5.3 | Type safety |
| **Vite** | 5.4.1 | Build tool & dev server |
| **React Router** | 6.26.2 | Client-side routing |
| **TanStack Query** | 5.56.2 | Server state management |
| **Tailwind CSS** | 3.4.11 | Styling framework |
| **shadcn/ui** | Latest | Component library (Radix UI based) |
| **Three.js** | 0.160.1 | 3D graphics (hero cityscape) |
| **React Three Fiber** | 8.18.0 | React renderer for Three.js |
| **Leaflet** | 1.9.4 | Interactive maps |
| **React Leaflet** | 4.2.1 | React wrapper for Leaflet |
| **FullCalendar** | 6.1.19 | Calendar UI |
| **Recharts** | 2.12.7 | Data visualization |
| **date-fns** | 3.6.0 | Date manipulation |
| **React Helmet Async** | 2.0.5 | SEO meta tags |
| **React Hook Form** | 7.53.0 | Form management |
| **Zod** | 3.23.8 | Schema validation |
| **DOMPurify** | 3.2.6 | XSS protection |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Supabase** | 2.53.0 | Backend-as-a-Service |
| **PostgreSQL** | Latest (Supabase managed) | Primary database |
| **Deno** | Latest (Supabase Edge Functions) | Edge function runtime |
| **TypeScript** | Latest | Edge function language |

### External Services

| Service | Purpose |
|---------|---------|
| **Anthropic Claude** | AI content generation, enhancement, SEO |
| **Firecrawl** | Web scraping (competitor analysis, data enrichment) |
| **Google Maps API** | Geocoding, location services |
| **Google Search Console** | SEO analytics |
| **Google PageSpeed Insights** | Performance monitoring |
| **Stripe** | Payment processing (advertising) |
| **Cloudflare Pages** | Static site hosting |
| **Cloudflare CDN** | Content delivery network |

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Code linting |
| **Playwright** | End-to-end testing |
| **TypeScript Compiler** | Type checking |
| **npm** | Package management |
| **Git** | Version control |
| **Lovable.dev** | AI-assisted development platform |

---

## 4. Current Features & Functionality

### 4.1 Content Discovery Features

#### Events System
- **Event Listings:** Browse 1000+ events across Des Moines
- **Advanced Filtering:** By date, category, location, price, time of day
- **Featured Events:** Curated selection of top events
- **Event Details:** Enhanced descriptions with AI-generated content
- **Calendar Views:** Month, week, day, and list views
- **Events Today:** Quick access to today's happenings
- **Events This Weekend:** Weekend planning made easy
- **Events by Location:** Geographic browsing
- **Monthly Events:** Browse by month (e.g., /events/november)
- **Add to Calendar:** Export to Google Calendar, Outlook, Apple Calendar
- **Event Search:** Full-text search across event titles and descriptions
- **Interactive Maps:** Location visualization with Leaflet

**Key Pages:**
- `/events` - Main events listing (src/pages/EventsPage.tsx)
- `/events/:id` - Event details (src/pages/EventDetails.tsx)
- `/events/today` - Today's events (src/pages/EventsToday.tsx)
- `/events/weekend` - Weekend events (src/pages/EventsThisWeekend.tsx)
- `/events/:month` - Monthly events (src/pages/MonthlyEventsPage.tsx)

#### Restaurant Discovery
- **Restaurant Database:** 200+ local restaurants
- **Cuisine Filtering:** 20+ cuisine types
- **Price Range Filtering:** $, $$, $$$, $$$$
- **Location-based Search:** Find restaurants by neighborhood
- **Featured Restaurants:** Highlighted establishments
- **Restaurant Details:** Photos, menus, hours, contact info
- **AI-Enhanced Descriptions:** Rich, engaging content
- **Restaurant Openings:** Track new restaurant openings
- **Opening Status Tracking:** "Opening Soon", "Newly Opened", "Announced"
- **City Filtering:** Filter by Des Moines suburbs

**Key Pages:**
- `/restaurants` - Main restaurant listing (src/pages/RestaurantsPage.tsx)
- `/restaurants/:id` - Restaurant details (src/pages/RestaurantDetails.tsx)

#### Attractions
- **Attraction Listings:** Museums, parks, entertainment venues
- **Type Filtering:** Museums, outdoor, entertainment, historical
- **Featured Attractions:** Top destinations
- **Interactive Maps:** Geographic exploration

**Key Pages:**
- `/attractions` - Attractions listing (src/pages/Attractions.tsx)
- `/attractions/:id` - Attraction details (src/pages/AttractionDetails.tsx)

#### Playgrounds
- **Playground Database:** 50+ playgrounds across Des Moines
- **Age Range Filtering:** Toddler, preschool, elementary, all ages
- **Amenities Tracking:** Swings, slides, climbing structures, etc.
- **Location-based Search:** Find nearby playgrounds
- **Featured Playgrounds:** Top-rated playgrounds

**Key Pages:**
- `/playgrounds` - Playground listings (src/pages/Playgrounds.tsx)
- `/playgrounds/:id` - Playground details (src/pages/PlaygroundDetails.tsx)

### 4.2 AI-Powered Features

#### Content Enhancement
- **AI Descriptions:** Claude-powered content generation for events/restaurants
- **SEO Optimization:** Automatic meta tags, titles, descriptions
- **Smart Summaries:** 2-3 sentence geolocation summaries
- **FAQ Generation:** Automatic Q&A for common questions
- **Keyword Extraction:** SEO-optimized keyword arrays
- **Batch Processing:** Bulk content enhancement via Edge Functions

**Components:**
- `AIEnhancementManager.tsx` - Manual enhancement interface
- `AIArticleGenerator.tsx` - Article creation with AI
- `AIConfigurationManager.tsx` - AI model configuration

**Edge Functions:**
- `generate-seo-content` - Batch SEO generation
- `enhance-content` - Single item enhancement
- `bulk-enhance-events` - Event batch processing

#### Competitor Analysis
- **Website Tracking:** Monitor competitor websites (Catch Des Moines, etc.)
- **Content Scraping:** Automated competitor content extraction
- **Gap Analysis:** Identify content opportunities
- **Performance Comparison:** Track competitive metrics
- **Suggestion Generation:** AI-powered content recommendations

**Components:**
- `CompetitorAnalysis.tsx` - Analysis dashboard
- `CompetitorAnalysisDashboard.tsx` - Metrics view

**Database Tables:**
- `competitors` - Competitor websites
- `competitor_content` - Scraped content
- `competitor_reports` - Analysis reports
- `content_suggestions` - AI suggestions

#### Smart Recommendations
- **Personalized Suggestions:** User interest-based recommendations
- **Calendar Integration:** Sync with Google Calendar, Outlook, Apple
- **Free Time Detection:** Suggest events during available time slots
- **Travel Time Calculation:** Consider commute times
- **Conflict Checking:** Avoid scheduling conflicts

**Database Tables:**
- `user_calendars` - Connected calendars
- `calendar_events` - Synced calendar events
- `smart_event_suggestions` - AI-generated suggestions
- `calendar_preferences` - User scheduling preferences

### 4.3 User Features

#### Authentication & Profiles
- **User Registration:** Email/password signup
- **Email Verification:** Secure account activation
- **Social Login:** Google OAuth (configurable for more)
- **Profile Management:** Name, location, interests, preferences
- **Communication Preferences:** Email/SMS notification settings
- **Role-Based Access:** User, Moderator, Admin, Root Admin

**Key Pages:**
- `/auth` - Login/signup (src/pages/Auth.tsx)
- `/profile` - User profile (src/pages/ProfilePage.tsx)
- `/user-dashboard` - User dashboard (src/pages/UserDashboard.tsx)

#### User Engagement
- **Favorites/Bookmarks:** Save events and restaurants
- **Calendar Sync:** Connect personal calendars
- **Event Reminders:** Automated notifications
- **Community Forums:** Discussion boards (basic)
- **Badge Collection:** Gamification system
- **Community Challenges:** Engagement activities

**Components:**
- `BadgeCollection.tsx` - Achievement system
- `CommunityChallenge.tsx` - Challenge tracking
- `CommunityForums.tsx` - Discussion interface
- `Gamification.tsx` - Gamification dashboard

### 4.4 Business Features

#### Advertising Platform
- **Campaign Creation:** Self-service ad campaigns
- **Stripe Integration:** Secure payment processing
- **Creative Upload:** Banner and image ads
- **Campaign Analytics:** View impressions, clicks, CTR
- **Budget Management:** Set daily/total budgets
- **Ad Placement:** Event listings, restaurant pages, homepage
- **Campaign Dashboard:** Real-time performance tracking

**Key Pages:**
- `/advertise` - Campaign creation (src/pages/Advertise.tsx)
- `/advertise/success` - Payment confirmation (src/pages/AdvertiseSuccess.tsx)
- `/campaign-dashboard` - Campaign management (src/pages/CampaignDashboard.tsx)
- `/campaign-analytics/:id` - Analytics (src/pages/CampaignAnalytics.tsx)

**Components:**
- `AdBanner.tsx` - Ad display component
- `UploadCreatives.tsx` - Creative management

#### Business Hub
- **Business Portal:** Dashboard for business owners
- **Partnership Applications:** Apply for business partnerships
- **Event Promotion Planner:** Plan event promotions
- **Analytics Access:** Business-specific metrics

**Key Pages:**
- `/business-hub` - Business dashboard (src/pages/BusinessHub.tsx)
- `/business-partnership` - Partnership application (src/pages/BusinessPartnership.tsx)
- `/event-promotion-planner` - Promotion tool (src/pages/EventPromotionPlanner.tsx)

### 4.5 Admin Features

#### Admin Dashboard
- **Comprehensive Dashboard:** Single pane of glass for site management
- **Content Management:** Edit events, restaurants, attractions, playgrounds
- **User Management:** View, edit, delete users; assign roles
- **Campaign Management:** Approve, reject, monitor ad campaigns
- **SEO Management:** Bulk SEO generation and monitoring
- **System Controls:** Cache clearing, backups, maintenance mode
- **Analytics Dashboard:** Site-wide metrics and KPIs
- **Security Manager:** View logs, failed auth attempts, audit trails
- **Team Management:** Manage admin team members

**Key Pages:**
- `/admin` - Main admin dashboard (src/pages/Admin.tsx)
- `/admin/team` - Team management (src/pages/TeamManagement.tsx)
- `/admin/campaigns` - Campaign management (src/pages/AdminCampaigns.tsx)
- `/admin/campaigns/:id` - Campaign details (src/pages/AdminCampaignDetail.tsx)

**Components:**
- `AllInclusiveDashboard.tsx` - Unified admin view
- `AdminApplicationSettings.tsx` - System configuration
- `AdminAnalyticsDashboard.tsx` - Analytics
- `AdminSecurityManager.tsx` - Security monitoring
- `AdminSystemControls.tsx` - System operations
- `AdminCleanupControls.tsx` - Data maintenance
- `ContentEditor.tsx` - Content editing
- `ContentEditDialog.tsx` - Quick edit modal
- `ActivityLogViewer.tsx` - Audit log viewer

#### Content Management System (CMS)
- **Article Creation:** Write and publish blog articles
- **Article Editor:** Rich text editor with markdown support
- **Article Management:** Draft, publish, archive workflow
- **SEO Fields:** Title, description, keywords per article
- **Tag Management:** Organize articles by tags
- **Slug Generation:** Automatic URL-friendly slugs
- **Comment Moderation:** Approve/reject user comments
- **View Tracking:** Monitor article engagement

**Components:**
- `ArticleEditor.tsx` - Article creation/editing
- `ArticlesManager.tsx` - Article list management
- `ArticleWebhookConfig.tsx` - Webhook configuration

**Database Tables:**
- `articles` - Article content
- `article_comments` - User comments

### 4.6 SEO & Marketing Features

#### SEO Automation
- **Meta Tag Generation:** Automatic title, description, keywords
- **Structured Data:** JSON-LD for rich snippets
- **Sitemap Generation:** Automated XML sitemaps
- **Robot.txt:** Search engine crawling instructions
- **Canonical URLs:** Duplicate content prevention
- **Open Graph Tags:** Social media previews
- **Twitter Cards:** Twitter-specific previews
- **Google Search Console Integration:** Performance tracking
- **PageSpeed Monitoring:** Core Web Vitals tracking

**Edge Functions:**
- `generate-seo-content` - Batch SEO generation
- `generate-sitemap` - Sitemap creation
- `generate-sitemaps` - Multi-sitemap generation
- `gsc-oauth` - Google Search Console auth
- `gsc-sync-data` - GSC data sync
- `check-core-web-vitals` - Performance monitoring

#### Content Strategy
- **Weekend Guides:** Automated weekend activity guides
- **Neighborhood Pages:** Location-specific content
- **Seasonal Content:** Iowa State Fair, holidays, etc.
- **Article Publishing:** Blog/news articles
- **Social Media Integration:** Share to social platforms

**Key Pages:**
- `/neighborhoods` - Neighborhood directory (src/pages/NeighborhoodsPage.tsx)
- `/neighborhoods/:id` - Neighborhood page (src/pages/NeighborhoodPage.tsx)
- `/iowa-state-fair` - State fair guide (src/pages/IowaStateFairPage.tsx)
- `/guides` - Content guides (src/pages/GuidesPage.tsx)
- `/articles` - Article listing (src/pages/Articles.tsx)
- `/articles/:slug` - Article page (src/pages/ArticleDetails.tsx)

### 4.7 Integrations

#### ChatGPT Plugin
- **API Access:** ChatGPT can query events and restaurants
- **Natural Language:** Ask ChatGPT about Des Moines activities
- **Real-time Data:** Live access to platform data

**Documentation:**
- `ChatGPT.md` - Integration guide
- `CHATGPT_INTEGRATION_GUIDE.md` - Detailed setup
- Multiple ChatGPT implementation docs

#### Third-Party APIs
- **Google Maps:** Geocoding, location services
- **Google Search Console:** SEO analytics
- **Stripe:** Payment processing
- **Anthropic Claude:** AI content generation
- **Firecrawl:** Web scraping

---

## 5. Database Architecture

### 5.1 Core Tables

#### Events Table (`public.events`)
```sql
- id (UUID, PK)
- title (TEXT, NOT NULL)
- original_description (TEXT)
- enhanced_description (TEXT)
- date (TIMESTAMPTZ, NOT NULL)
- location (TEXT, NOT NULL)
- venue (TEXT)
- category (TEXT, DEFAULT 'General')
- price (TEXT)
- image_url (TEXT)
- source_url (TEXT)
- is_enhanced (BOOLEAN, DEFAULT false)
- is_featured (BOOLEAN, DEFAULT false)
- seo_title, seo_description, seo_keywords, seo_h1
- geo_summary, geo_key_facts, geo_faq (JSONB)
- created_at, updated_at (TIMESTAMPTZ)
```

**Indexes:**
- `idx_events_date` - Query by date
- `idx_events_category` - Filter by category
- `idx_events_featured` - Featured events

**RLS Policies:**
- Public read access
- Admin write access

#### Restaurants Table (`public.restaurants`)
```sql
- id (UUID, PK)
- name (TEXT, NOT NULL)
- cuisine (TEXT)
- location (TEXT)
- city (TEXT)
- rating (DECIMAL)
- price_range (TEXT)
- description (TEXT)
- phone, website (TEXT)
- image_url (TEXT)
- is_featured (BOOLEAN)
- seo fields (similar to events)
- created_at, updated_at (TIMESTAMPTZ)
```

#### Attractions Table (`public.attractions`)
```sql
- id, name, type, location
- description, rating, website
- image_url, is_featured
- created_at, updated_at
```

#### Playgrounds Table (`public.playgrounds`)
```sql
- id, name, location
- description, age_range
- amenities (TEXT[])
- rating, image_url, is_featured
- created_at, updated_at
```

#### Restaurant Openings Table (`public.restaurant_openings`)
```sql
- id, name, description, location, cuisine
- opening_date (DATE)
- status ('opening_soon', 'newly_opened', 'announced')
- source_url
- created_at, updated_at
```

### 5.2 User & Authentication Tables

#### User Roles Table (`public.user_roles`)
```sql
- id (UUID, PK)
- user_id (UUID, FK to auth.users)
- role (ENUM: 'user', 'moderator', 'admin', 'root_admin')
- assigned_by (UUID)
- assigned_at, created_at, updated_at
- UNIQUE(user_id, role)
```

**Role Hierarchy:**
1. `root_admin` - Full system access
2. `admin` - Administrative access
3. `moderator` - Content moderation
4. `user` - Regular user

**Key Functions:**
- `get_user_role(uuid)` - Get user's highest role
- `user_has_role_or_higher(uuid, role)` - Permission check

#### Profiles Table (`public.profiles`)
```sql
- id (UUID, PK)
- user_id (UUID, UNIQUE, FK to auth.users)
- first_name, last_name, phone, email
- communication_preferences (JSONB)
- interests (TEXT[])
- location, user_role
- created_at, updated_at
```

**RLS Policies:**
- Users can view/edit own profile
- Admins can view/edit all profiles

### 5.3 Security & Audit Tables

#### Admin Action Logs (`public.admin_action_logs`)
```sql
- id, admin_user_id
- action_type, action_description
- target_resource, target_id
- old_values, new_values (JSONB)
- ip_address, user_agent
- created_at
```

**Indexes:**
- By admin user
- By action type
- By timestamp

#### Failed Auth Attempts (`public.failed_auth_attempts`)
```sql
- id, email, ip_address
- user_agent, attempt_type
- error_message
- created_at
```

**Rate Limiting:**
- 5 attempts per 15 min per email
- 10 attempts per 15 min per IP

**Key Function:**
- `check_auth_rate_limit(email, ip)` - Rate limit check

#### Security Audit Logs (`public.security_audit_logs`)
```sql
- id, event_type, resource, action
- details (JSONB), severity
- ip_address, user_id, timestamp
```

### 5.4 Content Management Tables

#### Articles Table (`public.articles`)
```sql
- id, title, slug (UNIQUE), content, excerpt
- featured_image_url
- author_id (FK to auth.users)
- status ('draft', 'published', 'archived')
- category, tags (TEXT[])
- seo_title, seo_description, seo_keywords
- view_count
- published_at, created_at, updated_at
- generated_from_suggestion_id
```

**Auto-slug generation** via trigger

#### Article Comments (`public.article_comments`)
```sql
- id, article_id (FK), user_id (FK)
- content, parent_comment_id (self-referencing)
- is_approved (BOOLEAN)
- created_at, updated_at
```

#### Competitors Table (`public.competitors`)
```sql
- id, name, website_url
- description, primary_focus
- is_active
- created_at, updated_at
```

#### Competitor Content (`public.competitor_content`)
```sql
- id, competitor_id (FK)
- content_type ('event', 'restaurant', 'attraction', 'blog_post')
- title, description, url
- category, tags (TEXT[])
- publish_date, content_score
- engagement_metrics (JSONB)
- scraped_at, updated_at
```

#### Content Suggestions (`public.content_suggestions`)
```sql
- id, competitor_content_id (FK)
- suggestion_type ('improve', 'counter', 'gap_fill')
- suggested_title, suggested_description, suggested_tags
- improvement_areas (TEXT[])
- priority_score (1-100)
- status ('pending', 'in_progress', 'completed', 'rejected')
- ai_analysis (JSONB)
- created_at, updated_at
```

### 5.5 Calendar & Smart Features Tables

#### User Calendars (`public.user_calendars`)
```sql
- id, user_id (FK)
- provider ('google', 'outlook', 'apple', 'manual')
- calendar_id, calendar_name
- access_token_encrypted, refresh_token_encrypted
- is_primary, sync_enabled, color
- created_at, updated_at
- UNIQUE(user_id, provider, calendar_id)
```

#### Calendar Events (`public.calendar_events`)
```sql
- id, user_id (FK), calendar_id (FK)
- external_event_id, title, description
- start_time, end_time, is_all_day
- location, attendees (JSONB)
- status ('confirmed', 'tentative', 'cancelled')
- created_at, updated_at
```

#### Smart Event Suggestions (`public.smart_event_suggestions`)
```sql
- id, user_id (FK), event_id (FK)
- suggested_at, reason
- confidence_score (0-1)
- optimal_time, travel_time_minutes
- is_dismissed, is_accepted
- created_at
```

**Suggestion Reasons:**
- 'free_time' - User has availability
- 'similar_interests' - Matches user interests
- 'location_convenient' - Near user location

#### Calendar Preferences (`public.calendar_preferences`)
```sql
- id, user_id (UNIQUE, FK)
- work_hours_start, work_hours_end (TIME)
- work_days (INTEGER[])
- buffer_time_minutes, max_daily_events
- auto_suggest_events, preferred_event_duration
- location_radius_km
- notification_preferences (JSONB)
- created_at, updated_at
```

### 5.6 Configuration Tables

#### AI Configuration (`public.ai_configuration`)
```sql
- id, setting_key (UNIQUE), setting_value (JSONB)
- description
- created_at, updated_at, updated_by
```

**Default Settings:**
- `default_model`: "claude-sonnet-4-20250514"
- `api_endpoint`: "https://api.anthropic.com/v1/messages"
- `max_tokens_standard`: 2000
- `max_tokens_large`: 8000
- `temperature_precise`: 0.1
- `temperature_creative`: 0.7

#### AI Models (`public.ai_models`)
```sql
- id, model_id (UNIQUE), model_name, provider
- description, context_window, max_output_tokens
- supports_vision, is_active
- created_at, updated_at, created_by
```

**Supported Models:**
- Claude Sonnet 4.5, 4, Opus 4.1, Haiku 3.5
- Google Gemini 2.5 variants
- OpenAI GPT-5 variants

### 5.7 Database Statistics

- **Total Tables:** 20+ core tables
- **Total Migrations:** 108 migration files
- **Indexes:** 30+ for performance optimization
- **RLS Policies:** 50+ policies enforcing security
- **Functions:** 20+ PostgreSQL functions
- **Triggers:** 15+ automated triggers

---

## 6. API & Edge Functions

### 6.1 Supabase Edge Functions

**Total Count:** 50+ Edge Functions
**Runtime:** Deno (TypeScript)
**Location:** `/supabase/functions/`

### 6.2 Core API Functions

#### Public APIs

**api-events** (`/api-events/index.ts`)
- **Purpose:** Public API for event data
- **Methods:** GET
- **Endpoints:**
  - `GET /api-events` - List events with filtering
  - `GET /api-events/{id}` - Single event details
- **Query Parameters:**
  - `limit`, `offset` - Pagination
  - `category`, `location`, `city` - Filtering
  - `search` - Full-text search
  - `start_date`, `end_date` - Date range
  - `status` - Event status
- **CORS:** Enabled for public access
- **Rate Limit:** 100 req/hour

**api-restaurants** (`/api-restaurants/index.ts`)
- Similar structure to api-events
- Restaurant-specific filtering
- Cuisine and price range filters

### 6.3 AI Content Functions

**generate-seo-content** (`/generate-seo-content/index.ts`)
- **Purpose:** Batch SEO content generation
- **Input:** `{ contentType: 'event'|'restaurant', batchSize: 10 }`
- **Process:**
  1. Fetch items with missing SEO fields
  2. Lock items with "PROCESSING..." marker
  3. Call Claude API for each item
  4. Update database with SEO content
  5. Reset lock on failure
- **Output:** SEO fields (title, description, keywords, h1, summary, facts, FAQ)
- **Error Handling:** Graceful failure with lock reset

**enhance-content** (`/enhance-content/index.ts`)
- **Purpose:** Single-item content enhancement
- **Input:** `{ contentType, contentId, currentData }`
- **Process:** Claude API research + enhancement
- **Output:** Enhanced description and metadata

**bulk-enhance-events** (`/bulk-enhance-events/index.ts`)
- **Purpose:** Batch event enhancement
- **Process:** Similar to generate-seo-content but for full descriptions

**generate-article** (`/generate-article/index.ts`)
- **Purpose:** AI article generation
- **Input:** Topic, keywords, target length
- **Output:** Full article with SEO metadata

**generate-weekend-guide** (`/generate-weekend-guide/index.ts`)
- **Purpose:** Automated weekend activity guides
- **Schedule:** Runs weekly
- **Output:** Curated weekend event guide

### 6.4 Data Enrichment Functions

**geocode-location** (`/geocode-location/index.ts`)
- **Purpose:** Convert addresses to coordinates
- **API:** Google Maps Geocoding API
- **Used for:** Event and restaurant mapping

**backfill-coordinates** (`/backfill-coordinates/index.ts`)
- **Purpose:** Batch geocoding for existing data
- **Process:** Find items without coordinates, geocode, update

**backfill-all-coordinates** (`/backfill-all-coordinates/index.ts`)
- **Purpose:** Full database coordinate backfill

**backfill-all-coordinates-force** (`/backfill-all-coordinates-force/index.ts`)
- **Purpose:** Force re-geocoding of all locations

**populate-playgrounds** (`/populate-playgrounds/index.ts`)
- **Purpose:** Initial playground data population
- **Source:** Curated playground list

### 6.5 Web Scraping Functions

**crawl-site** (`/crawl-site/index.ts`)
- **Purpose:** Scrape competitor websites
- **Target:** Catch Des Moines, other event sites
- **Process:** Puppeteer-based crawling

**firecrawl-scraper** (`/firecrawl-scraper/index.ts`)
- **Purpose:** Advanced web scraping with Firecrawl API
- **Features:** JavaScript rendering, AI extraction

**extract-catchdesmoines-urls** (`/extract-catchdesmoines-urls/index.ts`)
- **Purpose:** Extract event URLs from Catch Des Moines
- **Process:** DOM parsing, URL extraction

**ai-crawler** (`/ai-crawler/index.ts`)
- **Purpose:** AI-powered intelligent web crawling
- **Features:** Claude-based content extraction

### 6.6 Analytics & Monitoring Functions

**log-content-metrics** (`/log-content-metrics/index.ts`)
- **Purpose:** Track content performance
- **Metrics:** Views, clicks, engagement

**calculate-trending** (`/calculate-trending/index.ts`)
- **Purpose:** Calculate trending events/restaurants
- **Algorithm:** Time-weighted engagement scoring

**check-core-web-vitals** (`/check-core-web-vitals/index.ts`)
- **Purpose:** Monitor site performance
- **Metrics:** LCP, FID, CLS
- **API:** Google PageSpeed Insights

**check-security-headers** (`/check-security-headers/index.ts`)
- **Purpose:** Security header validation
- **Checks:** CSP, HSTS, X-Frame-Options, etc.

### 6.7 SEO & Marketing Functions

**generate-sitemap** (`/generate-sitemap/index.ts`)
**generate-sitemaps** (`/generate-sitemaps/index.ts`)
- **Purpose:** XML sitemap generation
- **Includes:** Events, restaurants, articles, static pages

**gsc-oauth** (`/gsc-oauth/index.ts`)
- **Purpose:** Google Search Console OAuth flow
- **Process:** OAuth2 authentication

**gsc-fetch-properties** (`/gsc-fetch-properties/index.ts`)
- **Purpose:** Fetch GSC properties
- **Output:** List of verified properties

**gsc-sync-data** (`/gsc-sync-data/index.ts`)
- **Purpose:** Sync GSC performance data
- **Frequency:** Daily
- **Data:** Clicks, impressions, CTR, position

### 6.8 Content Management Functions

**analyze-competitor** (`/analyze-competitor/index.ts`)
- **Purpose:** Competitor content analysis
- **Process:** Scrape → Analyze → Generate suggestions
- **Output:** Content gaps and opportunities

**analyze-content** (`/analyze-content/index.ts`)
- **Purpose:** Internal content analysis
- **Metrics:** SEO score, readability, engagement

**analyze-images** (`/analyze-images/index.ts`)
- **Purpose:** Image optimization analysis
- **Checks:** Size, format, alt text, compression

**check-broken-links** (`/check-broken-links/index.ts`)
- **Purpose:** Find broken links on site
- **Process:** Crawl → Test → Report

**fix-broken-event-urls** (`/fix-broken-event-urls/index.ts`)
- **Purpose:** Attempt to fix broken event links
- **Process:** Find alternatives, update database

### 6.9 System Management Functions

**system-backup** (`/system-backup/index.ts`)
- **Purpose:** Database backup creation
- **Note:** Placeholder (production would include S3 upload)

**cleanup-old-events** (`/cleanup-old-events/index.ts`)
- **Purpose:** Archive past events
- **Schedule:** Monthly
- **Criteria:** Events older than 30 days

**clear-system-cache** (`/clear-system-cache/index.ts`)
- **Purpose:** Clear application caches
- **Triggers:** Manual or post-deployment

**refresh-cdn-cache** (`/refresh-cdn-cache/index.ts`)
- **Purpose:** Invalidate Cloudflare CDN cache
- **Triggers:** Content updates

**restart-web-server** (`/restart-web-server/index.ts`)
- **Purpose:** Trigger server restart
- **Note:** For Cloudflare Pages redeployment

### 6.10 Business Functions

**create-campaign-checkout** (`/create-campaign-checkout/index.ts`)
- **Purpose:** Stripe checkout session creation
- **Input:** Campaign details, pricing
- **Output:** Stripe checkout URL

**personalized-recommendations** (`/personalized-recommendations/index.ts`)
- **Purpose:** Generate user-specific recommendations
- **Input:** User ID, preferences
- **Output:** Recommended events/restaurants

**send-event-reminders** (`/send-event-reminders/index.ts`)
- **Purpose:** Send event reminder notifications
- **Schedule:** Daily
- **Channels:** Email, SMS (if configured)

### 6.11 Testing & Development Functions

**test-article-webhook** (`/test-article-webhook/index.ts`)
- **Purpose:** Test webhook integration
- **Verify JWT:** true

**bulk-event-updater** (`/bulk-event-updater/index.ts`)
- **Purpose:** Batch event updates
- **Use Case:** Data migrations, corrections

**bulk-update-restaurants** (`/bulk-update-restaurants/index.ts`)
- **Purpose:** Batch restaurant updates

### 6.12 Shared Utilities

**Location:** `/supabase/functions/_shared/`

**aiConfig.ts**
- Centralized AI configuration
- Claude API headers and request building
- 5-minute caching

**Common Patterns:**
- CORS headers on all functions
- Error handling wrapper
- Database connection pooling
- Rate limiting middleware
- Input validation
- Security headers

---

## 7. Frontend Architecture

### 7.1 Project Structure

```
src/
├── components/          # 100+ React components
│   ├── admin/          # Admin-specific components
│   ├── advertising/    # Ad campaign components
│   ├── event-promotion-planner/
│   └── ui/             # shadcn/ui components
├── pages/              # 45+ route pages
├── hooks/              # Custom React hooks
├── lib/                # Utility libraries
│   ├── errorHandler.ts
│   ├── safeStorage.ts
│   └── supabase.ts
├── types/              # TypeScript type definitions
├── integrations/       # External integrations
│   └── supabase/       # Supabase client config
├── App.tsx             # Root component
├── main.tsx            # Entry point
└── index.css           # Global styles
```

### 7.2 Key Components

#### Layout Components
- **Navigation:** Responsive navbar with mobile menu
- **Footer:** Site footer with links
- **BackToTop:** Scroll-to-top button
- **AccessibleSkipLink:** Accessibility skip navigation
- **AccessibleLoadingSpinner:** Accessible loading states

#### Content Display Components
- **EventCard:** Event listing card
- **RestaurantCard:** Restaurant listing card
- **AttractionCard:** Attraction card
- **PlaygroundCard:** Playground card
- **ArticleCard:** Article preview card
- **AdBanner:** Advertisement display

#### Interactive Components
- **AdvancedSearchFilters:** Multi-faceted search
- **EventFilters:** Event-specific filters
- **AttractionFilters:** Attraction filters
- **AddToCalendarButton:** Calendar export
- **AddressInput:** Autocomplete address input
- **DateRangePicker:** Date range selection

#### Admin Components
- **AllInclusiveDashboard:** Main admin dashboard
- **ContentEditor:** Universal content editor
- **ContentEditDialog:** Quick edit modal
- **AdminAnalyticsDashboard:** Analytics view
- **AdminSecurityManager:** Security monitoring
- **AdminSystemControls:** System management
- **ActivityLogViewer:** Audit log viewer
- **AIEnhancementManager:** AI content tools
- **AIConfigurationManager:** AI settings

#### Business Components
- **BusinessDashboard:** Business owner dashboard
- **CampaignBuilder:** Ad campaign creation
- **CampaignAnalytics:** Campaign metrics
- **BusinessPartnershipApplication:** Partnership form

#### Map Components
- **EventsMap:** Event location map
- **AttractionsMap:** Attraction map
- **RestaurantMap:** Restaurant location map
- Uses Leaflet/React Leaflet

#### 3D Components
- **CityScape3D:** Three.js 3D city visualization
- **HeroScene:** 3D hero section
- Lazy-loaded for performance

### 7.3 State Management

#### TanStack Query (React Query)
- Server state management
- Automatic caching
- Background refetching
- Optimistic updates

**Usage Pattern:**
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['events', filters],
  queryFn: () => fetchEvents(filters)
});
```

#### React Context
- Theme management (dark/light mode)
- Authentication state
- User preferences
- Toast notifications

#### Local State
- React useState for component state
- React Hook Form for form state
- Zustand (if used) for global client state

### 7.4 Routing

**React Router v6** - Client-side routing

**Key Routes:**
```typescript
/ - Homepage (Index.tsx)
/events - Events listing
/events/:id - Event details
/events/today - Today's events
/events/weekend - Weekend events
/events/:month - Monthly events
/restaurants - Restaurant listing
/restaurants/:id - Restaurant details
/attractions - Attractions
/attractions/:id - Attraction details
/playgrounds - Playgrounds
/playgrounds/:id - Playground details
/articles - Articles
/articles/:slug - Article page
/auth - Login/signup
/profile - User profile
/user-dashboard - User dashboard
/admin - Admin dashboard
/advertise - Create ad campaign
/business-hub - Business portal
/neighborhoods - Neighborhood directory
/neighborhoods/:id - Neighborhood page
/guides - Content guides
/404 - Not found (Enhanced404.tsx)
```

### 7.5 Styling

#### Tailwind CSS
- Utility-first CSS framework
- Custom configuration in `tailwind.config.ts`
- JIT (Just-In-Time) compilation
- Dark mode support

#### shadcn/ui
- Radix UI primitives
- Accessible components
- Customizable with Tailwind
- Components in `src/components/ui/`

**Available Components:**
- Button, Input, Select, Checkbox, Radio, Switch
- Dialog, Sheet, Popover, Dropdown Menu, Context Menu
- Accordion, Tabs, Collapsible
- Toast, Alert Dialog
- Card, Avatar, Badge, Progress
- Calendar, Date Picker
- Form, Label, Textarea
- Navigation Menu, Menubar
- Scroll Area, Separator, Slider
- Tooltip, Hover Card
- And more...

#### Custom Styling
- Global styles in `src/index.css`
- Component-specific CSS in `src/App.css`
- CSS variables for theming

### 7.6 Performance Optimizations

#### Code Splitting
- Route-based splitting (automatic with React Router)
- Manual chunks for heavy libraries:
  - `vendor-3d` - Three.js, React Three Fiber
  - `vendor-maps` - Leaflet, React Leaflet
  - `vendor-charts` - Recharts
  - `vendor-supabase` - Supabase client
  - `vendor-ui` - Radix UI, Framer Motion
  - `vendor` - Other node_modules

#### Lazy Loading
```typescript
// Example in vite.config.ts
optimizeDeps: {
  exclude: ['@react-three/fiber', '@react-three/drei']
}
```

#### Image Optimization
- Lazy loading with `loading="lazy"`
- Responsive images with srcset
- WebP format support
- Image proxy for external images

#### Bundle Analysis
- Run `npm run build:analyze` to visualize bundle
- Target: <500KB gzipped

---

## 8. Security & Authentication

### 8.1 Authentication System

#### Supabase Auth
- **Email/Password:** Standard authentication
- **Email Verification:** Required for new accounts
- **OAuth Providers:** Google (configurable for more)
- **JWT Tokens:** Secure session management
- **Session Persistence:** Automatic token refresh

#### Auth Flow
1. User signs up → Email verification sent
2. User verifies email → Account activated
3. User logs in → JWT token issued
4. Token stored in localStorage (via safeStorage)
5. Token auto-refreshes before expiration

### 8.2 Authorization & Role-Based Access Control

#### Role Hierarchy
1. **root_admin** - Full system access (1 user)
   - All admin permissions
   - User role assignment
   - System configuration
   - Cannot be deleted

2. **admin** - Administrative access (few users)
   - Content management (create, edit, delete)
   - User management (view, edit, not delete)
   - Campaign management
   - Analytics access
   - SEO management
   - System controls (limited)

3. **moderator** - Content moderation (several users)
   - Content review and approval
   - Comment moderation
   - Flag content
   - Limited analytics

4. **user** - Regular user (most users)
   - View content
   - Create favorites
   - Add comments
   - Manage own profile
   - Calendar integration

#### Permission Checking
```typescript
// Database function
user_has_role_or_higher(user_id, required_role) → boolean

// Usage in RLS policies
CREATE POLICY "Admins can edit content"
ON content FOR UPDATE
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

### 8.3 Row Level Security (RLS)

**All tables have RLS enabled**

#### Common Policy Patterns

**Public Read:**
```sql
CREATE POLICY "Public read access"
ON events FOR SELECT
USING (true);
```

**User-Owned Data:**
```sql
CREATE POLICY "Users can manage their own data"
ON profiles FOR ALL
USING (auth.uid() = user_id);
```

**Role-Based:**
```sql
CREATE POLICY "Admins can manage all"
ON content FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));
```

**Status-Based:**
```sql
CREATE POLICY "Public can view published articles"
ON articles FOR SELECT
USING (status = 'published');
```

### 8.4 Security Features

#### Rate Limiting
- **Authentication:** 5 attempts/15min per email, 10/15min per IP
- **API Endpoints:** 100 requests/hour per user
- **Upload Endpoints:** 10 requests/hour
- **Search Endpoints:** 200 requests/hour
- Implemented via `check_auth_rate_limit()` function
- Rate limit headers in responses

#### Audit Logging
- **Admin Actions:** All logged to `admin_action_logs`
  - Action type, description
  - Target resource and ID
  - Old/new values (JSONB)
  - IP address, user agent
  - Timestamp

- **Failed Auth:** Tracked in `failed_auth_attempts`
  - Email, IP address
  - Attempt type (login, signup, password_reset)
  - Error message
  - Timestamp

- **Security Events:** Logged to `security_audit_logs`
  - Event type (rate_limit, auth_fail, suspicious_activity)
  - Severity (low, medium, high)
  - Details (JSONB)
  - User ID, IP address

#### Input Validation
- **SQL Injection Protection:** Parameterized queries only
- **XSS Prevention:** DOMPurify for user-generated content
- **CSRF Protection:** JWT tokens
- **Schema Validation:** Zod schemas for forms
- **Length Limits:** Enforced on all text inputs

#### Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cache-Control: no-store, no-cache, must-revalidate
Content-Security-Policy: (configured)
```

#### CORS Configuration
- **Public APIs:** Allowed origins configured
- **Private APIs:** Restricted to app domain
- **Preflight Handling:** OPTIONS method support

#### Data Protection
- **Encrypted Tokens:** Calendar OAuth tokens encrypted at rest
- **Password Hashing:** Supabase Auth (bcrypt)
- **No Secrets in Code:** All keys in environment variables
- **Secure Cookies:** HttpOnly, Secure flags

### 8.5 Security Best Practices Implemented

1. ✅ All database functions use `SECURITY DEFINER`
2. ✅ `SET search_path = ''` to prevent function hijacking
3. ✅ RLS policies on all user-facing tables
4. ✅ Input validation before database operations
5. ✅ Audit trails for admin actions
6. ✅ Rate limiting on edge functions
7. ✅ XSS prevention with DOMPurify
8. ✅ CSRF protection with JWT
9. ✅ No client-side secrets
10. ✅ Regular security audits (see SECURITY_AUDIT_REPORT.md)

---

## 9. Infrastructure & Deployment

### 9.1 Hosting Architecture

#### Frontend Hosting
- **Platform:** Cloudflare Pages
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Node Version:** >= 20.0.0
- **Deploy Method:** Git-based (automatic on push to main)
- **Preview Deployments:** Automatic for pull requests
- **CDN:** Cloudflare global CDN
- **SSL:** Automatic HTTPS

#### Backend Hosting
- **Platform:** Supabase Cloud
- **Project ID:** wtkhfqpmcegzcbngroui
- **Region:** US (configurable)
- **Database:** PostgreSQL (managed)
- **Edge Functions:** Deno runtime
- **Storage:** Supabase Storage (if used)

### 9.2 Environment Configuration

#### Required Environment Variables

**Frontend (.env):**
```bash
VITE_SUPABASE_URL=https://wtkhfqpmcegzcbngroui.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

**Edge Functions (Supabase Secrets):**
```bash
ANTHROPIC_API_KEY=<claude_api_key>
FIRECRAWL_API_KEY=<firecrawl_key>
GOOGLE_MAPS_API_KEY=<maps_key>
GOOGLE_SEARCH_CONSOLE_CLIENT_ID=<gsc_client_id>
GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET=<gsc_client_secret>
STRIPE_SECRET_KEY=<stripe_key>
STRIPE_WEBHOOK_SECRET=<stripe_webhook_secret>
```

**Optional:**
```bash
PAGESPEED_INSIGHTS_API_KEY=<pagespeed_key>
```

### 9.3 Deployment Process

#### Manual Deployment (Cloudflare Pages)
1. Connect GitHub repository to Cloudflare Pages
2. Configure build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node version: 20
3. Add environment variables
4. Deploy

#### Automatic Deployment
- Push to `main` branch triggers production deploy
- Push to other branches creates preview deployments
- Deployment status visible in GitHub commits

#### Lovable.dev Deployment
1. Open Lovable project
2. Click "Share" → "Publish"
3. Automatic deployment to configured hosting

### 9.4 Database Management

#### Migrations
- **Location:** `/supabase/migrations/`
- **Count:** 108 migration files
- **Format:** SQL files with timestamps
- **Naming:** `YYYYMMDDHHMMSS_description.sql`

#### Running Migrations
```bash
# Using Supabase CLI
supabase db push

# Or via npm script
npm run migrate
```

#### Migration Strategy
- All schema changes via migrations
- No manual SQL in production
- Test migrations in staging first
- Rollback plan for each migration

### 9.5 Monitoring & Observability

#### Application Monitoring
- **Supabase Dashboard:** Database queries, edge function logs
- **Cloudflare Analytics:** Page views, bandwidth, requests
- **Web Vitals:** LCP, FID, CLS tracking (via check-core-web-vitals)
- **Error Tracking:** Console errors logged (production has hidden sourcemaps)

#### Performance Monitoring
- **Lighthouse Scores:** Target >90
- **Core Web Vitals:**
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1
- **Bundle Size:** <500KB gzipped
- **API Response Times:** <200ms p95

#### Logging
- **Edge Functions:** Deno console logs in Supabase dashboard
- **Frontend:** Production console logs removed (via Vite config)
- **Database:** Postgres logs in Supabase
- **Audit Logs:** Custom tables (admin_action_logs, security_audit_logs)

### 9.6 Backup & Disaster Recovery

#### Database Backups
- **Supabase Automated:** Daily backups (7-day retention)
- **Manual Backups:** Via `system-backup` edge function
- **Backup Strategy:** Daily automated + pre-deployment manual

#### Recovery Plan
1. Restore from Supabase automated backup (point-in-time)
2. Verify data integrity
3. Test critical paths
4. Notify users if necessary

#### Rollback Procedure
1. Revert Git commit
2. Redeploy previous version
3. Rollback database migration if needed
4. Verify functionality

---

## 10. Performance & Optimization

### 10.1 Current Performance Metrics

#### Lighthouse Scores (Target)
- **Performance:** >90
- **Accessibility:** >90
- **Best Practices:** >90
- **SEO:** >90

#### Core Web Vitals (Target)
- **LCP (Largest Contentful Paint):** <2.5s
- **FID (First Input Delay):** <100ms
- **CLS (Cumulative Layout Shift):** <0.1

#### Bundle Size
- **Target:** <500KB gzipped
- **Actual:** Varies by route (code-split)
- **Vendor Chunks:**
  - vendor-3d: Three.js (~150KB)
  - vendor-maps: Leaflet (~50KB)
  - vendor-charts: Recharts (~80KB)
  - vendor-supabase: ~30KB
  - vendor-ui: Radix UI (~100KB)
  - vendor: Other dependencies (~200KB)

### 10.2 Frontend Optimizations

#### Build-Time Optimizations
1. **Code Splitting:** Manual chunks for heavy libraries
2. **Tree Shaking:** Unused code eliminated
3. **Minification:** esbuild minifier (faster than terser)
4. **CSS Optimization:** Tailwind purge, cssnano
5. **Console Removal:** All console.* removed in production
6. **Dead Code Elimination:** Debugger statements removed
7. **Bundle Analysis:** Visualizer plugin for optimization

#### Runtime Optimizations
1. **Lazy Loading:**
   - Three.js and React Three Fiber
   - Heavy components (maps, charts)
   - Route-based code splitting

2. **Image Optimization:**
   - Lazy loading with `loading="lazy"`
   - Responsive images with srcset
   - WebP format support
   - Image proxy for external images

3. **Caching:**
   - React Query caching (5-minute default)
   - localStorage for user preferences
   - Service Worker (if implemented)

4. **Memoization:**
   - React.memo for expensive components
   - useMemo for expensive calculations
   - useCallback for stable functions

### 10.3 Backend Optimizations

#### Database Performance
1. **Indexes:** 30+ indexes on frequently queried columns
   - Events: date, category, featured
   - Restaurants: featured, cuisine
   - Articles: status, published_at, slug
   - User queries: user_id, email
   - Time-based: created_at, updated_at

2. **Query Optimization:**
   - Pagination on all list queries
   - Limit clauses to prevent full table scans
   - Selective field fetching (not SELECT *)
   - Composite indexes for multi-column queries

3. **Connection Pooling:**
   - Supabase manages connection pool
   - Edge functions reuse connections

#### Edge Function Performance
1. **Caching:**
   - AI config cached (5-minute TTL)
   - Static data cached
   - CDN caching for public endpoints

2. **Batch Processing:**
   - Bulk SEO generation (10 items at a time)
   - Bulk event enhancement
   - Bulk coordinate backfill
   - Database locking to prevent duplicates

3. **Async Operations:**
   - Non-blocking I/O
   - Parallel API calls where possible
   - Background job queue (if implemented)

### 10.4 Network Optimizations

#### CDN (Cloudflare)
- **Global Edge Network:** Content served from nearest edge
- **Asset Caching:** Static assets cached at edge
- **Compression:** Gzip and Brotli enabled
- **HTTP/2:** Multiplexing enabled
- **Cache TTLs:** Configured per asset type

#### API Optimizations
1. **Response Compression:** Gzip/Brotli
2. **Pagination:** Limit/offset or cursor-based
3. **Field Selection:** Only requested fields returned
4. **ETags:** For cache validation (if implemented)
5. **CORS Preflight Caching:** Max-age configured

### 10.5 Performance Monitoring

#### Tools Used
- **Playwright:** Performance tests
- **Lighthouse:** Automated audits
- **PageSpeed Insights:** Google's performance API
- **Web Vitals Library:** Real user monitoring
- **Bundle Analyzer:** Rollup visualizer

#### Automated Checks
- `npm run test:performance` - Performance test suite
- `check-core-web-vitals` edge function - Periodic checks
- Build-time bundle size warnings (600KB limit)

### 10.6 Optimization Opportunities

**Current Opportunities:**
1. Implement Service Worker for offline support
2. Add image CDN (Cloudinary, Imgix)
3. Implement critical CSS inlining
4. Add resource hints (preconnect, prefetch)
5. Optimize font loading (font-display: swap)
6. Implement skeleton screens for better perceived performance
7. Add progressive web app (PWA) features
8. Implement server-side rendering (SSR) for SEO-critical pages

---

## 11. Testing Strategy

### 11.1 Testing Overview

#### Test Framework
- **Framework:** Playwright
- **Language:** TypeScript
- **Location:** `/tests/`
- **CI/CD:** Can be integrated (not currently set up)

#### Test Coverage
- **E2E Tests:** 10+ test suites
- **Accessibility Tests:** WCAG 2.1 Level AA
- **Performance Tests:** Core Web Vitals
- **Visual Tests:** Visual regression (basic)
- **Mobile Tests:** iOS and Android viewports

### 11.2 Test Suites

#### Links and Buttons (`tests/links-and-buttons.spec.ts`)
- Verify all navigation links work
- Check button functionality
- Test form submissions
- Validate external links

**Run:** `npm run test:links`

#### Mobile Responsive (`tests/mobile-responsive.spec.ts`)
- Test mobile viewports (iPhone, Android)
- Verify responsive layouts
- Check mobile navigation
- Test touch interactions

**Run:** `npm run test:mobile-responsive`

#### Accessibility (`tests/accessibility.spec.ts`)
- WCAG 2.1 Level AA compliance
- Color contrast checks
- ARIA labels validation
- Keyboard navigation
- Screen reader compatibility

**Run:** `npm run test:a11y`

#### Performance (`tests/performance.spec.ts`)
- Core Web Vitals measurement
- LCP, FID, CLS tracking
- Page load times
- Bundle size validation

**Run:** `npm run test:performance`

#### Forms (`tests/forms.spec.ts`)
- Form validation
- Error message display
- Successful submissions
- Required field checks

**Run:** `npm run test:forms`

#### Search and Filters (`tests/search-filters.spec.ts`)
- Search functionality
- Filter combinations
- Sort ordering
- Result accuracy

**Run:** `npm run test:search`

#### Visual Regression (`tests/visual-regression.spec.ts`)
- Screenshot comparison
- Layout consistency
- CSS regression detection

**Run:** `npm run test:visual`

### 11.3 Test Commands

```bash
# Run all tests
npm test

# Interactive UI mode
npm run test:ui

# Headed mode (see browser)
npm run test:headed

# Mobile tests only
npm run test:mobile

# Desktop tests only
npm run test:desktop

# Specific test suite
npm run test:links
npm run test:a11y
npm run test:performance

# Generate report
npm run test:report

# Code generation (record tests)
npm run test:codegen
```

### 11.4 Test Configuration

**Playwright Config:** `playwright.config.ts`

**Projects:**
- `chromium-desktop` - Desktop Chrome
- `firefox-desktop` - Desktop Firefox
- `webkit-desktop` - Desktop Safari
- `mobile-chrome` - Android Chrome
- `mobile-safari` - iOS Safari

**Settings:**
- Workers: Parallel execution
- Retries: 2 (on CI)
- Timeout: 30s per test
- Video: On failure
- Screenshots: On failure

### 11.5 Testing Best Practices

1. **Page Object Model:** Components organized logically
2. **Test Isolation:** Each test independent
3. **Data Independence:** No test relies on previous test data
4. **Cleanup:** Tests clean up after themselves
5. **Descriptive Names:** Clear test descriptions
6. **Assertions:** Multiple assertions per test
7. **Wait Strategies:** Proper waiting for elements
8. **Error Messages:** Clear failure messages

### 11.6 Testing Gaps & Opportunities

**Current Gaps:**
1. No unit tests (component-level)
2. No integration tests (API-level)
3. No load/stress testing
4. No security testing (automated)
5. Limited visual regression coverage

**Opportunities:**
1. Add Vitest for unit tests
2. Add API integration tests with Supertest
3. Implement load testing with k6
4. Add security testing with OWASP ZAP
5. Expand visual regression to all pages
6. Add CI/CD pipeline with automated tests
7. Implement test coverage reporting
8. Add mutation testing

---

## 12. Growth Opportunities

### 12.1 Feature Expansion Opportunities

#### 🎯 High Priority

**1. Mobile App Development**
- **Opportunity:** Native iOS and Android apps
- **Value:** Better mobile experience, push notifications, offline mode
- **Tech Stack:** React Native (existing React knowledge)
- **Effort:** Medium (3-4 months)
- **ROI:** High (mobile usage is 60%+ of traffic)
- **Note:** `/mobile-app/` directory exists with basic setup

**2. Enhanced Personalization**
- **Opportunity:** AI-powered user recommendations
- **Features:**
  - Collaborative filtering (users like you enjoyed...)
  - Content-based filtering (based on your interests...)
  - Location-based suggestions (near you...)
  - Time-based suggestions (available now...)
- **Tech:** Claude API, user behavior tracking
- **Effort:** Medium (2-3 months)
- **ROI:** High (increased engagement, return visits)

**3. User-Generated Content**
- **Opportunity:** Allow users to submit events, reviews, photos
- **Features:**
  - Event submission form (with admin approval)
  - Restaurant reviews and ratings
  - Photo uploads (with moderation)
  - User tips and recommendations
- **Value:** Fresh content, community engagement, SEO boost
- **Effort:** Medium (2-3 months)
- **ROI:** High (content creation at scale)

**4. Social Features**
- **Opportunity:** Build community engagement
- **Features:**
  - User profiles (public)
  - Follow other users
  - Share itineraries
  - Group planning (friends going together)
  - Activity feed (what friends are doing)
- **Effort:** Medium (2-3 months)
- **ROI:** High (viral growth potential)

**5. Advanced Search & Discovery**
- **Opportunity:** AI-powered natural language search
- **Features:**
  - "Find me a romantic dinner spot near downtown"
  - "What's happening this weekend for families?"
  - Voice search integration
  - Visual search (upload image, find similar)
- **Tech:** Claude API, embeddings, vector search
- **Effort:** Medium (2 months)
- **ROI:** High (better user experience)

#### 🚀 Medium Priority

**6. Ticketing Integration**
- **Opportunity:** Sell event tickets directly
- **Value:** Revenue stream (commission), convenience
- **Partners:** Eventbrite API, Ticketmaster, or custom
- **Effort:** High (4-5 months, legal complexity)
- **ROI:** High (10-15% commission potential)

**7. Restaurant Reservations**
- **Opportunity:** Reserve tables directly
- **Partners:** OpenTable, Resy, or custom
- **Value:** Convenience, commission revenue
- **Effort:** Medium (2-3 months)
- **ROI:** Medium-High (5-10% commission)

**8. Tour & Experience Booking**
- **Opportunity:** Book tours, classes, experiences
- **Examples:** Brewery tours, cooking classes, ghost tours
- **Value:** Revenue, unique offerings
- **Effort:** High (3-4 months)
- **ROI:** Medium-High

**9. Email Newsletter System**
- **Opportunity:** Weekly/daily event digest
- **Features:**
  - Personalized based on interests
  - Weekend preview
  - New restaurant openings
  - Special event alerts
- **Tech:** SendGrid, Mailchimp, or Supabase Edge Functions
- **Effort:** Low (1 month)
- **ROI:** High (user retention, traffic)

**10. Blog & Content Hub**
- **Opportunity:** Original content creation
- **Topics:**
  - "Best Coffee Shops in Des Moines"
  - "Family-Friendly Activities This Month"
  - "Hidden Gems of Des Moines"
  - "Interview with Local Business Owners"
- **Value:** SEO, brand authority, engagement
- **Effort:** Low-Medium (ongoing)
- **ROI:** High (SEO traffic, brand building)
- **Note:** Basic article system exists (`articles` table)

#### 📊 Analytics & Business Intelligence

**11. Advanced Analytics Dashboard**
- **Opportunity:** Better business insights
- **Features:**
  - User behavior analytics (Mixpanel, Amplitude)
  - Conversion funnel analysis
  - A/B testing framework
  - Cohort analysis
  - Revenue attribution
- **Tech:** Mixpanel, Segment, or custom
- **Effort:** Medium (2 months)
- **ROI:** High (data-driven decisions)

**12. Business Intelligence Portal**
- **Opportunity:** Restaurant/venue analytics
- **Features:**
  - Profile views, clicks, directions
  - Comparison to competitors
  - Peak traffic times
  - User demographics
- **Value:** Upsell to paid business accounts
- **Effort:** Medium (2-3 months)
- **ROI:** Medium-High (B2B revenue)

### 12.2 Technical Infrastructure Opportunities

#### 🏗️ Architecture Improvements

**1. Microservices for Heavy Workloads**
- **Opportunity:** Separate scraping/AI services
- **Value:** Better scaling, isolation
- **Tech:** Separate Deno Deploy or AWS Lambda
- **Effort:** Medium (2 months)
- **ROI:** Medium (better performance, cost optimization)

**2. Caching Layer**
- **Opportunity:** Redis or Cloudflare KV
- **Use Cases:**
  - API response caching
  - Session management
  - Rate limiting
  - Real-time leaderboards
- **Effort:** Low-Medium (1-2 months)
- **ROI:** High (performance, cost savings)

**3. Search Engine (Algolia/Meilisearch)**
- **Opportunity:** Dedicated search infrastructure
- **Value:** Faster, more relevant search results
- **Features:** Typo tolerance, faceting, geo-search
- **Effort:** Medium (1-2 months)
- **ROI:** High (better UX, SEO)

**4. Image CDN & Optimization**
- **Opportunity:** Cloudinary, Imgix, or Cloudflare Images
- **Value:** Faster page loads, lower bandwidth
- **Features:** Automatic resizing, format conversion, lazy loading
- **Effort:** Low (1 month)
- **ROI:** High (performance, cost savings)

**5. GraphQL API Layer**
- **Opportunity:** Flexible API for mobile apps
- **Value:** Single endpoint, type safety, efficiency
- **Tech:** Hasura or custom with Apollo
- **Effort:** Medium (2 months)
- **ROI:** Medium (better mobile app dev)

#### 🔒 Security Enhancements

**6. Advanced Security**
- **Opportunity:** Enterprise-grade security
- **Features:**
  - Web Application Firewall (WAF)
  - DDoS protection (Cloudflare)
  - Bot detection (reCAPTCHA v3)
  - Intrusion detection
  - Security scanning (Snyk)
- **Effort:** Low-Medium (ongoing)
- **ROI:** High (protect reputation, prevent attacks)

**7. GDPR/Privacy Compliance**
- **Opportunity:** Full privacy compliance
- **Features:**
  - Cookie consent manager
  - Data export functionality
  - Right to deletion
  - Privacy policy generator
  - Audit trail
- **Effort:** Medium (2 months)
- **ROI:** High (legal compliance, trust)

### 12.3 Business Model Opportunities

#### 💰 Revenue Streams

**1. Premium Business Listings**
- **Tier 1 (Free):** Basic listing
- **Tier 2 ($49/mo):** Enhanced listing, photos, priority placement
- **Tier 3 ($149/mo):** Featured listing, analytics, promotion tools
- **Effort:** Low (1 month)
- **ROI:** High (recurring revenue)

**2. Affiliate Partnerships**
- **Opportunity:** Commission on bookings
- **Partners:**
  - Hotels (Booking.com, Expedia)
  - Tours (Viator, GetYourGuide)
  - Tickets (StubHub, SeatGeek)
- **Effort:** Low (integration time)
- **ROI:** High (passive income)

**3. Sponsored Content**
- **Opportunity:** Paid articles, event features
- **Examples:** "Sponsored: Top 10 Date Spots" (by sponsor)
- **Value:** Revenue, partner relationships
- **Effort:** Low (content creation)
- **ROI:** High (high-margin revenue)

**4. API Access**
- **Opportunity:** Sell API access to developers
- **Use Cases:** Hotel websites, tourism apps, chatbots
- **Pricing:** $99-499/mo based on usage
- **Effort:** Low (API already exists)
- **ROI:** Medium (niche but high-margin)

**5. White-Label Platform**
- **Opportunity:** Replicate for other cities
- **Examples:** "Iowa City Pulse", "Cedar Rapids Pulse"
- **Revenue:** SaaS model ($499-999/mo per city)
- **Effort:** High (multi-tenancy)
- **ROI:** High (scalable growth)
- **Note:** `PLATFORM_REPLICATION_GUIDE.md` exists

### 12.4 Marketing & Growth Opportunities

#### 📈 Growth Strategies

**1. SEO Expansion**
- **Opportunity:** Target more keywords
- **Tactics:**
  - Long-tail keyword pages ("romantic restaurants des moines")
  - FAQ pages (Schema.org FAQ markup)
  - Location pages (neighborhood-level)
  - Comparison pages ("Des Moines vs Iowa City")
- **Effort:** Medium (ongoing)
- **ROI:** High (organic traffic)

**2. Content Marketing**
- **Opportunity:** Become the authority on Des Moines
- **Channels:**
  - Blog (2-3 posts/week)
  - YouTube (video guides)
  - Podcast (local interviews)
  - Social media (daily posts)
- **Effort:** Medium-High (ongoing)
- **ROI:** High (brand building, SEO)

**3. Partnership Marketing**
- **Opportunity:** Co-marketing with local businesses
- **Examples:**
  - "Featured on Des Moines AI Pulse" badge
  - Joint social media campaigns
  - Cross-promotion
  - Event sponsorships
- **Effort:** Low (relationship building)
- **ROI:** High (credibility, reach)

**4. Influencer Partnerships**
- **Opportunity:** Local influencer collaborations
- **Strategy:** Micro-influencers (1k-10k followers)
- **Channels:** Instagram, TikTok, YouTube
- **Effort:** Low-Medium (outreach)
- **ROI:** Medium-High (social proof, reach)

**5. Paid Acquisition**
- **Opportunity:** Google Ads, Facebook Ads
- **Targets:** High-intent keywords ("things to do des moines")
- **Budget:** $1k-5k/month
- **Effort:** Low (setup and monitoring)
- **ROI:** Medium (depends on CAC vs LTV)

---

## 13. Technical Debt & Known Issues

### 13.1 Technical Debt

#### Code Quality

**1. TypeScript Strict Mode**
- **Issue:** Not all files use strict TypeScript
- **Impact:** Potential type safety issues
- **Files:** `tsconfig.strict.json` exists but not fully adopted
- **Solution:** Gradual migration to strict mode
- **Effort:** Medium (ongoing)
- **Priority:** Medium

**2. Component Complexity**
- **Issue:** Some components are very large (>500 lines)
- **Examples:**
  - `Admin.tsx` - 62KB, 1600+ lines
  - `EventsPage.tsx` - 48KB, 1300+ lines
  - `Restaurants.tsx` - 36KB, 900+ lines
- **Impact:** Hard to maintain, test, review
- **Solution:** Break into smaller components
- **Effort:** High (refactoring)
- **Priority:** Medium

**3. Duplicate Code**
- **Issue:** Some patterns repeated across components
- **Examples:** Filter logic, API calls, error handling
- **Solution:** Extract to custom hooks, utility functions
- **Effort:** Medium
- **Priority:** Low-Medium

**4. Missing Unit Tests**
- **Issue:** Only E2E tests, no unit/integration tests
- **Impact:** Slower feedback, harder debugging
- **Solution:** Add Vitest for unit tests
- **Effort:** High (ongoing)
- **Priority:** Medium

#### Database

**5. Migration Complexity**
- **Issue:** 108 migration files (some could be consolidated)
- **Impact:** Slower migration runs, harder to track changes
- **Solution:** Periodic migration squashing (carefully)
- **Effort:** Low (but risky)
- **Priority:** Low

**6. Missing Indexes**
- **Issue:** Some queries could benefit from additional indexes
- **Examples:** Full-text search on descriptions
- **Impact:** Slower queries as data grows
- **Solution:** Add indexes based on query analysis
- **Effort:** Low
- **Priority:** Medium

**7. Data Consistency**
- **Issue:** Some old data lacks SEO fields, coordinates
- **Impact:** Incomplete data in search results
- **Solution:** Backfill scripts (some exist)
- **Effort:** Low (run existing scripts)
- **Priority:** Medium

#### Frontend

**8. Bundle Size**
- **Issue:** Some vendor chunks are large
- **Examples:** vendor-3d (150KB), vendor (200KB)
- **Impact:** Slower initial load
- **Solution:** More aggressive code splitting, lazy loading
- **Effort:** Medium
- **Priority:** Medium-High

**9. Accessibility**
- **Issue:** Some components lack ARIA labels, keyboard nav
- **Impact:** Poor screen reader experience
- **Solution:** Accessibility audit and fixes
- **Effort:** Medium
- **Priority:** High (legal compliance)

**10. Mobile Performance**
- **Issue:** 3D graphics slow on older phones
- **Impact:** Poor mobile experience
- **Solution:** Disable 3D on low-power devices
- **Effort:** Low
- **Priority:** Medium

#### Backend

**11. Edge Function Error Handling**
- **Issue:** Inconsistent error handling across functions
- **Impact:** Hard to debug, poor user experience
- **Solution:** Standardize error handling middleware
- **Effort:** Medium
- **Priority:** Medium

**12. Rate Limiting Gaps**
- **Issue:** Not all edge functions have rate limiting
- **Impact:** Potential abuse, high costs
- **Solution:** Apply rate limiting to all functions
- **Effort:** Low
- **Priority:** High

**13. Monitoring Gaps**
- **Issue:** Limited observability into edge functions
- **Impact:** Hard to debug production issues
- **Solution:** Add logging service (Sentry, LogRocket)
- **Effort:** Low-Medium
- **Priority:** High

### 13.2 Known Issues

#### Functionality

**1. Calendar Sync Reliability**
- **Issue:** Calendar sync occasionally fails
- **Cause:** OAuth token expiration not always caught
- **Workaround:** User re-authenticates
- **Solution:** Better token refresh logic
- **Priority:** High

**2. Search Accuracy**
- **Issue:** Search sometimes returns irrelevant results
- **Cause:** Simple text matching (not semantic)
- **Solution:** Implement semantic search (embeddings)
- **Priority:** Medium

**3. Image Loading**
- **Issue:** Some external images fail to load
- **Cause:** External URLs change, CORS issues
- **Solution:** Image proxy, local caching
- **Priority:** Medium

**4. Mobile Menu**
- **Issue:** Mobile menu sometimes overlaps content
- **Cause:** Z-index issues
- **Solution:** CSS refactoring
- **Priority:** Low

#### Performance

**5. Initial Load Time**
- **Issue:** First load can be slow (3-5s)
- **Cause:** Large JavaScript bundle
- **Solution:** More aggressive code splitting
- **Priority:** High

**6. Database Query Performance**
- **Issue:** Some queries slow with large datasets
- **Cause:** Missing indexes, inefficient queries
- **Solution:** Query optimization, index analysis
- **Priority:** Medium

**7. AI API Latency**
- **Issue:** Claude API calls can be slow (5-10s)
- **Cause:** Network latency, model processing time
- **Solution:** Caching, batch processing, async jobs
- **Priority:** Low (expected for AI)

#### Security

**8. Session Management**
- **Issue:** Users sometimes logged out unexpectedly
- **Cause:** Token refresh timing
- **Solution:** Improve token refresh logic
- **Priority:** Medium

**9. Input Validation**
- **Issue:** Not all inputs validated on backend
- **Cause:** Relying on frontend validation
- **Solution:** Backend validation for all inputs
- **Priority:** High

### 13.3 Documentation Debt

**1. API Documentation**
- **Issue:** No centralized API docs
- **Solution:** Add Swagger/OpenAPI docs
- **Priority:** Medium

**2. Component Documentation**
- **Issue:** Components lack JSDoc comments
- **Solution:** Add Storybook or JSDoc
- **Priority:** Low-Medium

**3. Setup Guide**
- **Issue:** Setup can be confusing for new devs
- **Solution:** Improve README, video walkthrough
- **Priority:** Low

---

## 14. Maintenance & Operations

### 14.1 Routine Maintenance

#### Daily Tasks
- ✅ Monitor error logs (Supabase dashboard)
- ✅ Check site uptime (Cloudflare analytics)
- ✅ Review failed auth attempts
- ✅ Monitor API costs (Anthropic, Firecrawl)

#### Weekly Tasks
- ✅ Review admin action logs
- ✅ Check for outdated dependencies (`npm outdated`)
- ✅ Review user feedback/support tickets
- ✅ Content review (new restaurants, events)
- ✅ Performance check (PageSpeed Insights)

#### Monthly Tasks
- ✅ Security audit review
- ✅ Dependency updates (`npm update`)
- ✅ Database cleanup (old events, logs)
- ✅ Backup verification
- ✅ Analytics review (traffic, engagement)
- ✅ Cost optimization review

#### Quarterly Tasks
- ✅ Comprehensive security audit
- ✅ Performance optimization review
- ✅ Database optimization (vacuum, analyze)
- ✅ Major dependency updates
- ✅ User survey/feedback collection
- ✅ Competitive analysis

### 14.2 Monitoring & Alerting

#### Current Monitoring
- **Supabase:** Database queries, edge function logs
- **Cloudflare:** CDN performance, traffic patterns
- **Manual:** Periodic checks of site functionality

#### Recommended Monitoring
- **Uptime Monitoring:** Pingdom, UptimeRobot (free tier)
- **Error Tracking:** Sentry (free tier)
- **Performance:** Google Analytics, PageSpeed Insights
- **API Monitoring:** Monitor Anthropic API costs
- **Security:** Failed auth alerts, unusual activity

#### Alert Triggers
- Site down >5 minutes
- Error rate >5% of requests
- Database CPU >80% for 5 minutes
- API cost spike (>$100/day)
- Failed auth >100 in 1 hour
- Disk space <10% free

### 14.3 Backup Strategy

#### Database Backups
- **Automated:** Supabase daily backups (7-day retention)
- **Manual:** Weekly manual backup via `system-backup` function
- **Retention:** 7 days (Supabase), 30 days (manual)
- **Storage:** Supabase cloud, local download

#### Code Backups
- **Repository:** GitHub (private)
- **Branches:** main, development, feature branches
- **Backup:** Git (distributed, inherently backed up)
- **Retention:** Indefinite (git history)

#### Media Backups
- **User Uploads:** Supabase Storage (if used)
- **Backup:** Manual download or sync to S3
- **Retention:** 30 days

### 14.4 Disaster Recovery Plan

#### Scenario 1: Database Corruption
1. Stop all write operations
2. Assess corruption extent
3. Restore from latest Supabase backup
4. Verify data integrity
5. Resume operations
6. Post-mortem analysis

**Recovery Time Objective (RTO):** 2 hours
**Recovery Point Objective (RPO):** 24 hours (daily backup)

#### Scenario 2: Cloudflare Outage
1. Verify outage (Cloudflare status page)
2. Switch DNS to backup hosting (if configured)
3. Notify users via social media
4. Wait for Cloudflare resolution
5. Verify site functionality after restoration

**RTO:** 4 hours (waiting for Cloudflare)
**RPO:** N/A (static hosting)

#### Scenario 3: Supabase Outage
1. Verify outage (Supabase status page)
2. Serve cached content (Cloudflare)
3. Notify users (limited functionality)
4. Wait for Supabase resolution
5. Verify functionality after restoration

**RTO:** 4 hours (waiting for Supabase)
**RPO:** 0 (read-only mode)

#### Scenario 4: Security Breach
1. Immediately revoke compromised credentials
2. Rotate all API keys
3. Force user password resets (if needed)
4. Audit logs for unauthorized access
5. Fix vulnerability
6. Notify affected users (GDPR requirement)
7. Post-mortem and security improvements

**RTO:** 24 hours (depends on breach extent)
**RPO:** Varies

### 14.5 Dependency Management

#### Update Strategy
- **Patch Updates (x.x.X):** Weekly, low risk
- **Minor Updates (x.X.x):** Monthly, medium risk (test first)
- **Major Updates (X.x.x):** Quarterly, high risk (test thoroughly)

#### Critical Dependencies
- **React:** Major updates annually
- **Supabase:** Follow Supabase release schedule
- **Vite:** Minor updates quarterly
- **shadcn/ui:** Update as needed (components)
- **Tailwind CSS:** Minor updates quarterly

#### Security Updates
- **Immediate:** Critical security patches
- **Weekly:** High-priority security updates
- **Monthly:** Medium-priority security updates

#### Tools
- `npm audit` - Security vulnerability scan
- `npm outdated` - Check for updates
- Dependabot (GitHub) - Automated PR for updates
- Snyk (optional) - Advanced security scanning

### 14.6 Cost Management

#### Current Monthly Costs (Estimated)

**Hosting & Infrastructure:**
- Cloudflare Pages: $0 (free tier) or $20 (Pro)
- Supabase: $25 (Pro tier) or $0 (free tier)
- **Subtotal: $0-45/month**

**APIs & Services:**
- Anthropic Claude: $50-200/month (varies by usage)
- Firecrawl: $0 (free tier) or $29+ (paid)
- Google Maps API: $0-50/month (varies by geocoding usage)
- Google Search Console: $0 (free)
- PageSpeed Insights: $0 (free)
- Stripe: $0 (commission-based)
- **Subtotal: $50-280/month**

**Total Estimated: $50-325/month**

#### Cost Optimization Strategies
1. **Caching:** Reduce API calls (Claude, Firecrawl)
2. **Batch Processing:** Group AI requests
3. **Free Tier Usage:** Maximize free tiers
4. **Monitoring:** Track usage patterns
5. **Rate Limiting:** Prevent abuse
6. **Image Optimization:** Reduce bandwidth

#### Cost Alerts
- Claude API: Alert if >$100/day
- Firecrawl: Monitor request count
- Database: Alert if approaching storage limit
- Bandwidth: Alert if unusual spike

---

## Appendix: Key Files Reference

### Configuration Files
- `/package.json` - Dependencies and scripts
- `/vite.config.ts` - Build configuration
- `/tailwind.config.ts` - Styling configuration
- `/playwright.config.ts` - Test configuration
- `/tsconfig.json` - TypeScript configuration
- `/supabase/config.toml` - Supabase configuration
- `/.env.example` - Environment variable template

### Documentation Files (110+ markdown files)
- `/README.md` - Project overview
- `/SUPABASE_DATABASE_STRUCTURE.md` - Database docs
- `/DEVELOPER_GUIDE.md` - Developer guide
- `/CONTRIBUTING.md` - Contribution guidelines
- `/DEPLOYMENT.md` - Deployment guide
- `/SECURITY_AUDIT_REPORT.md` - Security audit
- `/PLATFORM_REPLICATION_GUIDE.md` - Multi-city guide
- `/ChatGPT.md` - ChatGPT integration
- Plus 100+ feature-specific docs

### Key Source Files
- `/src/App.tsx` - Root component
- `/src/main.tsx` - Entry point
- `/src/pages/Admin.tsx` - Admin dashboard
- `/src/pages/EventsPage.tsx` - Events listing
- `/src/pages/RestaurantsPage.tsx` - Restaurants listing
- `/src/components/AdminDashboard.tsx` - Admin UI
- `/src/lib/supabase.ts` - Supabase client

### Database Files
- `/supabase/migrations/*.sql` - 108 migration files
- `/supabase/functions/` - 50+ edge functions

---

## Document Maintenance

**This Living Technical Specification should be updated:**
- When major features are added or removed
- When architecture changes significantly
- When technology stack changes
- Quarterly at minimum
- Before major releases

**Update Process:**
1. Create branch: `docs/update-lts-YYYY-MM-DD`
2. Update relevant sections
3. Increment version number
4. Update "Last Updated" date
5. Create pull request for review
6. Merge to main

**Version History:**
- v1.1 (2025-11-13) - Updated metrics, component counts, and current state
- v1.0 (2025-11-11) - Initial creation

---

**End of Living Technical Specification**
