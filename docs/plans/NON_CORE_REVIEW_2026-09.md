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
- [x] `ai_usage_daily` + `ai_quota_limits` + `ai_global_budget`, atomic `consume_ai_quota` / `settle_ai_usage` RPCs (migration `20261001000001`, not applied; per-subject daily $ cap via feature `'*'`)
- [x] `_shared/aiQuota.ts` guard, honouring `provider_budgets.paused` and the global kill switch
- [x] Guard nlp-search, discover-chat (atomic quota, VIP 200/day not unlimited), personalized-recommendations, generate-itinerary
- [ ] Record usage in the unrecorded callers: nlp-search and personalized-recommendations now record; support-chat records through `guardAi`; test-ai-model and ai-crawler still do not
- [x] Admin: AI spend by feature and today's global budget (`AiSpendTile` in AgentControlPlane)
- [x] `useUsage` no longer queries `usage_events` / `record_usage_event` (missing in prod); returns an empty state
- [x] VIP trip plan copy now states the 20/day cap (WP7)
- [x] support-chat behind `guardAi` (drafting path only; "talk to a human" stays unmetered)

### WP2 - Email on Amazon SES

- [x] `_shared/awsSigV4.ts` + `_shared/email.ts` (SES v2 API), tested against AWS SigV4 vectors (get-vanilla, post-vanilla, query-order, IAM signing key). Falls back to Resend while SES secrets are unset
- [x] `email_log` and `email_suppressions` tables (`20261002000001`); the unsubscribe RPC also writes a suppression, with a backfill (`20261002000002`)
- [x] Repoint shared senders (nurture, campaign notifications without SendGrid, ops/job alerts, outreach) and fix List-Unsubscribe (on the message now, not the HTTP request)
- [x] Repoint the remaining edge functions in scope. Newsletter campaigns now get the CAN-SPAM layout and a per-subscriber token; the weekly digest stores its bare body instead of one rendered for a placeholder recipient
- [x] `ses-events` (SNS signature + topic allowlist, permanent bounce/complaint → suppression) and `email-unsubscribe` (RFC 8058 one-click POST, GET → /unsubscribe page)
- [x] `[auth.email.smtp]` block and four auth templates in `supabase/config.toml` (`enabled = false` locally; hosted SMTP is set in the dashboard)
- [ ] Missing transactional mail: builders exist in `_shared/emailTemplates.ts` (subscription started/cancelled, admin new-campaign alert); stripe-webhook (ads work package) still has to call them with `sendEmail`
- [ ] Still on their own Resend call, outside this package: `send-seo-notification`, `agent-billing-selfservice` / `_shared/agents/billing-selfservice.ts`, `agent-outreach`. `stripe-webhook` and `send-campaign-notification` use `sendCampaignEmail` but pass no `supabase`, so they skip suppression and `email_log`
- [ ] Outreach and nurture mail carry only the mailto List-Unsubscribe: those recipients have no `newsletter_subscribers` token for the one-click URL
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

- [x] Guest favorites cap below the free plan so signing up is worth something (guest 3 -> 2, free stays 3; the tap that hit the wall is replayed after sign-up)
- [x] Client "N left" counts favorites across events and places, as enforce_favorites_limit does
- [x] Sign-up headline and Terms page match `planBenefits.ts`; Terms added to the truthfulness test
- [x] `/search/advanced` linked from `/search`
- [x] Resend confirmation keeps the callback redirect, and carries the captcha token
- [x] `handle_new_user` maps OAuth `full_name` / `name` (`20261004000001`, names-only backfill)
- [x] Deletion 409 links to `/subscription`; `/advertise` and AdvertiseButton send new users to the sign-up tab
- [x] Seed `user_email_preferences` at sign-up from marketing consent (same migration)
- [x] Unused WelcomeModal / OnboardingModal deleted
- [owner] Apply `20261004000001`

### WP7 - VIP benefits (owner chose "build benefits", 2026-09-26)

- [x] Ask Pulse (discover-chat) 200 questions/day vs Insider 50, stated in `planBenefits.ts` and tied to the quota seed by the truthfulness test
- [x] VIP support tickets move up one priority step in the classifier (`_shared/supportPriority.ts`), never into urgent
- [x] Ad-free browsing: already an Insider benefit, so VIP has it; no change
- [x] Trip plan copy states the real cap: no monthly cap, up to 20 a day
- [owner] Price check: VIP now adds Ask Pulse 4x, support queue position and unlimited saved searches over Insider at $12.99

### WP5 - Admin

- [x] `isAdminUserId` and `assign-role` read all `user_roles` rows (`_shared/roles.ts`, Deno test incl. the two-row user)
- [x] `assign-role` refuses to change a role at or above the caller's; `validate_role_assignment` ranks the assigner by strongest row and checks `OLD.role` (`20261005000001`)
- [x] `record_admin_audit` RPC, actor from `auth.uid()` (`20261005000002`); newsletter, event submissions, `useAuditLog`, `useSecurityAudit` write through `src/lib/adminAudit.ts`
- [ ] **Next release:** drop the two `WITH CHECK (true)` INSERT policies on `security_audit_logs` (see below)
- [x] `newsletter_subscribers` admin SELECT/UPDATE policies via `is_admin()` (`20261005000003`); the manager reports 0-row updates
- [x] System Controls: random metrics, restart/CDN/backup/optimize buttons and localStorage-only settings removed; Application Settings tab removed
- [x] User list reads `user_roles` (strongest per user), 50 per page; root_admin now sees root_admin options
- [x] Analytics: CRM tab hidden (its `crm_contacts`/`crm_deals`/`crm_tasks`/`crm_segments` tables don't exist); `/admin/crm` unchanged
- [owner] Apply `20261005000001-3`

**Next-release tightening for `security_audit_logs`.** Not shipped with the
RPC, because dropping a policy is a tightening and the writers move in this
release. Once `20261005000002` is live and this release's web build has
replaced the old one:

```sql
DROP POLICY IF EXISTS "System can insert security audit logs" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.security_audit_logs;
```

Edge functions write with the service role, which bypasses RLS, so they are
unaffected. Before shipping it, remove the PGRST202 fallback insert in
`src/lib/adminAudit.ts` and check what still inserts from the browser:
`src/lib/security/middleware.ts` `logSecurityEvent` writes for any user (and
has never stored a row: it sends severity `'info'`, which the CHECK refuses),
so it loses nothing, but it should be deleted or moved server-side in the same
change. Also worth doing then: revoke `EXECUTE` on
`optimize_database_performance()` from `PUBLIC`. It is SECURITY DEFINER with
no caller check; it fails today only because it runs `VACUUM` inside a
function.

The `security_audit_logs_event_type_check` constraint now includes
`role_assignment`. A migration from another package that redefines it has to
keep that value. `delete-user-account` still writes `account_deletion`
through `writeAuditLog`, which the constraint refuses, so that audit row is
never stored.

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
   `SES_FROM_ADDRESS`, `SES_CONFIGURATION_SET`, `ADMIN_ALERT_EMAIL`, and
   `SES_SNS_TOPIC_ARN` (ses-events refuses every message until it is set).
   Subscribe `https://<project>.supabase.co/functions/v1/ses-events` to the
   topic over HTTPS with raw message delivery off; the function confirms the
   subscription itself. Apply `20261002000001-2`, then deploy
   `email-unsubscribe`, `ses-events` and the repointed functions (without the
   tables they still send, but skip suppression and `email_log`). Once SES
   sends, remove `RESEND_API_KEY` and retire `resend-webhook`.
2. **Supabase Auth SMTP.** Dashboard → Auth → SMTP: host
   `email-smtp.<region>.amazonaws.com`, port 587, the SES SMTP credentials.
   `config.toml` only applies locally.
3. **Migrations.** `supabase db push` after `npm run check-schema:probe`.
4. **VIP decision.** Build a VIP benefit, cut the price, or withdraw the tier.
