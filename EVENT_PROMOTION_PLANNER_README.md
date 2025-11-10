# Event Promotion Timeline Generator

## Overview

A free lead magnet mini-tool for DesMoinesInsider.com that converts event-seekers and venues into users by providing a customized 8-week event promotion timeline.

**Live URL:** `/tools/event-promotion-planner`

## The Problem It Solves

Event organizers and venues don't know:
- When to start promoting (too early = fatigue, too late = poor attendance)
- What channels to use for maximum reach
- What content to post at each stage
- How to allocate limited budgets effectively

This tool provides a customized promotional roadmap that solves all these problems.

## Features

### 🎯 User Inputs (5-Step Wizard)
1. **Event Type** - Concert, Festival, Fundraiser, Sports, Community, Business, Family
2. **Event Date** - Date picker (validates future dates)
3. **Expected Attendance** - Slider: 25, 50, 100, 250, 500, 1000, 5000+
4. **Promotion Budget** - $0, $0-$100, $100-$500, $500-$1000, $1000+
5. **Social Media Following** - 0-500, 500-2K, 2K-10K, 10K+

### 📊 Instant Results
- **Week-by-week timeline** (8 weeks to event day)
- **Channel recommendations** with reasoning
- **Content ideas** for each promotional phase
- **Budget allocation** suggestions
- **Posting frequency** guidelines
- **Milestone checkpoints** for ticket sales
- **Day-of promotion** tactics

### 🎨 Visualizations
- Interactive timeline with expandable weeks
- Task checklist (saved to localStorage)
- Budget allocation pie chart
- Channel priority bar chart
- Weekly task distribution chart
- Calendar grid view

### 🔒 Lead Capture Strategy

**FREE (No Email):**
- 4-week basic timeline visible
- Generic promotional ideas
- Results disappear on page close

**EMAIL UNLOCK:**
- Full 8-week detailed timeline
- Downloadable PDF playbook (professional, branded)
- Week-by-week email reminders
- Content templates library
- Budget tracking spreadsheet
- Post-event follow-up checklist

### 📧 7-Day Email Nurture Sequence

1. **Day 0** - Welcome + Critical first step (create hashtag)
2. **Day 1** - Channel focus (email marketing for events)
3. **Day 2** - Best posting times for Des Moines
4. **Day 3** - Case study (local success story)
5. **Day 5** - Milestone check-in (are you on track?)
6. **Day 6** - Free vs paid promotion ROI
7. **Day 7** - Final call to list event

Each email includes CTAs to list events on DesMoinesInsider.com.

## Technical Architecture

### Tech Stack
- **Frontend:** React 18 + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **Date Handling:** date-fns
- **Charts:** Recharts
- **PDF Generation:** jsPDF
- **State Management:** React hooks + localStorage
- **Database:** Supabase PostgreSQL
- **Email:** Resend API (or SendGrid/Mailgun)
- **Analytics:** Custom tracking + Google Analytics 4

### Project Structure

```
src/
├── pages/
│   └── EventPromotionPlanner.tsx          # Main page component
├── components/
│   └── event-promotion-planner/
│       ├── WizardForm.tsx                 # 5-step form wizard
│       ├── TimelineView.tsx               # Timeline visualization
│       ├── ChartsView.tsx                 # Budget/channel charts
│       ├── EmailCaptureModal.tsx          # Email capture modal
│       └── SocialShare.tsx                # Social sharing component
├── lib/
│   ├── timeline-generator.ts              # Core timeline logic
│   ├── pdf-generator.ts                   # PDF playbook generation
│   ├── email-integration.ts               # Email capture & sequences
│   └── analytics-tracker.ts               # Analytics tracking
└── types/
    └── event-promotion.ts                 # TypeScript interfaces
```

### Database Schema

See `supabase/migrations/event_promotion_planner_schema.sql` for complete schema.

**Tables:**
- `event_promotion_email_captures` - Email captures with event details
- `event_promotion_referrals` - Referral tracking
- `event_promotion_analytics` - User interaction events
- `event_promotion_task_completions` - Completed tasks tracking
- `event_promotion_email_sequences` - Email sequence management

## Implementation Details

### Timeline Generation Algorithm

The `generatePromotionTimeline()` function creates customized timelines based on:

1. **Event Type** - Adjusts channel priorities (e.g., community events prioritize partnerships)
2. **Budget** - Recommends free vs paid strategies
3. **Attendance Size** - Scales promotional intensity
4. **Social Following** - Tailors social media tactics

Each week includes:
- 3-5 specific tasks with descriptions
- Estimated time requirements
- Channel assignments
- Priority levels
- Ticket sales goals

### PDF Playbook Generation

Professional, branded PDFs include:
- Cover page with event details
- Table of contents
- Week-by-week task breakdowns with checkboxes
- Budget allocation guide with visual bars
- Channel recommendations with reasoning
- Post-event checklist
- CTA to list on DesMoinesInsider.com

### Email Capture Flow

1. User completes wizard → Sees 4-week preview
2. After 10 seconds → Email capture modal appears
3. User enters email → Full timeline unlocks
4. PDF auto-downloads
5. Referral code generated
6. Welcome email sent immediately
7. 7-day sequence begins

### Analytics Tracking

**Events Tracked:**
- `tool_started` - User lands on page
- `wizard_step_completed` - Each form step
- `timeline_generated` - Timeline created
- `email_captured` - Email submitted
- `pdf_downloaded` - PDF generated
- `timeline_task_checked` - Task completed
- `social_shared` - Share button clicked
- `listing_clicked` - CTA clicked
- `referral_generated` - Referral code created

Data stored locally and sent to backend API for aggregation.

### Viral Growth Mechanics

**Social Sharing:**
- Pre-populated share messages
- One-click sharing to Twitter, Facebook, LinkedIn
- Copy link functionality
- Instagram story templates

**Referral Program:**
- Unique referral code for each user
- 20% off featured listings for both referrer and referee
- Referral tracking dashboard
- Leaderboard (future)

## Setup Instructions

### 1. Install Dependencies

Already installed via npm during setup.

### 2. Database Setup

Run the migration:
```bash
psql -h [your-supabase-host] -U postgres -d postgres -f supabase/migrations/event_promotion_planner_schema.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `event_promotion_planner_schema.sql`
3. Run query

### 3. Environment Variables

Add to `.env`:
```
VITE_RESEND_API_KEY=your_resend_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Email Service Setup

**Option A: Resend (Recommended)**
1. Sign up at https://resend.com
2. Verify your domain
3. Add API key to `.env`

**Option B: SendGrid/Mailgun**
1. Update `email-integration.ts` with your provider's API
2. Configure SMTP or API credentials

### 5. Email Templates

Create email templates in your email service matching the template IDs in `EMAIL_TEMPLATES`.

### 6. Cron Job for Email Sequences

Set up a daily cron job to send scheduled emails:

```typescript
// Example using Supabase Edge Functions
import { getPendingEmails, sendEmail } from './email-integration';

Deno.serve(async (req) => {
  const pending = await getPendingEmails();

  for (const email of pending) {
    await sendEmail({
      to: email.email,
      subject: EMAIL_TEMPLATES[email.email_type].subject,
      html: EMAIL_TEMPLATES[email.email_type].getHtml(email.data),
    });
  }

  return new Response('OK');
});
```

Schedule via Supabase Dashboard → Edge Functions → Add Cron Trigger (daily at 9am).

## SEO Strategy

### Keywords Targeted
- event promotion timeline
- how to promote an event
- event marketing checklist
- des moines event promotion
- event planning calendar free

### On-Page SEO
- **Title:** "Free Event Promotion Timeline Generator | DesMoinesInsider.com"
- **Meta Description:** "Generate a custom 8-week event promotion plan in 2 minutes. Free tool for Des Moines event organizers."
- **H1:** "Event Promotion Timeline Generator"
- **Schema Markup:** HowTo + SoftwareApplication
- **Internal Links:** From blog posts and event planning guides

### Content Marketing
- Blog post: "The Complete Event Promotion Timeline (With Free Tool)"
- Video: "How to Fill Your Event Using This Timeline"
- Guest posts on Des Moines business blogs
- Local media outreach

## Launch Strategy

### Week 1 - Local Outreach
- Email all venues on DesMoinesInsider
- Post in Des Moines Facebook groups
- Share with Chamber of Commerce
- Contact event coordinators

### Week 2 - Content Blitz
- Publish blog and video
- Reddit r/desmoines
- Nextdoor posts
- LinkedIn targeting business leaders

### Week 3 - Partnership Development
- Partner with event planning companies
- Cross-promote with venues
- Iowa tourism board collaboration
- Sponsor event planning workshop

### Week 4 - Paid Promotion
- Facebook ads targeting event planners
- Instagram ads with visuals
- Google Ads on keywords
- Boosted posts

## Success Metrics

**Track Weekly:**
- Tool users (Goal: 100/week after month 1)
- Email capture rate (Goal: 40%+)
- PDF downloads
- Tool-to-listing conversion (Goal: 10%+)
- Email open rates (Goal: 45%+)
- Email-to-listing conversion (Goal: 15%+)
- Social shares per user
- Referral conversion rate

**Optimize For:**
- Higher capture rates (A/B test modal timing)
- Better tool-to-listing conversion (improve CTAs)
- More social sharing (better incentives)
- Stronger referral program (increase rewards)

## A/B Testing Opportunities

1. **Email Capture Timing**
   - A: After 4-week preview
   - B: After complete view
   - C: Before showing timeline

2. **PDF Cover Design**
   - A: Generic guide
   - B: Personalized with event type
   - C: Des Moines-specific branding

3. **Listing CTA Text**
   - A: "List Your Event Free"
   - B: "Reach 50K+ Des Moines Locals"
   - C: "Get More Attendees"

4. **Email Sequence Length**
   - A: 7 emails
   - B: 4 emails
   - C: 10 emails with countdown

## Maintenance & Updates

### Regular Tasks
- Review analytics weekly
- Update success stories monthly
- Refresh email templates quarterly
- Add new event types as needed
- Update local statistics (50K+ subscribers, etc.)

### Seasonal Updates
- Iowa State Fair promotion (summer)
- Holiday events focus (November-December)
- Spring festival season (March-May)

## Future Enhancements

1. **User Accounts** - Save multiple timelines
2. **Team Collaboration** - Share with team members
3. **Calendar Export** - Add to Google/Apple Calendar
4. **SMS Reminders** - Text message alerts
5. **Integration** - Connect to social schedulers
6. **AI Personalization** - ML-based recommendations
7. **Gamification** - Badges for completed tasks
8. **Community Features** - Share timelines publicly

## Support & Questions

For questions or issues:
- Email: dev@desmoinesinsider.com
- GitHub Issues: [Create issue]
- Documentation: This README

## License

Proprietary - DesMoinesInsider.com
All rights reserved.

---

**Built with ❤️ for Des Moines event organizers**
