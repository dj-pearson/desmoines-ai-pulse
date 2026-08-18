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

  // --- subscription and identity, last ---
  "user_subscriptions",
  "profiles",
];

/**
 * Deliberately retained, with the basis for each. Erasure rights are not
 * absolute, and deleting these would destroy records the business is required
 * or entitled to keep. Reviewed with counsel before relying on any of them.
 */
export const RETAINED_TABLES: Readonly<Record<string, string>> = {
  consent_records:
    "Proof that consent was given and withdrawn (GDPR Art. 7(1)); append-only by design.",
  security_audit_logs:
    "Security incident investigation; legitimate interest, and deleting on request would let an attacker erase their own trail.",
  failed_login_attempts:
    "Brute-force and lockout defence; same reasoning as security_audit_logs.",
  system_events: "Operational incident record, not user-facing personal data.",
  error_events: "Crash diagnostics; message_redacted is already scrubbed of personal data.",
  subscription_events: "Billing history required for tax and chargeback defence.",
  subscription_split_audit: "Billing reconciliation across platforms; same basis.",
  ad_impressions: "Advertiser billing records; the counterparty is the advertiser, not this user.",
  campaigns: "Advertising contracts with their own retention and dispute window.",
  business_profiles: "Business listing under a commercial contract, not a personal profile.",
  contact_submissions: "Inbound business correspondence; may be needed to answer the inquiry it records.",
  partnership_applications: "Commercial application record with its own review trail.",

  // Google Search Console integration. user_id here is the admin who connected
  // the property; the rows are site metrics, not personal data. The admin's own
  // credentials ARE purged (gsc_oauth_credentials, above).
  analytics_properties: "Site analytics configuration keyed by property, not a personal record.",
  analytics_sync_jobs: "Job history for the analytics integration.",
  traffic_metrics: "Aggregate site traffic keyed by property.",
  search_performance: "Aggregate search metrics keyed by property.",
  keyword_rankings: "Aggregate keyword metrics keyed by property.",
  site_health_metrics: "Site health checks keyed by property.",
};
