# Self-Service Advertising Platform - Complete Design Specification

## Executive Summary

Transform the Des Moines AI Pulse advertising module into a comprehensive self-service platform where advertisers can independently create, purchase, manage, and analyze their advertising campaigns - similar to USA Today's ad platform or Facebook Ads Manager.

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ADVERTISER PORTAL                         │
├─────────────────────────────────────────────────────────────┤
│  • Campaign Creation Wizard                                  │
│  • Creative Upload Studio                                    │
│  • Payment & Checkout                                        │
│  • Analytics Dashboard                                       │
│  • Team Management                                           │
│  • Renewal & Repurchase System                              │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN PANEL                              │
├─────────────────────────────────────────────────────────────┤
│  • Campaign Review & Approval                                │
│  • Creative Moderation                                       │
│  • Pricing Override Controls                                 │
│  • Refund Management                                         │
│  • Policy Enforcement                                        │
│  • System Analytics                                          │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   CORE SYSTEMS                               │
├─────────────────────────────────────────────────────────────┤
│  • Dynamic Pricing Engine                                    │
│  • Ad Serving & Rotation                                     │
│  • Impression/Click Tracking                                 │
│  • Payment Processing (Stripe)                               │
│  • File Storage (Supabase Storage)                          │
│  • Email Notifications                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. DATABASE SCHEMA ENHANCEMENTS

### New Tables Required

#### `pricing_rules`
```sql
- id: uuid (primary key)
- placement_type: text (top_banner, featured_spot, below_fold)
- base_price: decimal (base daily rate)
- traffic_multiplier: decimal (1.0 = normal, 1.5 = 50% increase)
- demand_multiplier: decimal (dynamic based on inventory)
- min_price: decimal (floor price)
- max_price: decimal (ceiling price)
- is_active: boolean
- created_at: timestamp
- updated_at: timestamp
```

#### `pricing_overrides`
```sql
- id: uuid (primary key)
- campaign_id: uuid (foreign key)
- admin_user_id: uuid (foreign key to auth.users)
- original_price: decimal
- override_price: decimal
- reason: text
- created_at: timestamp
- expires_at: timestamp (optional)
```

#### `campaign_team_members`
```sql
- id: uuid (primary key)
- campaign_owner_id: uuid (foreign key to auth.users)
- team_member_email: text
- team_member_id: uuid (foreign key to auth.users, nullable)
- role: text (viewer, editor, admin)
- invitation_status: text (pending, accepted, declined)
- invited_at: timestamp
- accepted_at: timestamp
```

#### `ad_impressions`
```sql
- id: uuid (primary key)
- campaign_id: uuid (foreign key)
- creative_id: uuid (foreign key)
- placement_type: text
- user_id: uuid (nullable - if logged in)
- session_id: text (for anonymous tracking)
- ip_address: text (hashed for privacy)
- user_agent: text
- page_url: text (where ad was shown)
- timestamp: timestamp
- date: date (for aggregation)
```

#### `ad_clicks`
```sql
- id: uuid (primary key)
- impression_id: uuid (foreign key to ad_impressions)
- campaign_id: uuid (foreign key)
- creative_id: uuid (foreign key)
- timestamp: timestamp
- date: date (for aggregation)
```

#### `campaign_analytics_daily`
```sql
- id: uuid (primary key)
- campaign_id: uuid (foreign key)
- creative_id: uuid (foreign key)
- date: date
- impressions: integer
- clicks: integer
- ctr: decimal (click-through rate)
- cost: decimal (daily spend)
- unique_viewers: integer
```

#### `refunds`
```sql
- id: uuid (primary key)
- campaign_id: uuid (foreign key)
- admin_user_id: uuid (foreign key)
- amount: decimal
- reason: text
- policy_violation: text (nullable)
- stripe_refund_id: text
- status: text (pending, completed, failed)
- created_at: timestamp
- processed_at: timestamp
```

#### `ad_policies`
```sql
- id: uuid (primary key)
- policy_name: text
- policy_description: text
- violation_severity: text (minor, major, critical)
- is_active: boolean
- created_at: timestamp
```

#### `policy_violations`
```sql
- id: uuid (primary key)
- campaign_id: uuid (foreign key)
- creative_id: uuid (foreign key)
- policy_id: uuid (foreign key)
- reported_by: uuid (admin user_id)
- violation_details: text
- action_taken: text (warning, suspension, refund)
- created_at: timestamp
```

### Enhanced Existing Tables

#### `campaigns` (add columns)
```sql
- renewal_eligible: boolean (default true)
- auto_renew: boolean (default false)
- original_campaign_id: uuid (nullable, for renewals)
- traffic_tier: text (low, medium, high, peak)
- approval_notes: text (admin notes)
- rejected_reason: text (if status = rejected)
```

#### `campaign_creatives` (add columns)
```sql
- file_size: bigint (bytes)
- file_type: text (image/jpeg, image/png, etc.)
- dimensions_width: integer
- dimensions_height: integer
- reviewed_by: uuid (admin user_id)
- reviewed_at: timestamp
- rejection_reason: text
```

---

## 3. DYNAMIC PRICING ENGINE

### Pricing Factors

1. **Base Price** (per placement type)
   - Top Banner: $10/day (baseline)
   - Featured Spot: $5/day (baseline)
   - Below the Fold: $5/day (baseline)

2. **Traffic Multiplier** (automated)
   - Low traffic (0-1000 daily visitors): 1.0x
   - Medium traffic (1001-5000 daily visitors): 1.2x
   - High traffic (5001-15000 daily visitors): 1.5x
   - Peak traffic (15000+ daily visitors): 2.0x
   - Updated hourly based on actual site analytics

3. **Demand Multiplier** (automated)
   - Calculation: `available_slots / total_slots`
   - High availability (80%+ open): 1.0x
   - Medium availability (50-80% open): 1.3x
   - Low availability (20-50% open): 1.6x
   - Very low availability (<20% open): 2.0x
   - Updated when campaigns are created/cancelled

4. **Admin Override** (manual)
   - Admin can set custom price for specific campaigns
   - Use cases:
     - Promotional discounts
     - Partner/non-profit rates
     - VIP customer pricing
     - Bulk purchase discounts
   - Requires reason/notes
   - Can set expiration date

### Pricing Calculation Formula

```javascript
final_price = (base_price * traffic_multiplier * demand_multiplier)

// Apply admin override if exists
if (admin_override) {
  final_price = admin_override.price
}

// Apply min/max constraints
final_price = Math.max(min_price, Math.min(max_price, final_price))
```

### Implementation

- **Supabase Edge Function**: `calculate-campaign-pricing`
- **Scheduled Job**: Update traffic/demand multipliers every hour
- **Admin API**: `POST /api/admin/pricing/override`
- **Public API**: `GET /api/pricing/current` (shows current rates)

---

## 4. CREATIVE UPLOAD SYSTEM

### Supported Ad Formats & Specifications

#### Top Banner
- **Dimensions**: 970x90px (desktop), 320x50px (mobile)
- **Formats**: JPEG, PNG, WebP, GIF (non-animated)
- **Max File Size**: 500KB
- **Aspect Ratio**: ~10.8:1
- **Safe Zone**: Keep text/logos 10% from edges

#### Featured Spot
- **Dimensions**: 300x250px (square), 336x280px (large rectangle)
- **Formats**: JPEG, PNG, WebP, GIF (non-animated)
- **Max File Size**: 300KB
- **Aspect Ratio**: 1:1 or 6:5
- **Safe Zone**: Keep text/logos 5% from edges

#### Below the Fold
- **Dimensions**: 728x90px (leaderboard), 320x50px (mobile)
- **Formats**: JPEG, PNG, WebP, GIF (non-animated)
- **Max File Size**: 400KB
- **Aspect Ratio**: 8:1
- **Safe Zone**: Keep text/logos 10% from edges

### Upload Process

1. **File Selection**
   - Drag-and-drop interface
   - Multiple file upload
   - Preview before upload

2. **Validation**
   - Dimension check (must match exactly)
   - File size check
   - Format check
   - Basic content scan (no prohibited content)

3. **Upload**
   - Upload to Supabase Storage bucket: `ad-creatives`
   - Path structure: `{campaign_id}/{placement_type}/{filename}`
   - Generate thumbnail
   - Extract metadata

4. **Form Completion**
   - Title (max 60 chars)
   - Description (max 150 chars)
   - Destination URL (must be valid HTTPS)
   - Call-to-Action text (max 20 chars)

5. **Review**
   - Preview how ad will appear
   - Edit details
   - Submit for approval

### Storage Policies

```sql
-- Allow authenticated users to upload to their campaign folders
CREATE POLICY "Users can upload to own campaigns"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ad-creatives' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM campaigns WHERE user_id = auth.uid()
  )
);

-- Allow users to read their own ad creatives
CREATE POLICY "Users can view own ad creatives"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ad-creatives' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM campaigns WHERE user_id = auth.uid()
  )
);

-- Allow public to read approved ads
CREATE POLICY "Public can view approved ads"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'ad-creatives' AND
  (storage.foldername(name))[1] IN (
    SELECT campaign_id::text FROM campaign_creatives WHERE is_approved = true
  )
);
```

---

## 5. ADMIN PANEL FEATURES

### Campaign Management Dashboard

**URL**: `/admin/campaigns`

**Features**:
- List all campaigns with filters (status, date range, user)
- Bulk actions (approve, reject, cancel)
- Search by campaign name, user email
- Sort by creation date, cost, status
- Export to CSV

**Campaign Details View** (`/admin/campaigns/:id`)
- Full campaign info
- User details
- Payment status
- Placements and costs
- All creatives with approval status
- Analytics summary
- Activity log

### Creative Review System

**URL**: `/admin/creatives/pending`

**Interface**:
```
┌─────────────────────────────────────────┐
│  Creative Preview                       │
│  [Large preview of ad]                  │
├─────────────────────────────────────────┤
│  Title: "Amazing AI Services"          │
│  Description: "Transform your..."       │
│  Link: https://example.com              │
│  CTA: "Learn More"                      │
├─────────────────────────────────────────┤
│  Campaign: "Q1 2025 Promotion"         │
│  Advertiser: john@example.com          │
│  Placement: Top Banner                  │
│  Dimensions: 970x90px ✓                 │
│  File Size: 342KB ✓                     │
├─────────────────────────────────────────┤
│  Policy Checks:                         │
│  ☑ No prohibited content               │
│  ☑ Valid destination URL                │
│  ☑ Appropriate content rating           │
├─────────────────────────────────────────┤
│  [Approve] [Reject] [Request Changes]  │
│                                         │
│  Rejection Reason (if rejecting):       │
│  [text area]                            │
└─────────────────────────────────────────┘
```

**Actions**:
- **Approve**: Set `is_approved = true`, notify advertiser
- **Reject**: Set status, add reason, notify advertiser, allow resubmission
- **Request Changes**: Send message to advertiser with specific requests

### Pricing Override Controls

**URL**: `/admin/pricing`

**Current Pricing Display**:
- Real-time pricing for each placement type
- Current traffic tier and multiplier
- Current demand and multiplier
- Number of active campaigns per placement

**Override Form**:
```
Campaign: [Select Campaign]
Current Price: $15.00/day
Override Price: [$ input]
Reason: [dropdown]
  - Promotional discount
  - Non-profit rate
  - Partner pricing
  - Bulk discount
  - Other (specify)
Notes: [text area]
Expires: [date picker] (optional)
[Apply Override]
```

### Refund Management

**URL**: `/admin/refunds`

**Refund Creation**:
```
Campaign: [Select Campaign]
Reason: [dropdown]
  - Policy violation
  - Technical issue
  - Advertiser request
  - Admin error
  - Other
Refund Amount: [$ input] (defaults to total paid)
Policy Violation: [Select Policy] (if applicable)
Notes: [text area]
Notify Advertiser: [checkbox] ✓
[Process Refund]
```

**Stripe Integration**:
- Automatic refund via Stripe API
- Full or partial refunds
- Updates campaign status to 'refunded'
- Sends confirmation email
- Logs in refunds table

### Policy Management

**URL**: `/admin/policies`

**Features**:
- Create/edit ad policies
- Define violation severity levels
- View violation history
- Generate policy compliance reports

**Default Policies**:
1. No deceptive/misleading claims
2. No prohibited products (tobacco, weapons, adult content)
3. No copyright infringement
4. No malware/phishing links
5. Must comply with FTC guidelines
6. Appropriate image quality
7. Functional destination URLs
8. No competitor targeting

---

## 6. ADVERTISER DASHBOARD

### Main Dashboard View

**URL**: `/campaigns` (enhanced)

**Sections**:

#### Overview Cards
```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Active Campaigns │ │ Total Impressions│ │  Total Spent     │
│       3          │ │     45,892       │ │    $450.00       │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Total Clicks    │ │   Avg CTR        │ │  Active Team     │
│     1,234        │ │    2.69%         │ │   5 members      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

#### Campaign List
- Tabbed view: All / Active / Completed / Draft
- Card or table view toggle
- Filters: date range, placement type, status
- Sort: newest, oldest, highest cost, best performance

#### Quick Actions
- [+ Create New Campaign]
- [Renew Past Campaign]
- [Invite Team Member]
- [View Analytics]

### Individual Campaign View

**URL**: `/campaigns/:id`

**Tabs**:

1. **Overview**
   - Campaign details (name, dates, status)
   - Placements and pricing
   - Total cost and payment status
   - Quick stats (impressions, clicks, CTR)

2. **Creatives**
   - All uploaded creatives
   - Approval status for each
   - Performance metrics per creative
   - [+ Upload New Creative] button
   - Edit/delete options

3. **Analytics** (detailed section below)

4. **Settings**
   - Edit campaign details (if draft)
   - Enable/disable auto-renew
   - Add team members
   - Cancel campaign

### Analytics Tab

**Date Range Selector**: Last 7 days / Last 30 days / Campaign lifetime / Custom range

**Performance Charts**:
- Impressions over time (line chart)
- Clicks over time (line chart)
- CTR trend (line chart)
- Hourly performance heatmap

**Metrics Table**:
```
Creative          | Impressions | Clicks | CTR   | Cost/Click
─────────────────────────────────────────────────────────────
Banner Ad #1      | 12,456     | 342    | 2.75% | $0.15
Featured Spot #1  | 8,932      | 234    | 2.62% | $0.09
Below Fold #1     | 24,504     | 558    | 2.28% | $0.04
```

**Demographic Insights** (if available):
- Top pages where ads appeared
- Device breakdown (desktop/mobile/tablet)
- Browser breakdown
- Geographic data (if IP geolocation enabled)

**Export Options**:
- Download CSV
- Download PDF report
- Email report

---

## 7. TEAM MANAGEMENT SYSTEM

### User Roles

1. **Owner**: Full control, can manage team, billing
2. **Admin**: Can edit campaigns, upload creatives, view analytics
3. **Editor**: Can upload creatives, edit content, limited settings access
4. **Viewer**: Read-only access to campaigns and analytics

### Team Management Interface

**URL**: `/campaigns/team`

**Features**:

#### Invite Team Members
```
Email Address: [input]
Role: [dropdown: Admin / Editor / Viewer]
Optional Message: [text area]
[Send Invitation]
```

#### Team Members List
```
Name/Email          | Role    | Status   | Last Active | Actions
──────────────────────────────────────────────────────────────
john@example.com    | Owner   | Active   | 2 hours ago | -
sarah@example.com   | Admin   | Active   | 1 day ago   | Edit | Remove
mike@example.com    | Editor  | Pending  | (invited)   | Resend | Cancel
```

#### Invitation Management
- Pending invitations shown separately
- Resend invitation email
- Cancel invitation
- Set expiration (7 days default)

### Access Control

**Database Function**: `check_campaign_access()`
```sql
-- Returns true if user has access to campaign
CREATE FUNCTION check_campaign_access(
  campaign_id uuid,
  user_id uuid,
  required_role text DEFAULT 'viewer'
) RETURNS boolean
```

**Row Level Security Policies**:
- Users can access campaigns they own
- Team members can access based on role
- Admins can access all campaigns

---

## 8. CHECKOUT & PAYMENT FLOW

### Enhanced Checkout Process

**Step 1: Campaign Summary** (`/campaigns/:id/checkout`)

```
Campaign: "Q1 2025 Promotion"
Duration: Jan 15 - Feb 14, 2025 (30 days)

Placements:
  ☑ Top Banner - 30 days × $12.00/day = $360.00
  ☑ Featured Spot - 30 days × $6.50/day = $195.00
                                  Subtotal: $555.00
                              Traffic Tier: High (+20%)
                                  Discount: -$55.50 (New Customer)
                                    ─────────────────
                                     Total: $499.50

Payment Method: [Existing Card ****1234] [+ Add New Card]

☑ I agree to the Advertising Terms of Service
☑ I confirm my ad content complies with Ad Policies

[Review Order] [Back to Campaign]
```

**Step 2: Stripe Checkout**
- Redirect to Stripe hosted checkout
- Pre-fill customer information
- Support credit/debit cards, ACH (if enabled)
- Save payment method for future use

**Step 3: Payment Processing**
- Webhook: `stripe.checkout.session.completed`
- Update campaign status to 'pending_creative'
- Send confirmation email
- Redirect to success page

### Success Page

**URL**: `/advertise/success?session_id={session_id}`

```
✓ Payment Successful!

Your campaign "Q1 2025 Promotion" has been created and paid.

Order #: CAMP-2025-001234
Amount Paid: $499.50
Payment Method: Visa ****1234

Next Steps:
1. Upload your ad creatives
2. Wait for admin review (usually 1-2 business days)
3. Your ads will go live on: Jan 15, 2025

[Upload Creatives Now] [View Campaign Dashboard]

Need help? Contact support@desmoinesaipulse.com
```

### Cancel Page

**URL**: `/advertise/cancel`

```
Payment Cancelled

Your campaign "Q1 2025 Promotion" has been saved as a draft.

You can complete your purchase anytime from your campaigns dashboard.

[Return to Dashboard] [Complete Purchase]
```

### Email Notifications

1. **Payment Confirmation**
   - Order details
   - Next steps
   - Upload instructions link

2. **Creative Uploaded**
   - Confirmation of upload
   - Expected review time

3. **Campaign Approved**
   - Campaign going live
   - How to track performance

4. **Campaign Started**
   - First day of campaign
   - Link to analytics

5. **Campaign Ending Soon**
   - 3 days before end
   - Renewal options

6. **Campaign Completed**
   - Final performance summary
   - Renewal/repurchase options

---

## 9. RENEWAL & REPURCHASE SYSTEM

### Auto-Renewal

**Settings in Campaign Dashboard**:
```
☑ Enable Auto-Renewal
Renewal Start Date: [Feb 15, 2025] (day after current ends)
Renewal Duration: [30 days] [dropdown]
Payment Method: [Visa ****1234] [Change]

Your campaign will automatically renew using the same creatives
and placements. You'll be charged 3 days before renewal.

[Save Settings]
```

**Process**:
1. Scheduled job checks for campaigns ending in 3 days with auto-renew enabled
2. Create new campaign linked to original (`original_campaign_id`)
3. Copy placements and approved creatives
4. Calculate current pricing (may differ from original)
5. Charge saved payment method via Stripe
6. Send renewal confirmation email
7. If payment fails: notify user, disable auto-renew, keep original campaign active until end

### Manual Renewal

**From Campaign Dashboard**:
```
Campaign: "Q1 2025 Promotion"
Status: Completed
Ended: Feb 14, 2025

Performance:
- 45,892 impressions
- 1,234 clicks
- 2.69% CTR

[Renew This Campaign]
```

**Renewal Flow**:
1. Click "Renew" → Prefills campaign form
2. All creatives pre-loaded (already approved)
3. Can modify dates, placements
4. Shows current pricing (may be different)
5. Checkout process
6. New campaign created, linked to original

### Repurchase

**Similar Campaign Feature**:
```
[Create Similar Campaign]

Creates new campaign with:
- Same placements
- Same creative templates (can modify)
- Same targeting (if applicable)
- New dates
- Current pricing
```

---

## 10. IMPRESSION & CLICK TRACKING

### Implementation

**Enhanced AdBanner Component**:
```typescript
const AdBanner = ({ placement }: { placement: PlacementType }) => {
  const [ad, setAd] = useState<Ad | null>(null)
  const [impressionLogged, setImpressionLogged] = useState(false)
  const adRef = useRef<HTMLDivElement>(null)

  // Fetch ad
  useEffect(() => {
    fetchActiveAd(placement).then(setAd)
  }, [placement])

  // Track impression when ad is visible
  useEffect(() => {
    if (!ad || impressionLogged) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Ad is at least 50% visible
            logImpression(ad.campaign_id, ad.creative_id, placement)
            setImpressionLogged(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.5 }
    )

    if (adRef.current) {
      observer.observe(adRef.current)
    }

    return () => observer.disconnect()
  }, [ad, impressionLogged])

  const handleClick = () => {
    if (!ad) return
    logClick(ad.campaign_id, ad.creative_id, placement)
    window.open(ad.link_url, '_blank')
  }

  // ... rest of component
}
```

### Tracking Functions

**logImpression()**:
```typescript
async function logImpression(
  campaignId: string,
  creativeId: string,
  placement: string
) {
  const sessionId = getOrCreateSessionId() // localStorage
  const { data } = await supabase.from('ad_impressions').insert({
    campaign_id: campaignId,
    creative_id: creativeId,
    placement_type: placement,
    session_id: sessionId,
    user_id: auth.user?.id || null,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    date: new Date().toISOString().split('T')[0]
  })
}
```

**logClick()**:
```typescript
async function logClick(
  campaignId: string,
  creativeId: string,
  placement: string
) {
  // Find most recent impression for this session
  const { data: impression } = await supabase
    .from('ad_impressions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('creative_id', creativeId)
    .eq('session_id', getSessionId())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  await supabase.from('ad_clicks').insert({
    impression_id: impression?.id,
    campaign_id: campaignId,
    creative_id: creativeId,
    date: new Date().toISOString().split('T')[0]
  })
}
```

### Analytics Aggregation

**Scheduled Job**: Run daily at 1 AM
```sql
-- Aggregate daily analytics
INSERT INTO campaign_analytics_daily (
  campaign_id,
  creative_id,
  date,
  impressions,
  clicks,
  ctr,
  cost,
  unique_viewers
)
SELECT
  campaign_id,
  creative_id,
  date,
  COUNT(*) as impressions,
  (SELECT COUNT(*) FROM ad_clicks WHERE ad_clicks.campaign_id = ad_impressions.campaign_id AND ad_clicks.date = ad_impressions.date) as clicks,
  CASE WHEN COUNT(*) > 0 THEN (clicks::decimal / COUNT(*)::decimal) * 100 ELSE 0 END as ctr,
  (SELECT daily_cost FROM campaign_placements WHERE campaign_placements.campaign_id = ad_impressions.campaign_id) as cost,
  COUNT(DISTINCT session_id) as unique_viewers
FROM ad_impressions
WHERE date = CURRENT_DATE - INTERVAL '1 day'
GROUP BY campaign_id, creative_id, date;
```

---

## 11. AD ROTATION & DISPLAY LOGIC

### Current Limitations
- Only displays one ad per placement
- Random selection with no frequency capping
- No A/B testing support
- Limited targeting

### Enhanced Ad Serving

**Rotation Strategies**:

1. **Even Rotation** (default)
   - Each approved creative gets equal impressions
   - Round-robin selection

2. **Optimized Rotation**
   - Favor creatives with higher CTR
   - Learns over time

3. **Weighted Rotation**
   - Admin/advertiser sets weight per creative
   - Higher weight = more impressions

**Frequency Capping**:
```typescript
// Don't show same ad to same user too often
const AD_FREQUENCY_CAP = {
  impressions_per_session: 3,
  impressions_per_day: 10,
  same_creative_min_interval: 300 // seconds
}
```

**Enhanced `get_active_ads()` Function**:
```sql
CREATE OR REPLACE FUNCTION get_active_ads(
  p_placement_type text,
  p_session_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  campaign_id uuid,
  creative_id uuid,
  title text,
  description text,
  image_url text,
  link_url text,
  cta_text text
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (cc.campaign_id)
    c.id as campaign_id,
    cc.id as creative_id,
    cc.title,
    cc.description,
    cc.image_url,
    cc.link_url,
    cc.cta_text
  FROM campaigns c
  JOIN campaign_placements cp ON cp.campaign_id = c.id
  JOIN campaign_creatives cc ON cc.campaign_id = c.id AND cc.placement_type = p_placement_type
  WHERE
    c.status = 'active'
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND cc.is_approved = true
    AND cp.placement_type = p_placement_type
    -- Frequency cap: not shown to this session in last 5 minutes
    AND (p_session_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM ad_impressions
      WHERE campaign_id = c.id
        AND session_id = p_session_id
        AND timestamp > NOW() - INTERVAL '5 minutes'
    ))
    -- Frequency cap: not shown to this user more than 10 times today
    AND (p_user_id IS NULL OR (
      SELECT COUNT(*) FROM ad_impressions
      WHERE campaign_id = c.id
        AND user_id = p_user_id
        AND date = CURRENT_DATE
    ) < 10)
  ORDER BY c.id, RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

### Ad Placement Expansion

**Current**: Only in FeaturedEvents component

**Proposed Placements**:

1. **Top Banner**: All pages, below header
2. **Featured Spot**: Homepage, Events, Resources pages (right sidebar)
3. **Below the Fold**: Homepage, Blog posts (after content)
4. **Newsletter Footer**: Email newsletters
5. **Search Results**: Above and below search results
6. **Category Pages**: AI Company directory, Education listings

---

## 12. POLICY ENFORCEMENT & REFUNDS

### Automated Content Screening

**On Upload**:
1. File scan for malware (ClamAV or VirusTotal API)
2. Image analysis for inappropriate content (AWS Rekognition or similar)
3. URL validation and safety check (Google Safe Browsing API)
4. Text analysis for prohibited keywords

**Flags for Manual Review**:
- Confidence score below threshold
- Potentially sensitive content detected
- First-time advertiser
- High-value campaign (>$500)

### Manual Review Process

**Admin Checklist**:
- [ ] Image quality acceptable
- [ ] Text readable and professional
- [ ] No misleading claims
- [ ] Destination URL works and matches ad
- [ ] No trademark violations
- [ ] Complies with FTC guidelines
- [ ] Appropriate for audience

**Review Actions**:
1. **Approve**: Creative goes live
2. **Reject**: Creative blocked, reason sent to advertiser
3. **Request Changes**: Specific feedback sent, resubmission allowed

### Violation Detection

**Ongoing Monitoring**:
- Scheduled checks of destination URLs (daily)
- User reports ("Report this ad" button)
- Automated CTR analysis (suspiciously low CTR may indicate issues)

### Refund Process

**Eligible Reasons**:
1. Policy violation by platform (our fault)
2. Technical issue preventing ad display
3. Admin approval error
4. Force majeure

**Non-Eligible Reasons**:
1. Advertiser policy violation
2. Poor campaign performance
3. Change of mind after approval
4. Advertiser error in creative content

**Partial Refunds**:
- Calculate days remaining
- Refund pro-rated amount
- Example: 30-day campaign, issue on day 10 → refund 20/30 of cost

**Refund Implementation**:
```typescript
async function processRefund(
  campaignId: string,
  reason: string,
  amount: number,
  adminId: string
) {
  // 1. Get campaign and payment details
  const campaign = await getCampaign(campaignId)

  // 2. Create refund in Stripe
  const stripeRefund = await stripe.refunds.create({
    payment_intent: campaign.stripe_payment_intent_id,
    amount: Math.round(amount * 100), // cents
    reason: 'requested_by_customer',
    metadata: {
      campaign_id: campaignId,
      admin_id: adminId,
      reason: reason
    }
  })

  // 3. Record in database
  await supabase.from('refunds').insert({
    campaign_id: campaignId,
    admin_user_id: adminId,
    amount: amount,
    reason: reason,
    stripe_refund_id: stripeRefund.id,
    status: 'completed',
    processed_at: new Date()
  })

  // 4. Update campaign status
  await supabase.from('campaigns')
    .update({ status: 'refunded' })
    .eq('id', campaignId)

  // 5. Send notification email
  await sendRefundNotification(campaign.user_id, amount, reason)
}
```

---

## 13. USER EXPERIENCE FLOW

### New Advertiser Journey

```
1. Browse Site → See "Advertise" button
   ↓
2. Click → Redirected to /advertise (campaign creation)
   ↓
3. Sign Up/Login (if not authenticated)
   ↓
4. Campaign Creation
   - Name campaign
   - Select dates
   - Choose placements (see pricing)
   - See total cost calculation
   ↓
5. Review & Checkout
   - Campaign summary
   - Enter payment info (Stripe)
   ↓
6. Payment Success
   - Confirmation screen
   - "Upload Creatives" CTA
   ↓
7. Upload Creatives
   - Drag-and-drop files
   - Fill in details (title, description, URL, CTA)
   - Preview
   - Submit for review
   ↓
8. Wait for Approval
   - Email notification when reviewed
   - Typically 1-2 business days
   ↓
9. Campaign Goes Live
   - Email notification
   - View in dashboard
   - Monitor analytics
   ↓
10. Campaign Ends
    - Performance summary email
    - Option to renew
```

### Returning Advertiser Journey

```
1. Login → Dashboard
   ↓
2. View Past Campaigns
   - See performance metrics
   - Identify successful campaigns
   ↓
3. Renew or Create Similar
   - One-click renewal with same creatives
   - Or modify and create new
   ↓
4. Quick Checkout
   - Saved payment method
   - Faster approval (trusted advertiser)
   ↓
5. Campaign Live
   - Compare to previous performance
   - Optimize based on insights
```

---

## 14. TECHNICAL IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema updates (new tables, columns)
- [ ] Supabase storage bucket for ad creatives
- [ ] Storage policies for access control
- [ ] Dynamic pricing engine
- [ ] Pricing override admin API

### Phase 2: Creative Upload System (Week 2-3)
- [ ] File upload component with validation
- [ ] Image dimension/size checker
- [ ] Creative form (title, description, URL, CTA)
- [ ] Preview interface
- [ ] Storage integration

### Phase 3: Admin Panel (Week 3-4)
- [ ] Campaign management dashboard
- [ ] Creative review interface
- [ ] Approval/rejection workflow
- [ ] Pricing override controls
- [ ] Refund management UI
- [ ] Policy management

### Phase 4: Advertiser Dashboard (Week 4-5)
- [ ] Enhanced campaign dashboard
- [ ] Individual campaign view with tabs
- [ ] Creative management interface
- [ ] Upload interface integration
- [ ] Campaign settings

### Phase 5: Analytics & Tracking (Week 5-6)
- [ ] Impression tracking (IntersectionObserver)
- [ ] Click tracking
- [ ] Session management
- [ ] Daily aggregation job
- [ ] Analytics dashboard UI
- [ ] Export functionality

### Phase 6: Team Management (Week 6)
- [ ] Team invitation system
- [ ] Role-based access control
- [ ] Team member management UI
- [ ] Access control policies
- [ ] Email invitations

### Phase 7: Checkout & Payments (Week 7)
- [ ] Enhanced checkout page
- [ ] Success/cancel pages
- [ ] Stripe webhook handlers
- [ ] Email notifications
- [ ] Saved payment methods

### Phase 8: Renewal & Repurchase (Week 7-8)
- [ ] Auto-renewal settings
- [ ] Scheduled renewal job
- [ ] Manual renewal flow
- [ ] Create similar campaign feature
- [ ] Renewal notifications

### Phase 9: Ad Serving & Rotation (Week 8-9)
- [ ] Enhanced get_active_ads() function
- [ ] Frequency capping logic
- [ ] Rotation strategy implementation
- [ ] Ad placement expansion across site
- [ ] Performance optimization

### Phase 10: Polish & Testing (Week 9-10)
- [ ] Policy enforcement automation
- [ ] Refund workflow testing
- [ ] End-to-end testing
- [ ] Performance testing
- [ ] Documentation
- [ ] User guides

---

## 15. ESTIMATED COSTS

### Development Time
- **Total**: 10 weeks (400 hours)
- **Rate**: Variable based on developer

### Third-Party Services

1. **Stripe**
   - Processing fee: 2.9% + $0.30 per transaction
   - Monthly fee: $0 (standard account)

2. **Supabase**
   - Storage: ~$0.021/GB/month
   - Bandwidth: ~$0.09/GB
   - Estimate: ~$20-50/month for ad storage

3. **Optional Services**
   - AWS Rekognition: $1.00 per 1,000 images (content moderation)
   - SendGrid/Mailgun: Email notifications ($0-15/month)
   - VirusTotal API: File scanning ($0-50/month)

### Infrastructure
- No additional servers required
- Leverage existing Supabase/Vercel setup

---

## 16. SUCCESS METRICS

### Platform Health
- Campaign creation completion rate
- Creative approval time (target: <24 hours)
- Payment success rate
- Refund rate (target: <5%)

### Advertiser Satisfaction
- Repeat advertiser rate
- Average campaigns per advertiser
- NPS (Net Promoter Score)
- Support ticket volume

### Business Metrics
- Total ad revenue
- Average campaign value
- Revenue per active campaign
- Month-over-month growth

### Technical Metrics
- Page load time with ads
- Ad viewability rate (>50% visible)
- Click tracking accuracy
- System uptime

---

## 17. COMPETITIVE ANALYSIS

### USA Today Advertising
- Self-service portal
- Multiple ad formats
- CPM-based pricing
- Detailed targeting
- Real-time analytics

### Facebook Ads Manager
- Auction-based pricing
- A/B testing built-in
- Advanced targeting
- Budget optimization
- Comprehensive analytics

### Our Differentiators
- Local Des Moines focus
- AI/tech industry targeting
- Lower barrier to entry
- Simpler pricing
- Community-focused

---

## 18. FUTURE ENHANCEMENTS (Post-Launch)

### Advanced Features
1. **A/B Testing**
   - Test multiple creatives
   - Automatic optimization

2. **Programmatic Advertising**
   - Real-time bidding
   - Header bidding integration
   - SSP/DSP connections

3. **Advanced Targeting**
   - Demographic targeting
   - Behavioral targeting
   - Retargeting pixels

4. **Video Ads**
   - In-stream video
   - Outstream video
   - Video analytics

5. **Native Advertising**
   - Sponsored content
   - In-feed ads
   - Content recommendations

6. **White-Label Solution**
   - Allow other publications to use platform
   - SaaS revenue model

---

## APPENDIX A: API Endpoints

### Public APIs
- `GET /api/pricing/current` - Get current pricing
- `GET /api/ads/:placement` - Get active ad for placement
- `POST /api/ads/impression` - Log impression
- `POST /api/ads/click` - Log click

### Authenticated APIs
- `POST /api/campaigns` - Create campaign
- `GET /api/campaigns` - List user's campaigns
- `GET /api/campaigns/:id` - Get campaign details
- `PATCH /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign
- `POST /api/campaigns/:id/checkout` - Create checkout session
- `POST /api/campaigns/:id/creatives` - Upload creative
- `GET /api/campaigns/:id/analytics` - Get analytics
- `POST /api/campaigns/:id/renew` - Renew campaign
- `POST /api/team/invite` - Invite team member
- `GET /api/team` - List team members

### Admin APIs
- `GET /api/admin/campaigns` - List all campaigns
- `POST /api/admin/creatives/:id/approve` - Approve creative
- `POST /api/admin/creatives/:id/reject` - Reject creative
- `POST /api/admin/pricing/override` - Set pricing override
- `POST /api/admin/refunds` - Process refund
- `GET /api/admin/analytics` - System-wide analytics
- `GET /api/admin/policies` - List policies
- `POST /api/admin/violations` - Report violation

---

## APPENDIX B: Email Templates

### Template List
1. Campaign payment confirmation
2. Creative upload confirmation
3. Creative approved notification
4. Creative rejected notification
5. Campaign going live notification
6. Campaign ending soon (3 days before)
7. Campaign completed summary
8. Auto-renewal confirmation
9. Auto-renewal failed
10. Team invitation
11. Refund processed
12. Policy violation warning

---

## APPENDIX C: Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_dates ON campaigns(start_date, end_date);
CREATE INDEX idx_campaign_creatives_approved ON campaign_creatives(is_approved);
CREATE INDEX idx_ad_impressions_campaign_date ON ad_impressions(campaign_id, date);
CREATE INDEX idx_ad_impressions_session ON ad_impressions(session_id, timestamp);
CREATE INDEX idx_ad_clicks_campaign_date ON ad_clicks(campaign_id, date);
CREATE INDEX idx_pricing_rules_placement ON pricing_rules(placement_type, is_active);
```

---

## CONCLUSION

This comprehensive design specification outlines a complete self-service advertising platform that rivals major publishers like USA Today and Facebook. The system prioritizes:

1. **Ease of Use**: Intuitive interfaces for advertisers
2. **Transparency**: Clear pricing, policies, and performance metrics
3. **Control**: Admin tools for management and moderation
4. **Scalability**: Architecture supports growth
5. **Revenue**: Multiple pricing models and upsell opportunities

Implementation will take approximately 10 weeks with a phased approach, allowing for iterative improvements and user feedback integration.