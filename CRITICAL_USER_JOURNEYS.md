# Critical User Journeys - Des Moines Insider

**Documentation Date:** 2025-11-08
**Site:** https://desmoinesinsider.com
**Purpose:** Comprehensive mapping of all critical user flows with friction points and improvement recommendations

---

## Table of Contents
1. [Signup & Onboarding Journey](#1-signup--onboarding-journey)
2. [Primary Feature Usage Journeys](#2-primary-feature-usage-journeys)
3. [Business Advertising & Payment Journey](#3-business-advertising--payment-journey)
4. [Summary of Critical Issues](#summary-of-critical-issues)

---

## 1. Signup & Onboarding Journey

### User Goal
Create an account to access personalized features, save favorites, and receive event recommendations.

### Entry Points
- Homepage CTA
- `/auth` page (direct navigation)
- Redirect when accessing protected features (e.g., `/advertise`, `/profile`)

---

### Flow Steps

#### **Step 1: Auth Page Landing** (`/auth`)
- **Page:** Auth.tsx:37-371
- **Screenshot/UI:** Tab-based interface with Login/Sign Up tabs
- **What User Sees:**
  - "Des Moines Insider" branding
  - Two tabs: "Login" and "Sign Up"
  - Tagline: "Your personalized guide to Des Moines events and experiences"

**Potential Confusion Points:**
- ❌ No visual indication of benefits for signing up
- ❌ No social login options (only email/password)
- ❌ Password strength requirements not shown until submission

---

#### **Step 2A: Login Flow** (Auth.tsx:188-216)
**Fields Required:**
1. Email address
2. Password (minimum 6 characters)

**Process:**
1. User enters credentials
2. Click "Sign In" button
3. Supabase authentication occurs
4. Success → Redirect to homepage (`/`)
5. Error → Toast notification with error message

**Issues:**
- ❌ No "Forgot Password" link visible
- ❌ No "Remember Me" option
- ❌ Error messages can be technical (e.g., "Invalid login credentials")
- ✅ Good: Loading state on button ("Signing in...")
- ✅ Good: Clear error feedback via toast

**Missing Confirmations:**
- No success message on homepage after login
- No redirect to previous page if user was redirected to auth

---

#### **Step 2B: Sign Up Flow** (Auth.tsx:218-364)
**Fields Required (in order):**
1. **First Name** (required)
2. **Last Name** (required)
3. **Email** (required, validated)
4. **Password** (required, min 6 chars)
5. **Phone** (optional, placeholder: "(515) 555-0123")
6. **Location** (dropdown, 8 options)
   - Downtown Des Moines
   - West Des Moines
   - Ankeny
   - Urbandale
   - Clive
   - Johnston
   - Altoona
   - Other
7. **Interests** (multi-select grid, 8 options):
   - Food & Dining
   - Music & Concerts
   - Sports & Recreation
   - Arts & Culture
   - Nightlife & Entertainment
   - Outdoor Activities
   - Family Events
   - Business & Networking
8. **Communication Preferences** (3 checkboxes):
   - Email notifications about events (default: ON)
   - SMS notifications (default: OFF)
   - Personalized event recommendations (default: ON)

**Process:**
1. User fills form fields
2. Clicks "Create Account" button (Auth.tsx:361-363)
3. Backend creates Supabase Auth user with metadata
4. Email verification sent to user's email
5. Success toast: "Account Created! Please check your email to verify your account."
6. Auto-switches to Login tab (Auth.tsx:154)

**Critical Issues:**
- ❌ **No onboarding completion confirmation** - User is left on login tab after signup
- ❌ **Email verification required but not enforced** - Users can potentially access site without verifying
- ❌ **No visual progress indicator** - Long form feels overwhelming
- ❌ **Interests section not well explained** - Users may not understand how this affects recommendations
- ❌ **SMS notifications offered but phone is optional** - Confusing UX
- ❌ **Location field not required** - Critical for personalization but can be skipped
- ❌ **No terms of service or privacy policy checkbox**

**Good Elements:**
- ✅ Visual interest selection with icons (clickable cards)
- ✅ Clear field labels and placeholders
- ✅ Password minimum length requirement (6 chars)
- ✅ Loading states on buttons

**Missing Feedback:**
- No confirmation email preview or instructions
- No next steps explained after signup
- No indication of what happens with their data
- No way to skip or complete later

---

#### **Step 3: Email Verification**
**Process:**
1. User receives email from Supabase
2. Clicks verification link
3. Redirected to homepage (`/`) via `emailRedirectTo` (Auth.tsx:117)

**Issues:**
- ❌ No dedicated "Email Verified" confirmation page
- ❌ No indication on homepage that email was verified
- ❌ User lands on homepage with no context
- ❌ No guided next steps after verification

**Improvement Needed:**
- Create `/auth/verified` page with welcome message and next steps
- Show personalized dashboard preview
- Offer quick tour of features

---

#### **Step 4: Post-Signup Experience**
**Current Behavior:**
- User is authenticated and lands on homepage (Index.tsx)
- Homepage shows `PersonalizedDashboard` component instead of generic content (Index.tsx:193-196)

**What's Missing:**
- ❌ No welcome modal or first-time user guide
- ❌ No indication that content is now personalized
- ❌ No prompt to complete profile
- ❌ No explanation of new features available
- ❌ User interests not visibly reflected in recommendations

**Recommended Flow:**
1. Welcome modal: "Welcome to Des Moines Insider!"
2. Quick feature highlights (save favorites, get alerts, check-in to events)
3. Option to take a tour or skip
4. Highlight personalized recommendations based on selected interests
5. Prompt to enable notifications if not already enabled

---

### Complete Signup Journey Map

```
Entry → /auth → Sign Up Tab
  ↓
Personal Info (First, Last, Email, Password)
  ↓
Phone (optional) ← FRICTION: SMS option but phone optional
  ↓
Location Selection ← FRICTION: Can be skipped but critical for personalization
  ↓
Interest Selection (8 categories) ← GOOD: Visual, clear
  ↓
Communication Preferences ← FRICTION: Unclear impact
  ↓
Click "Create Account" ← FRICTION: No preview of what happens next
  ↓
Loading... ← GOOD: Clear state
  ↓
Success Toast: "Check your email" ← FRICTION: No next steps
  ↓
Auto-switch to Login tab ← FRICTION: User doesn't know what to do
  ↓
User checks email
  ↓
Click verification link
  ↓
Redirect to homepage ← FRICTION: No "verified" confirmation
  ↓
Personalized Dashboard shown ← FRICTION: No indication it's personalized
  ↓
JOURNEY INCOMPLETE - User confused about next steps
```

---

### Key Improvements for Signup/Onboarding

#### High Priority (Confusion/Blocking Issues)
1. **Add post-signup confirmation page** instead of switching to login tab
   - Show "Check your email" with visual representation
   - Explain what's in the email
   - Provide resend verification option
   - Show expected wait time

2. **Create email verification success page** (`/auth/verified`)
   - Welcome message with user's first name
   - "Your account is now active!"
   - Show 3-4 key features they can now use
   - CTA: "Explore Events Based on Your Interests"

3. **Add first-time user onboarding modal** on homepage
   - One-time modal after first login
   - 3-step carousel: Discover, Save, Get Alerted
   - Option to skip
   - Mark as completed in user profile

4. **Make location required** during signup
   - Add validation
   - Explain why it's needed: "We'll show you events near [Location]"

5. **Show password requirements** before submission
   - Min 6 characters (currently only validated on submit)
   - Consider showing strength meter

#### Medium Priority (Improvement Opportunities)
1. Add social login (Google, Facebook) for easier signup
2. Show benefits of account creation before signup form
3. Add progress indicator for multi-step signup form
4. Add "Forgot Password?" link on login tab
5. Improve error messages (make them user-friendly)
6. Add preview of how interests affect recommendations
7. Make SMS notification checkbox disabled if no phone entered

#### Low Priority (Nice to Have)
1. Add profile completion percentage after signup
2. Send welcome email series (day 1, day 3, day 7)
3. Add social proof (e.g., "Join 15,000+ Des Moines locals")
4. Add testimonials on auth page
5. Pre-fill location based on IP address (with option to change)

---

## 2. Primary Feature Usage Journeys

### 2.1 Event Discovery Journey

#### User Goal
Find interesting events happening in Des Moines this weekend

#### Entry Points
- Homepage hero section
- `/events` routes
- Search bar
- Navigation menu

---

### Flow 1: Homepage Event Discovery

#### **Step 1: Homepage Landing** (`/` - Index.tsx)

**What User Sees:**
1. **3D Cityscape Hero** (Index.tsx:151-154)
   - Interactive 3D Des Moines cityscape (Three.js)
   - Hero text: "Discover Des Moines Like Never Before"
   - Subtext with value proposition
   - Stats grid: 200+ Events, 300+ Restaurants, 50+ Attractions, 100+ Playgrounds

2. **Search Section** (Index.tsx:186)
   - Prominent search bar
   - Category filters
   - Date/location/price range filters

3. **All-Inclusive Dashboard** (Index.tsx:189)
   - Featured events
   - Upcoming events
   - Event cards with images

**Issues:**
- ❌ Search bar doesn't explain what it searches (events, restaurants, both?)
- ❌ 3D hero is cool but takes time to load (lazy loaded, shows gradient fallback)
- ✅ Good: Stats provide social proof
- ✅ Good: Lazy loading for performance

---

#### **Step 2: Search/Browse Events**

**Option A: Use Search Bar**
- User types query (e.g., "music")
- Clicks search
- Scrolls to events section (smooth scroll - Index.tsx:83)
- Toast: "Smart Search Applied" (Index.tsx:86-89)

**Issues:**
- ❌ **Critical:** Search doesn't actually filter events (TODO comment in code - Index.tsx:85)
- ❌ Toast notification is misleading (says search applied but nothing happens)
- ❌ No search results page
- ❌ No indication of what was found

**Option B: Smart Event Navigation** (Index.tsx:200-216)
- Non-authenticated users see SmartEventNavigation component
- Authenticated users see PersonalizedDashboard

**Issues:**
- ❌ Different experience for logged in/out users not explained
- ✅ Good: Personalization for authenticated users

---

#### **Step 3: View Event Card**

**Event Cards Show** (AllInclusiveDashboard component):
- Event image
- Event title
- Date/time
- Location
- Category badge
- Price (if available)
- "AI Enhanced" badge (if enhanced)

**Interaction:**
- User clicks card
- Opens event details dialog (Index.tsx:327-411)

**Issues:**
- ✅ Good: Clear information hierarchy
- ✅ Good: Visual badges for quick scanning
- ❌ No "Save for Later" on card
- ❌ No quick share option on card
- ❌ No indication if event is sold out or requires tickets

---

#### **Step 4: Event Details Dialog**

**What User Sees:**
1. Event title
2. Event image (if available)
3. Date/time (formatted: "Friday, November 8, 2024 at 7:00 PM")
4. Location with map pin icon
5. Venue name
6. Price
7. Description (AI-enhanced or original)
8. "AI Enhanced" badge if applicable
9. "View Original Event" button (opens source URL in new window)

**Issues:**
- ✅ Good: Clean, readable layout
- ✅ Good: Links to original event page
- ❌ No "Add to Calendar" button
- ❌ No "Share" button in dialog
- ❌ No "Save" or "Favorite" option
- ❌ No related events shown
- ❌ No map embed for location
- ❌ No ticket purchase flow (always external)
- ❌ Image errors just hide image, no fallback

**Missing Features:**
- Share functionality
- Save to favorites
- Add to calendar (ICS export)
- See similar events
- RSVP or check-in
- See who's going (social proof)

---

### Flow 2: Dedicated Event Page Journey

#### **Step 1: Event Details Page** (`/events/:slug` - EventDetails.tsx)

**Full Page Experience:**
1. Header navigation
2. Breadcrumb: Home / Events / [Event Title] (EventDetails.tsx:217-227)
3. Main content (2-column layout):
   - **Left Column:**
     - Event header with badges (Upcoming/Past, Category, Featured, AI Enhanced)
     - Share button
     - Event image
     - Event details grid (date, location, venue, price)
     - Description section
     - "View Original Event" button
     - AI Writeup section (if available)
     - Event Check-in component
     - Photo upload component
     - Rating and review system

   - **Right Sidebar:**
     - Quick Info card
     - Actions card (Visit Official Page, Share, Back to Events)

**Good Elements:**
- ✅ Excellent: Comprehensive event information
- ✅ Share functionality included
- ✅ Breadcrumb navigation
- ✅ Social features (check-in, photos, reviews)
- ✅ Structured data for SEO (EventDetails.tsx:109-193)
- ✅ Responsive layout

**Issues:**
- ❌ No "Add to Calendar" button (major missing feature)
- ❌ Photo upload requires authentication but no prompt to login
- ❌ Check-in feature not explained to first-time users
- ❌ No indication of how many people have checked in
- ❌ No weather forecast for outdoor events
- ❌ No parking information
- ❌ No accessibility information
- ❌ No age restrictions shown
- ❌ Past events show same actions as upcoming events (should be different)

**Missing Confirmations:**
- After check-in: Confirmation shown? (would need to check EventCheckIn component)
- After photo upload: Success feedback? (would need to check EventPhotoUpload)
- After leaving review: Thank you message?

---

### Flow 3: Time-Based Event Discovery

#### **Events Today** (`/events/today` - EventsToday.tsx)
#### **Events This Weekend** (`/events/this-weekend` - EventsThisWeekend.tsx)

**Purpose:** SEO-optimized pages for common queries

**What's Good:**
- ✅ Direct answer to user intent
- ✅ Time-filtered content
- ✅ SEO optimized

**Potential Issues:**
- ❌ May show empty state if no events match
- ❌ No clear update frequency stated
- ❌ No option to view next week/month

---

### Complete Event Discovery Journey Map

```
Homepage → Hero + Stats
  ↓
Search Bar OR Browse Events
  ↓
[SEARCH PATH]                [BROWSE PATH]
Search query                 Scroll to events
  ↓                            ↓
Results (broken!)            Event cards shown
  ↓                            ↓
No filtering happens         Click card
  ↓                            ↓
User confused               Event dialog opens
  ↓                            ↓
Gives up                    Read details
                              ↓
                           View Original Event (external)
                              ↓
                           User leaves site ← FRICTION: Lost user

[BETTER PATH]
Homepage → Time-based link (/events/today)
  ↓
Filtered events shown
  ↓
Click event card
  ↓
Full event page (/events/:slug)
  ↓
Comprehensive info + social features
  ↓
External link to tickets OR
Check-in + Save ← FRICTION: Features not obvious to new users
```

---

### Event Discovery Improvements

#### Critical Fixes
1. **Fix search functionality** - Currently doesn't filter (Index.tsx:85)
   - Implement actual search/filter logic
   - Show results count
   - Provide "no results" state with suggestions

2. **Add "Add to Calendar" button** on event pages
   - Generate ICS file
   - Support Google Calendar, Apple Calendar, Outlook
   - Clear success confirmation

3. **Add "Save Event" functionality**
   - Heart icon on cards and detail pages
   - Save to user profile (requires login)
   - Show prompt for non-authenticated users
   - Visual indicator if already saved

4. **Improve event detail dialog**
   - Add share button
   - Add save button
   - Add calendar button
   - Show related events
   - Better image fallback

#### High Priority
1. **Add onboarding for social features**
   - Tooltip or modal explaining check-ins first time
   - Explain benefits of photo uploads
   - Show example reviews

2. **Add filters and sorting** to event listings
   - Category filter
   - Date range
   - Price range
   - Location/proximity
   - Free vs. Paid
   - Indoor vs. Outdoor

3. **Add map view** for events
   - Show events on interactive map
   - Cluster markers by location
   - Click marker to see event details

4. **Improve "Past Events" UX**
   - Different actions (no ticket link)
   - Show "Add Review" CTA
   - Show photos from attendees
   - "See similar upcoming events"

#### Medium Priority
1. Add weather forecast for outdoor events
2. Add parking information
3. Add accessibility details
4. Add age restrictions
5. Add ticket availability status
6. Add countdown timer for upcoming events
7. Add "Going" / "Interested" buttons with counts

---

### 2.2 Restaurant Discovery Journey

#### User Goal
Find a good restaurant for dinner tonight in West Des Moines

---

#### **Step 1: Restaurant Page Landing** (`/restaurants` - Restaurants.tsx)

**What User Sees:**

1. **Hero Section** (Restaurants.tsx:149-183)
   - Gradient background (purple to red brand colors)
   - Title: "Discover Des Moines Dining"
   - Subtitle: "Find the best restaurants, local favorites, and new dining experiences"
   - Search bar with "Filters" button

2. **Restaurant Openings Section** (Restaurants.tsx:189)
   - Shows newly opened restaurants
   - Dedicated component for tracking new openings

3. **Filter Panel** (toggleable - Restaurants.tsx:192-212)
   - Cuisine types
   - Price range
   - Rating slider
   - Locations
   - Tags
   - Sort options: Popularity, Rating, Newest, Alphabetical, Price
   - "Open Now" checkbox
   - "Featured Only" checkbox

4. **Restaurant Grid** (Restaurants.tsx:298-356)
   - Cards with restaurant name, cuisine, rating, price
   - Click to view details

**Good Elements:**
- ✅ Excellent: New openings prominently featured
- ✅ Comprehensive filtering options
- ✅ Clear sorting options with descriptions
- ✅ Mobile-optimized
- ✅ Visual feedback (empty states)

**Issues:**
- ❌ "Open Now" filter doesn't show current open status on cards
- ❌ No quick view/hover preview
- ❌ No distance/proximity sorting (even though user selected location)
- ❌ Can't filter by dietary restrictions easily (no dedicated filter)
- ❌ Featured restaurants not visually prioritized enough
- ❌ No "New" badge on recently opened restaurants in main grid

---

#### **Step 2: Search and Filter**

**Search Behavior:** (Restaurants.tsx:68-70)
- User types in search bar
- Filters update in real-time
- Results count shown: "X restaurants found"

**Filter Behavior:**
- User clicks "Filters" button
- Panel expands (Restaurants.tsx:192)
- User selects options
- Results update automatically
- Can clear all filters (Restaurants.tsx:204)

**Issues:**
- ❌ Filter panel hidden by default (user may miss it)
- ❌ No filter chips showing active filters
- ❌ "Clear Filters" only appears in expanded panel
- ✅ Good: Real-time filtering
- ✅ Good: Results count shown

---

#### **Step 3: View Restaurant Card**

**Cards Show:** (Restaurants.tsx:299-354)
- Restaurant name
- "Featured" badge (if applicable)
- Cuisine type with chef hat icon
- Star rating (yellow stars)
- Price range ($ symbols in green)
- Description (3 lines max)
- Location with pin emoji

**Interaction:**
- Hover: Card scales up slightly (smooth animation)
- Click: Navigate to `/restaurants/:slug`

**Issues:**
- ❌ No "Reservations available" indicator
- ❌ No hours displayed ("Open Now" would be helpful)
- ❌ No distance shown (despite having location data)
- ❌ No quick actions (call, directions, save)
- ✅ Good: Clean, scannable design
- ✅ Good: Visual hierarchy (name, key info, description)

---

#### **Step 4: Restaurant Details Page**

**Note:** Would need to check RestaurantDetails.tsx to map this fully

**Expected Elements:**
- Full description
- Hours of operation
- Menu/cuisine details
- Photos
- Reviews
- Map with directions
- Contact information
- Reservation link

**Likely Issues (Based on Pattern):**
- May lack "Add to Favorites"
- May lack "Share" functionality
- Map integration unclear
- Menu integration unclear

---

### Complete Restaurant Discovery Journey Map

```
/restaurants → Hero + Search
  ↓
User types "Italian" + West Des Moines filter
  ↓
Results filtered (real-time) ← GOOD
  ↓
15 restaurants shown
  ↓
User clicks "Filters" button
  ↓
Selects $$ price range ← GOOD: Clear pricing
  ↓
Results update → 8 restaurants
  ↓
User hovers over restaurant card
  ↓
Card scales up ← GOOD: Visual feedback
  ↓
User clicks card
  ↓
Navigate to /restaurants/:slug
  ↓
[Restaurant details page - need to verify]
  ↓
User finds phone number to call ← FRICTION: May need to click external link
OR
User clicks Google Maps link ← FRICTION: Leaves site
```

---

### Restaurant Discovery Improvements

#### High Priority
1. **Add "Open Now" status on cards**
   - Green "Open" badge if currently open
   - Show closing time: "Open until 9 PM"
   - Red "Closed" badge if closed

2. **Add active filter chips** above results
   - Show selected filters as removable chips
   - Click chip to remove individual filter
   - "Clear All" button if multiple active

3. **Add distance/proximity information**
   - Show distance from user's saved location
   - "2.3 miles away" on each card
   - Sort by distance option

4. **Add quick actions to cards**
   - "Call" button with phone number
   - "Directions" button (opens maps)
   - "Reserve" button if available
   - Heart icon to save

5. **Improve new restaurant visibility**
   - Add "NEW" badge on restaurants opened in last 30 days
   - Make "New Openings" section more prominent

#### Medium Priority
1. Add dietary filters (vegetarian, vegan, gluten-free)
2. Add "View Menu" link on cards (if available)
3. Add reservation availability indicator
4. Add average wait time (if data available)
5. Add popular dishes
6. Add price per person (not just $-$$$$ scale)

---

### 2.3 Attraction Discovery Journey

#### Entry Point
- Homepage → "Attractions" in navigation
- `/attractions` page

**Expected Flow** (would need to check Attractions.tsx):
1. Land on attractions page
2. Browse featured attractions
3. Filter by category/type
4. View attraction details
5. Get directions / Plan visit

**Likely Similar to Events/Restaurants Pattern**

---

## 3. Business Advertising & Payment Journey

### User Goal
Business owner wants to advertise restaurant on Des Moines Insider

---

### Flow Steps

#### **Step 1: Discover Advertising** (`/advertise`)

**Entry Points:**
- Homepage footer / header link
- Direct URL from marketing
- `/business-partnership` page

**Page: Advertise.tsx**

---

#### **Step 1A: Authentication Check** (Advertise.tsx:97-115)

**Behavior:**
- Page loads
- Checks if user logged in
- If NOT logged in:
  - Shows "Login Required" card
  - "Please log in to create advertising campaigns"
  - Button: "Go to Login" → redirects to `/auth`

**Issues:**
- ❌ **Major friction:** Business user must create personal account first
- ❌ No "Sign up for business account" option
- ❌ No explanation of why login is required
- ❌ No preview of advertising options without login

**Improvement Needed:**
- Allow viewing advertising options without login
- Create separate business signup flow
- Or at minimum, explain "Create free account to continue"

---

#### **Step 1B: View Advertising Options** (Advertise.tsx:194-219)

**Hero Section:**
- Title: "Advertise with Des Moines Insider"
- Subtitle: "Reach thousands of locals looking for events, restaurants, and attractions"
- Social proof stats:
  - 50K+ Monthly Visitors
  - 15K+ Newsletter Subscribers
  - 95% Local Audience

**Issues:**
- ✅ Good: Clear value proposition
- ✅ Good: Social proof
- ❌ Stats may not be real-time (verify accuracy)
- ❌ No testimonials from current advertisers

---

#### **Step 2: Campaign Configuration** (Advertise.tsx:225-473)

**Left Column: Campaign Setup**

**Section A: Campaign Details** (Advertise.tsx:227-298)
1. **Campaign Name** - Text input, required
2. **Start Date** - Calendar picker, required
3. **End Date** - Calendar picker, required

**Issues:**
- ❌ No campaign name suggestions or examples
- ❌ Start date can be in past (no validation visible - Advertise.tsx:263)
- ❌ End date must be after start but no duration suggestion
- ✅ Good: Calendar popup is clean

---

**Section B: Ad Placements** (Advertise.tsx:300-405)

**3 Placement Types:**

1. **Top Banner** - $10/day (Advertise.tsx:19-38)
   - "Premium placement at the top of every page"
   - Features: Maximum visibility, Mobile & desktop, All pages
   - Asset Requirements:
     - Desktop: 728x90px or 970x250px
     - Mobile: 320x50px or 300x100px
     - Formats: JPG, PNG, WebP
     - Max Size: 2MB
     - Animation: Static images only
   - Design Guidelines:
     - High-resolution (300 DPI recommended)
     - Clear, readable text at small sizes
     - Strong call-to-action button
     - Brand logo prominently displayed

2. **Featured Spot** - $5/day (Advertise.tsx:40-60)
   - "Highlighted placement in search results and event listings"
   - Features: 1st or 2nd position, Event listings, High engagement
   - Asset Requirements:
     - Desktop: 300x250px or 336x280px
     - Mobile: 300x250px (responsive)
     - Max Size: 1.5MB
     - Animation: Static or subtle GIF (up to 5 seconds)
   - Design Guidelines:
     - Eye-catching visuals with local appeal
     - Clear business name and offering
     - High contrast for mobile
     - Include location or Des Moines reference

3. **Below the Fold** - $5/day (Advertise.tsx:61-81)
   - "Cost-effective placement integrated within content"
   - Features: Content integration, Targeted audience, Great value
   - Asset Requirements:
     - Desktop: 300x250px or 250x250px
     - Mobile: 300x250px (responsive)
     - Max Size: 1MB
     - Animation: Static preferred
   - Design Guidelines:
     - Native advertising style
     - Blend with editorial content
     - Focus on value proposition
     - Local Des Moines imagery encouraged

**Selection UI:**
- Each placement is a checkbox card
- Shows icon, name, price per day
- Shows description and feature badges
- Expandable to show asset requirements and guidelines ← **EXCELLENT**
- When selected:
  - Input field appears for number of days (1-365)
  - Shows calculated cost: "7 days × $10 = $70"

**Issues:**
- ✅ Excellent: Comprehensive asset requirements shown upfront
- ✅ Excellent: Design guidelines prevent submission errors
- ✅ Good: Visual hierarchy and clear pricing
- ❌ No preview of where ads will appear
- ❌ No example ads shown
- ❌ No indication of estimated impressions
- ❌ Can't select zero days (defaults to 7 but user might not notice)
- ❌ Very detailed info might be overwhelming for first-time advertisers

---

**Right Column: Campaign Summary** (Advertise.tsx:408-471)

**Sticky sidebar shows:**
- Campaign name (or "Not set")
- Start date (or "Not set")
- End date (or "Not set")
- Selected placements with days and cost breakdown
- **Total Cost** in large text
- "Create Campaign & Pay" button (disabled if incomplete)
- Helper text: "After payment, you'll be able to upload your creative assets and manage your campaign."

**Issues:**
- ✅ Excellent: Real-time cost calculation
- ✅ Good: Clear summary before payment
- ✅ Good: Disabled state prevents incomplete submissions
- ❌ No final cost confirmation modal
- ❌ Button text says "Create Campaign & Pay" but payment happens in Stripe popup
- ❌ No cancellation policy shown
- ❌ No refund policy mentioned
- ❌ No payment methods shown

---

#### **Step 3: Campaign Creation** (Advertise.tsx:140-175)

**Process:**
1. User clicks "Create Campaign & Pay"
2. Frontend validation:
   - Campaign name required
   - At least one placement selected
   - Start and end dates set
3. If validation fails:
   - Toast error: "Missing Information - Please fill in all required fields"
4. If validation passes:
   - Call `createCampaign()` hook (Advertise.tsx:151-159)
   - Create campaign in database with status: `draft`
   - Call `createCheckoutSession()` with campaign ID (Advertise.tsx:161)
   - Open Stripe Checkout in new tab (Advertise.tsx:162)
   - Toast success: "Campaign Created! Redirecting to payment..." (Advertise.tsx:164-167)

**Issues:**
- ❌ **Opens in new tab** - User might block popup
- ❌ No loading state during campaign creation (only button disabled)
- ❌ User left on `/advertise` page with new tab open (confusing)
- ❌ If Stripe tab closed, user doesn't know how to get back to payment
- ❌ No campaign draft saved accessible to user
- ❌ Error handling generic: "Failed to create campaign. Please try again."

---

#### **Step 4: Stripe Checkout** (External)

**Process:**
1. Stripe Checkout loads in new tab
2. User enters payment details
3. **Success Path:**
   - Stripe redirects to `/advertise/success?session_id=xxx`
4. **Cancel Path:**
   - Stripe redirects to `/advertise/cancel?campaign_id=xxx`

**Issues:**
- ❌ User can lose main tab context
- ❌ No estimate of checkout time
- ❌ Original tab still showing "Create Campaign" page

---

#### **Step 5A: Payment Success** (`/advertise/success` - AdvertiseSuccess.tsx)

**Process:**
1. Page loads with session_id parameter
2. Calls `verify-campaign-payment` Edge Function (AdvertiseSuccess.tsx:44-48)
3. Backend verifies payment with Stripe
4. Updates campaign status to `pending_creative`
5. Returns campaign details
6. Shows success page

**What User Sees:**
1. **Success Header** (AdvertiseSuccess.tsx:124-132)
   - Green checkmark icon
   - "Payment Successful!"
   - "Your campaign has been created and payment processed"

2. **Order Confirmation Card** (AdvertiseSuccess.tsx:135-168)
   - Order ID (first 8 chars of campaign ID)
   - Amount Paid
   - Start Date
   - End Date
   - Alert: "A confirmation email has been sent..."

3. **Next Steps Card** (AdvertiseSuccess.tsx:171-225)
   - **Step 1:** Upload Your Ad Creatives
     - Explanation of requirements
     - Button: "Upload Creatives Now" → `/campaigns/:id/creatives`
   - **Step 2:** Wait for Review
     - "1-2 business days"
     - Email notification when approved
   - **Step 3:** Campaign Goes Live
     - Auto-start on scheduled date
     - Track in dashboard

4. **Quick Action Cards** (AdvertiseSuccess.tsx:228-256)
   - "Upload Creatives" card with CTA
   - "Campaign Dashboard" card → `/campaigns`

5. **Support Section** (AdvertiseSuccess.tsx:259-275)
   - Email support link
   - Ad policies link

**Good Elements:**
- ✅ **Excellent:** Clear confirmation and next steps
- ✅ Order summary with all details
- ✅ Timeline expectations set (1-2 days review)
- ✅ Multiple paths forward (upload now or dashboard)
- ✅ Support options provided

**Issues:**
- ❌ No actual confirmation email verification (just says it was sent)
- ❌ "Upload Creatives Now" might be overwhelming immediately after payment
- ❌ No option to "Skip for now" or "Do this later"
- ❌ No estimate of how long creative upload takes
- ❌ Review process (1-2 days) might feel slow

---

#### **Step 5B: Payment Cancelled** (`/advertise/cancel` - AdvertiseCancel.tsx)

**What User Sees:**
1. Yellow warning icon
2. "Payment Cancelled"
3. "Your campaign payment was not completed"
4. **What Happened Card:**
   - Explanation: "Payment process was cancelled or interrupted"
   - Alert: "Campaign saved as draft"
   - Common reasons listed (back button, timeout, payment issue)
5. **Draft Campaign Card** (if campaign_id in URL):
   - Shows campaign ID
   - "Complete Payment" button
   - "View Campaign" button → `/campaigns`
6. **Action Cards:**
   - "Try Again" - retry payment
   - "Start Over" - new campaign at `/advertise`
7. **Help Section:**
   - Payment troubleshooting tips
   - Support contact options

**Good Elements:**
- ✅ **Excellent:** Reassuring tone (campaign saved)
- ✅ Multiple recovery paths
- ✅ Helpful troubleshooting info
- ✅ Not a dead end

**Issues:**
- ❌ "Complete Payment" button functionality unclear (does it reopen Stripe?)
- ❌ No way to edit draft campaign before retrying payment
- ❌ Draft campaign not easily accessible from campaigns dashboard

---

#### **Step 6: Upload Creatives** (`/campaigns/:id/creatives` - UploadCreatives.tsx)

**Page Layout:**

1. **Header** (UploadCreatives.tsx:134-158)
   - Back button → `/campaigns/:id`
   - Upload icon
   - "Upload Ad Creatives"
   - Campaign name displayed
   - Instructions: "Upload creative assets for each placement type"

2. **Status Banner** (UploadCreatives.tsx:161-167)
   - If status is `pending_payment`: Alert saying payment received

3. **Placement Tabs** (UploadCreatives.tsx:170-199)
   - Tab for each placement type in campaign
   - E.g., "Top Banner", "Featured Spot", "Below the Fold"
   - One upload form per placement

4. **CreativeUploadForm** per tab (UploadCreatives.tsx:189-193)
   - File upload for desktop creative
   - File upload for mobile creative
   - Destination URL input
   - Ad headline/copy
   - Call-to-action text
   - Submit button

5. **Help Section** (UploadCreatives.tsx:201-227)
   - Creative best practices
   - Review process timeline (1-2 business days)
   - Link to advertising policies

**Issues:**
- ❌ **No multi-file upload** - User must upload each placement separately
- ❌ No preview of uploaded creatives
- ❌ No validation before upload (file size, dimensions)
- ❌ Can't save as draft and finish later
- ❌ No progress indicator for upload
- ❌ Review process (1-2 days) repeated - user already saw on success page
- ✅ Good: Clear separation by placement type
- ✅ Good: Help section visible

---

#### **Step 7: Creative Review** (Admin Process)

**User Perspective:**
1. Uploads creatives
2. Waits for email notification
3. Timeline: 1-2 business days

**Issues:**
- ❌ No status page to check review progress
- ❌ No notification if creatives rejected (only email)
- ❌ No in-app notification system
- ❌ Can't see what reviewer is seeing

---

#### **Step 8: Campaign Goes Live**

**Expected:**
- Campaign status changes to `active` on start date
- Ads begin displaying
- User can view analytics

**Accessible via:**
- `/campaigns` - Campaign Dashboard (CampaignDashboard.tsx)
- `/campaigns/:id/analytics` - Campaign Analytics (CampaignAnalytics.tsx)

**CampaignDashboard.tsx shows:**
- List of all user's campaigns
- Campaign name with status badge
- Created date
- Total cost
- Duration (start - end dates)
- Placements count
- Creatives count
- "Manage Campaign" button
- "Upload Creatives" button (if pending)

**Issues:**
- ❌ No notification when campaign goes live
- ❌ No preview of how ads look on site
- ❌ Analytics page exists but UX not verified
- ✅ Good: Clear dashboard with status tracking

---

### Complete Business Advertising Journey Map

```
Business owner hears about advertising
  ↓
Visits /advertise
  ↓
NOT LOGGED IN → Blocked ← MAJOR FRICTION
  ↓
Redirected to /auth
  ↓
Creates personal account ← FRICTION: Not business-focused
  ↓
Verifies email
  ↓
Returns to /advertise
  ↓
NOW LOGGED IN ✓
  ↓
Reads advertising options ← GOOD: Clear value prop
  ↓
Fills campaign details (name, dates) ← GOOD: Simple
  ↓
Selects placements ← EXCELLENT: Clear requirements
  ↓
Sets duration per placement ← GOOD: Cost calculator
  ↓
Reviews summary ← GOOD: Clear total
  ↓
Clicks "Create Campaign & Pay" ← FRICTION: Popup blocker risk
  ↓
New tab opens with Stripe Checkout ← FRICTION: Context switch
  ↓
[CANCEL PATH]                    [SUCCESS PATH]
User closes tab                  Completes payment
  ↓                                ↓
/advertise/cancel              /advertise/success ← EXCELLENT PAGE
  ↓                                ↓
Sees draft saved               Clear next steps
  ↓                                ↓
Can retry payment              Clicks "Upload Creatives" ← FRICTION: Immediate action
  ↓                                ↓
OR abandons                    /campaigns/:id/creatives
                                  ↓
                               Uploads desktop creative
                                  ↓
                               Uploads mobile creative ← FRICTION: Separate uploads
                                  ↓
                               Fills destination URL
                                  ↓
                               Submits ← FRICTION: No preview
                                  ↓
                               Redirected to campaign page
                                  ↓
                               Waits 1-2 days ← FRICTION: Long wait
                                  ↓
                               Receives email (hopefully)
                                  ↓
                               Campaign goes live ← FRICTION: No notification
                                  ↓
                               Checks analytics
```

---

### Business Advertising Journey Improvements

#### Critical Fixes

1. **Allow viewing advertising page without login**
   - Show all pricing and options
   - Require login only at checkout
   - Add "Sign up to advertise" CTA with business account flow

2. **Create dedicated business signup flow**
   - Different from personal account
   - Collect business name, type, address
   - Set user role as "business"
   - Streamlined for business needs

3. **Fix Stripe Checkout tab issue**
   - Open Stripe in same tab (better UX)
   - OR use embedded Stripe Elements
   - OR show modal overlay instead of new tab
   - Add explicit "Processing..." state while waiting

4. **Add creative preview before submission**
   - Show how desktop creative will look
   - Show how mobile creative will look
   - Validate dimensions and file size before upload
   - Allow editing before final submit

5. **Add status tracking page**
   - Real-time status updates
   - "Creatives submitted - Under review"
   - Progress bar or timeline
   - Estimated completion date

6. **Add notification when campaign goes live**
   - Email notification
   - In-app notification
   - Dashboard alert
   - Link to live preview

#### High Priority

1. **Allow draft saving during creative upload**
   - "Save Draft" button
   - Auto-save functionality
   - Return later to complete

2. **Improve campaign dashboard**
   - Show preview of ads
   - Click to see where ads are displayed
   - Better analytics preview (impressions, clicks)
   - Pause/stop campaign controls

3. **Add ad preview examples** on /advertise page
   - Show sample ads in each placement
   - "Your ad will look like this"
   - Build confidence before purchase

4. **Streamline multi-placement upload**
   - Upload all creatives in one form
   - Bulk upload option
   - Copy settings across placements

5. **Add campaign editing**
   - Edit draft campaigns before payment
   - Extend campaign dates (pay difference)
   - Modify budget

6. **Improve review feedback**
   - If creatives rejected, show specific reasons
   - Allow resubmission without support ticket
   - Provide design tips

#### Medium Priority

1. Add estimated impressions on advertising page
2. Add advertiser testimonials
3. Add sample success stories
4. Add ROI calculator
5. Add analytics dashboard improvements (if not already good)
6. Add A/B testing for creatives
7. Add pause/resume campaign functionality
8. Add campaign renewal automation
9. Send performance reports via email (weekly/monthly)

---

## Summary of Critical Issues

### Signup & Onboarding
| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| No post-signup confirmation page | High | Confusion | Auth.tsx:154 |
| No email verification success page | High | Confusion | Missing route |
| No first-time user onboarding | High | Feature discovery | Index.tsx |
| Location not required but critical | Medium | Weak personalization | Auth.tsx:279-296 |
| Password requirements not shown | Medium | Failed signups | Auth.tsx:255-266 |
| No forgot password link | Medium | User frustration | Auth.tsx:188-216 |

### Event Discovery
| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| Search doesn't filter events | **Critical** | Broken core feature | Index.tsx:85 |
| No "Add to Calendar" button | High | Missed conversion | EventDetails.tsx |
| No "Save Event" functionality | High | Re-engagement | EventDetails.tsx |
| Event dialog missing key features | Medium | Poor UX | Index.tsx:327-411 |
| No active filter indication | Medium | Confusion | Restaurants.tsx |

### Restaurant Discovery
| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| No "Open Now" status on cards | High | Decision friction | Restaurants.tsx:299-354 |
| No active filter chips | Medium | Filter confusion | Restaurants.tsx |
| No distance information | Medium | Relevance | Restaurants.tsx |
| Filter panel hidden by default | Low | Feature discovery | Restaurants.tsx:192 |

### Business Advertising
| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| Advertising blocked without login | **Critical** | Conversion killer | Advertise.tsx:97-115 |
| Stripe opens in new tab | High | Popup blockers | Advertise.tsx:162 |
| No creative preview before submit | High | Submission errors | UploadCreatives.tsx |
| 1-2 day review with no status | High | Anxiety | UploadCreatives.tsx:218 |
| No business-specific signup | High | Poor targeting | Auth.tsx |
| No notification when live | Medium | Missed awareness | Missing |
| No multi-file upload | Medium | Tedious process | UploadCreatives.tsx |

---

## Priority Ranking for Improvements

### Must Fix (Blocking/Breaking Issues)
1. **Fix event search functionality** - Currently doesn't work
2. **Allow viewing /advertise without login** - Blocking business conversions
3. **Fix Stripe popup UX** - Same-tab or embedded checkout
4. **Add post-signup confirmation flow** - Users confused after signup

### Should Fix (High Impact)
1. Add "Add to Calendar" for events
2. Add "Save/Favorite" for events and restaurants
3. Add creative preview before upload
4. Add campaign status tracking
5. Add "Open Now" status for restaurants
6. Create business signup flow
7. Add first-time user onboarding

### Nice to Have (Enhancement)
1. Add distance/proximity to restaurants
2. Add active filter chips
3. Add multi-file upload for ads
4. Add weather for outdoor events
5. Add maps integration
6. Add social proof (going/interested counts)

---

## Conclusion

The Des Moines Insider platform has a solid foundation with comprehensive features, but suffers from several critical UX issues:

1. **Onboarding lacks clarity** - Users complete signup but don't understand next steps
2. **Search is broken** - Core discovery feature doesn't function
3. **Business flow has high friction** - Login wall and popup payments create barriers
4. **Missing key features** - Save, calendar, status tracking needed
5. **Good elements** - Comprehensive data, SEO optimization, clean design, social features

**Recommended Focus:**
- Fix broken search (critical bug)
- Improve business advertising flow (revenue impact)
- Add save/calendar features (engagement)
- Polish onboarding experience (retention)

This comprehensive journey mapping reveals that while the site has excellent content and features, the user flows need refinement to reduce friction and improve conversion at key decision points.
