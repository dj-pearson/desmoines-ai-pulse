# Non-core platform review, 2026-09

Scope: self-service advertising, sign-up and tier benefits, AI cost and usage
limits, admin, email (moving to Amazon SES), promotions, affiliate links and
referrals. Six read-only audits on 2026-09-26 produced the findings below; this
file is the working checklist for branch
`claude/self-service-ads-platform-review-wjkw0y`.

Nothing here was probed against production (no Supabase credentials in the
session). Table existence comes from `scripts/db-snapshot.json` (2026-08-24)
and the migration ledger. Run `npm run check-schema:probe` before applying any
migration below.

Migration timestamps are reserved per work package so parallel branches do not
collide: AI `20261001*`, email `20261002*`, ads `20261003*`, sign-up
`20261004*`, admin `20261005*`, promotions/referrals `20261006*`.

## What was wrong, in one paragraph each

**AI cost.** The limiter, cost ledger (`provider_usage`), monthly budget and
kill switch exist, but only `runAgent()` honours the budget and kill switch.
The public endpoints (nlp-search, discover-chat, personalized-recommendations,
generate-itinerary) keep spending after the budget reads "paused", and there is
no daily cap anywhere. support-chat took unbounded input from anonymous callers
on Sonnet; search-new-hotels billed Google Places with no auth at all.

**Ads.** Pricing and checkout are server-side and sound. The gaps are around
them: a late Stripe webhook can move a live campaign back to
`pending_creative`; `get_active_ads` always serves the lowest-UUID campaign in
a placement; lifecycle notices (activated, expiring, completed) are counted and
never sent; a partial refund ends the campaign; checkout accepts start dates in
the past; the admin price override writes a number checkout ignores; the
refunds page reads a table that does not exist and sends a body the refund
function rejects. The column guards that stop an advertiser self-activating are
in `20260928000001-3`, which are marked "apply deferred".

**Sign-up and benefits.** Flow works. A free account saves the same 3
favorites a guest can, so the "create an account to save more" wall leads to a
paywall. The Terms page promises VIP benefits that do not exist. Resent
confirmation mail drops the callback route. Google sign-ups get no name.

**Email.** No SES code exists. 19 separate Resend call sites, two SendGrid
fallbacks. List-Unsubscribe is sent to Resend's API as an HTTP header instead
of on the message, so no marketing mail carries it. Bounces and complaints
suppress nobody. Campaign approve/reject mail is sent from the admin's browser.

**Promotions, affiliates, referrals.** Discounts are Stripe promotion codes
only (correct), but the paid amount and code are never recorded. Ticketmaster
affiliate links carry no disclosure or `rel="sponsored"`. The planner promises
"20% off" for referrals that nothing grants, and referral codes are
`btoa(email).substring(0,8)`, which leaks the first six characters of the
email. The admin affiliate toggle writes the admin's own localStorage.

**Admin.** Server-side admin checks are consistent, but `isAdminUserId` uses
`.maybeSingle()` on `user_roles` (a user with two role rows is denied), an
admin can demote a root_admin, and `security_audit_logs` accepts inserts from
anyone. System Controls shows `Math.random()` metrics. No admin view exists for
subscriptions, email delivery or AI spend by feature.

## Work packages

Status: `[x]` done on this branch, `[ ]` open, `[owner]` needs a decision or
an action only the owner can take.

### WP1 - AI cost and usage limits

- [x] support-chat: 2k/message and 12k/history caps, 15 req/15 min, lightweight model
- [x] search-new-hotels: admin or API key, clamp radius
- [x] validate-source-urls: admin or API key, clamp limit
- [ ] `ai_usage_daily` + `ai_quota_limits` + `ai_global_budget`, atomic `consume_ai_quota` / `settle_ai_usage` RPCs
- [ ] `_shared/aiQuota.ts` guard, honouring `provider_budgets.paused` and the global kill switch
- [ ] Guard nlp-search, discover-chat (atomic quota, VIP 200/day not unlimited), personalized-recommendations, generate-itinerary
- [ ] Record usage in the unrecorded callers
- [ ] Admin: AI spend by feature and today's global budget

### WP2 - Email on Amazon SES

- [ ] `_shared/awsSigV4.ts` + `_shared/email.ts` (SES v2 API), tested against AWS SigV4 vectors
- [ ] `email_log` and `email_suppressions` tables
- [ ] Repoint shared senders (nurture, campaign notifications, ops alerts) and fix List-Unsubscribe
- [ ] Repoint the remaining edge functions
- [ ] `ses-events` (SNS bounce/complaint → suppression) and `email-unsubscribe` (RFC 8058 one-click POST)
- [ ] `[auth]` SMTP block in `supabase/config.toml` for Supabase Auth mail through SES
- [ ] Missing transactional mail: subscription started/cancelled, admin new-campaign alert
- [owner] SES setup: see "Owner steps" below

### WP3 - Self-service ads

- [ ] Webhook: only advance `draft`/`pending_payment`, require `payment_status = 'paid'`
- [ ] `get_active_ads`: random eligible campaign, Central dates
- [ ] Checkout: reject start dates before today + lead time (Central)
- [ ] Refunds: cap at paid minus prior refunds, `refunded` only when full, notify advertiser; fix the admin refunds page
- [ ] Lifecycle cron sends activated / expiring / completed notices server-side
- [ ] `link_url` rendered through `toSafeExternalUrl`; DB CHECK for http(s)
- [ ] Sponsored-listing link guard (draft only, one per placement)
- [ ] Remove the client price override (it never reached checkout)
- [ ] Admin campaign status action (pause / cancel) through an RPC with audit and notice
- [owner] Apply `20260928000001-3` (campaign write guards, pricing enum fix, public bucket)

### WP4 - Sign-up and benefits

- [ ] Guest favorites cap below the free plan so signing up is worth something
- [ ] Sign-up headline and Terms page match `planBenefits.ts`; Terms added to the truthfulness test
- [ ] Resend confirmation keeps the callback redirect
- [ ] `handle_new_user` maps OAuth `full_name` / `name`
- [ ] Deletion 409 links to `/subscription`; `/advertise` sends new users to the sign-up tab
- [ ] Seed `user_email_preferences` at sign-up from marketing consent
- [owner] VIP has one benefit over Insider (unlimited saved searches) at 2.6x the price

### WP5 - Admin

- [ ] `isAdminUserId` and `assign-role` read all `user_roles` rows
- [ ] `assign-role` refuses to change a role at or above the caller's
- [ ] `security_audit_logs` inserts only via service role (after moving browser writers to an RPC)
- [ ] `newsletter_subscribers` admin policies via `is_admin()`
- [ ] Remove fake metrics and dead buttons from System Controls
- [ ] User list reads `user_roles`

### WP6 - Promotions, affiliates, referrals

- [x] Ticketmaster affiliate links: `rel="sponsored"`, disclosure next to the button, "Get tickets" from the decoded `u` target; Ticketmaster via Impact on /affiliate-disclosure
- [x] Scraper stops overwriting `events.source_url`: `events.affiliate_url` (`20261006000001`), preferred for the button; detail read retries without the column on 42703 until the migration is applied
- [x] Remove the unbacked "20% off" promise, the zero-filled ReferralTracker and email-derived referral codes (random, `src/lib/referralCode.ts`)
- [ ] Record `amount_paid`, `amount_discount`, promotion code on campaigns and subscriptions (ads work package owns stripe-webhook)
- [x] Referral codes on profiles (BEFORE INSERT trigger + backfill, `20261006000002`), `?ref` capture (`useReferralCapture`, 30 days), `attribute_referral` / `get_my_referral_stats` RPCs, "Invite friends" card on /profile
- [ ] Next release: drop the `referrals` INSERT policy "Users can create referrals" (`auth.uid() = referrer_id`), which lets a user insert rows naming themselves referrer and inflate their count. Nothing in web or mobile inserts directly; attribution goes through the RPC. A tightening, so not in the release that adds the RPC
- [x] Affiliate partner toggle: removed, not moved server-side. It wrote the admin's own localStorage and nothing read it. A server flag would add a request to every ad-bearing page (home first view is capped at 4). The admin card now says the switch is `isActive` in `src/lib/affiliateAds.ts`. `useAffiliateAd` no longer writes storage inside `useMemo`
- [ ] `/go/:slug` redirect with click logging (later)
- [owner] Referral rewards: nothing is granted and no copy promises anything. Decide whether an invite earns something (and what, via a Stripe promotion code server-side) before any copy mentions one
- [owner] Deploy order: apply `20261006000001` before deploying `scrape-ticketmaster-events`, or its update fails with 42703 on `affiliate_url`

## Owner steps

These need access this session does not have.

1. **SES.** Verify `desmoinesinsider.com` as an SES identity (DKIM + custom
   MAIL FROM), request production access, create a configuration set with an
   SNS topic for Bounce/Complaint/Delivery. Create an IAM user limited to
   `ses:SendEmail` and `ses:SendRawEmail`. Set Supabase secrets
   `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`,
   `SES_FROM_ADDRESS`, `SES_CONFIGURATION_SET`, `ADMIN_ALERT_EMAIL`.
2. **Supabase Auth SMTP.** Dashboard → Auth → SMTP: host
   `email-smtp.<region>.amazonaws.com`, port 587, the SES SMTP credentials.
   `config.toml` only applies locally.
3. **Migrations.** `supabase db push` after `npm run check-schema:probe`.
4. **VIP decision.** Build a VIP benefit, cut the price, or withdraw the tier.
