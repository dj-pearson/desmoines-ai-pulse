/**
 * User-data classification for account erasure (WEB-LEGAL-004).
 *
 * delete-user-account used to name eight tables inline. Three of them
 * (favorites, ratings, reviews) do not exist in this database at all, the real
 * reviews table (user_ratings) was absent, and 60-odd other tables keyed by
 * user_id were never considered. Because the delete loop downgrades every
 * failure to console.warn - and vite strips console.* from production builds -
 * a delete against a non-existent table left no trace anywhere.
 *
 * The lists live here, apart from the handler, so they can be tested against
 * the generated schema. The accompanying test fails when a table with a user_id
 * column appears in the schema and is in neither list, which is what stops this
 * from silently drifting again the next time someone adds a feature.
 *
 * SOURCE OF TRUTH: src/integrations/supabase/types.ts. A name absent there
 * cannot succeed against the database those types were generated from
 * (the same premise scripts/check-schema-usage.mjs is built on).
 */

/**
 * Deleted on erasure, in dependency order. Children first, profiles last, so a
 * foreign key never blocks a parent row. Everything here is the user's own
 * activity, content, preferences or credentials.
 */
export const PURGE_TABLES: readonly string[] = [
  // --- engagement and interaction history ---
  "activity_feed",
  "user_activities",
  "user_analytics",
  // Which Business Pro weekly emails went out; a send log, nothing retained.
  "business_pro_report_sends",
  "user_interactions_enhanced",
  "user_event_interactions",
  "user_restaurant_interactions",
  "user_journeys",
  "recently_viewed",
  "swipe_interactions",
  "swipe_session_participants",
  "surprise_pick_outcomes",
  "discover_chat_usage",
  "search_analytics",
  "experiment_assignments",

  // --- user-authored content and reactions ---
  "user_ratings",            // the real reviews table; carries photo_urls
  "rating_helpful_votes",
  "content_helpful_votes",
  "article_comments",
  "event_discussions",
  "event_discussion_reactions",
  "discussion_likes",
  "event_reviews",
  "event_tips",
  "event_photos",
  "photo_likes",
  "event_live_feed",
  "votes",
  "user_submitted_events",
  "media_assets",            // rows; the files themselves go via purgeUserStorage

  // --- saved state and personalization ---
  "content_favorites",
  "saved_searches",
  "user_preference_profiles",
  "personalized_recommendations",
  "smart_event_suggestions",
  "user_locations",
  "user_calendars",
  "calendar_events",
  "calendar_preferences",
  "user_event_reminders",

  // --- social graph ---
  "user_friends",
  "friend_group_members",

  // --- attendance and gamification ---
  "event_attendance",
  "event_attendees",
  "event_checkins",
  "brewery_trail_checkins",
  "user_challenge_participation",
  "user_badges",
  "user_milestones",
  "user_reputation",

  // --- messaging state and support ---
  "user_email_preferences",
  "nurture_sends",
  "weekly_digest_log",
  "winback_interventions",
  "user_lifecycle_history",
  "user_event_feedback",
  "support_tickets",

  // --- credentials and access ---
  "user_oauth_tokens",
  "gsc_oauth_credentials",
  "account_deletion_tokens",
  "user_roles",

  // --- correspondence, business listings and records about this user ---
  // These were on the retained list until 2026-11-22. Most already went with
  // the account through ON DELETE CASCADE, so the stated retention was untrue;
  // the rest (contact_submissions, failed_login_attempts, system_events) kept
  // the person's name, email, message or IP under a NULL user_id. Owner
  // decision 2026-11-22, "delete should delete": they are deleted.
  // 20261122000060 makes the FKs agree. WEB-LEGAL-015.
  "contact_submissions",     // name, email, phone, message; replies cascade
  "partnership_applications",
  "failed_login_attempts",   // the address typed and the IP, for this account
  "system_events",           // events the user's actions raised
  "error_events",
  // A business listing the user owns. Business Pro billing for it is in
  // business_subscriptions, kept below.
  "business_profiles",
  // Subscription history. Deleting it means we hold no billing history for
  // this user afterwards; Stripe, Apple and Google keep their own records.
  "subscription_events",
  "subscription_split_audit",

  // --- subscription and identity, last ---
  "user_subscriptions",
  "profiles",
];

/**
 * Kept after erasure, with the basis for each. Only tables whose rows really
 * stay belong here: user-fk-on-delete.test.ts fails if a table listed here is
 * deleted by an ON DELETE CASCADE, which is how this list came to claim six
 * analytics tables, business_profiles, partnership_applications and
 * subscription_events were kept when the database deleted them.
 *
 * Owner decision 2026-11-22: "delete should delete". A row that is the user's
 * personal data goes; what is left here is kept for a reason that outlives the
 * account, and each entry says what it still holds. The account-deletion page
 * (src/pages/AccountDeletion.tsx) and the privacy policy list the same records.
 * Contact-form messages sent signed out are matched by address, not user_id;
 * see _shared/signedOutContactMessages.ts.
 */
const SITE_ANALYTICS =
  "The site's Search Console and analytics history (properties, traffic, search queries, keyword positions, site " +
  "health, sync jobs). It belongs to the site, not to the admin who connected it; the link to that account is " +
  "removed and nothing else in it identifies them.";

export const RETAINED_TABLES: Readonly<Record<string, string>> = {
  consent_records:
    "Proof that consent was given and withdrawn (GDPR Art. 7(1)); append-only by design. Holds a hash of the address, " +
    "not the address, plus the IP and browser at the time; the link to the account is removed.",
  security_audit_logs:
    "Security incident investigation; legitimate interest, and deleting on request would let an attacker erase their own " +
    "trail. Holds the account id, IP and browser for security events, including the deletion itself.",
  ad_impressions:
    "Advertiser billing records: which ad was shown, when, on what page and on what kind of device, counted toward " +
    "what an advertiser pays. Before the account is deleted the viewer's account id, IP address, browser and " +
    "referring page are cleared and the session id is replaced, so the count stays and the viewer is not " +
    "identified (trigger erase_ad_impression_viewer, 20261122000070).",
  campaigns:
    "Advertising contracts with their own retention and dispute window: what ran, when, and what it cost. Holds the " +
    "advertiser's account id.",
  // Search Console and analytics history (owner decision 2026-11-22). Site
  // data, not the personal data of the admin who connected it: user_id is ON
  // DELETE SET NULL (20261122000070), so the history outlives that admin's
  // account. No column in these holds the admin's name or email. The OAuth
  // credentials (user_oauth_tokens, gsc_oauth_credentials) are purged above.
  analytics_properties: SITE_ANALYTICS,
  traffic_metrics: SITE_ANALYTICS,
  search_performance: SITE_ANALYTICS,
  keyword_rankings: SITE_ANALYTICS,
  site_health_metrics: SITE_ANALYTICS,
  analytics_sync_jobs: SITE_ANALYTICS,
  business_subscriptions:
    "Business Pro billing record under a commercial contract (Stripe ids, status, period). Cancelled in Stripe before " +
    "the account is deleted.",
};
