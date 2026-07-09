# RLS Policy Audit

**Generated**: 2026-07-09 by `scripts/audit-rls.ts` (static analysis of `supabase/migrations/*.sql`, last-wins).
**Re-run**: `tsx scripts/audit-rls.ts`. Diff this file in future audits.

## Summary

| Metric | Count |
|---|---|
| Migrations scanned | 287 |
| Distinct policies (current) | 530 |
| Tables with RLS enabled | 240 |
| Tables with policies but no ENABLE RLS seen | 5 |
| Permissive write policies USING/CHECK(true) | 30 |
| Write policies granted to `anon` | 4 |
| SECURITY DEFINER functions | 114 |
| …of those WITHOUT pinned search_path | 50 |

## ⚠️ Findings needing attention

### 1. Permissive write policies — USING(true) / WITH CHECK(true) on INSERT/UPDATE/DELETE/ALL

| Table | Policy | Cmd | Roles | USING | WITH CHECK | Source |
|---|---|---|---|---|---|---|
| security_audit_logs | System can insert security audit logs | INSERT | public | — | true | 20250805134517_c5a29be8-af07-4660-b465-079dc7d54170.sql |
| csp_violation_logs | System can insert CSP violations | INSERT | public | — | true | 20250805134517_c5a29be8-af07-4660-b465-079dc7d54170.sql |
| failed_auth_attempts | System can insert failed auth attempts | INSERT | public | — | true | 20250806133721_58964b16-7c1e-4f1a-842e-0ad18ff2409e.sql |
| failed_login_attempts | Service role can insert failed attempts | INSERT | public | — | true | 20251109000000_security_enhancements.sql |
| security_audit_logs | Service role can insert audit logs | INSERT | public | — | true | 20251109000000_security_enhancements.sql |
| search_analytics | Anyone can log searches | INSERT | public | — | true | 20251110000009_add_enhanced_search.sql |
| activity_feed | System can insert activity | INSERT | public | — | true | 20251110000010_add_social_features.sql |
| newsletter_subscribers | Anyone can subscribe to newsletter | INSERT | public | — | true | 20251126000000_add_newsletter_and_subscriptions.sql |
| contact_submissions | Anyone can submit contact form | INSERT | public | — | true | 20251202000000_add_contact_submissions.sql |
| geofence_regions | Authenticated users can create geofence regions | INSERT | authenticated | — | true | 20251203000003_add_geofencing.sql |
| user_subscriptions | Service role can manage all subscriptions | ALL | public | true | true | 20251225000000_stripe_payment_enhancements.sql |
| payments | Service role can manage all payments | ALL | public | true | true | 20260110000000_add_payments_and_invoices.sql |
| invoices | Service role can manage all invoices | ALL | public | true | true | 20260110000000_add_payments_and_invoices.sql |
| usage_events | Service role can manage all usage events | ALL | public | true | true | 20260110000001_add_usage_tracking.sql |
| usage_quotas | Service role can manage usage quotas | ALL | public | true | true | 20260110000001_add_usage_tracking.sql |
| accessibility_reports | Anyone can submit accessibility reports | INSERT | public | — | true | 20260112_create_accessibility_reports.sql |
| image_optimization_queue | System can manage optimization queue | ALL | service_role | true | — | 20260127000001_media_infrastructure.sql |
| media_performance_metrics | Anyone can insert performance metrics | INSERT | public | — | true | 20260127000001_media_infrastructure.sql |
| guide_requests | Users can insert guide requests | INSERT | public | — | true | 20260228000006_create_guide_requests.sql |
| rfp_submissions | Anyone can submit RFP | INSERT | public | — | true | 20260228000007_create_meeting_venues_and_rfps.sql |
| pseo_pages | Service role full access to pseo pages | ALL | public | true | true | 20260311000001_create_pseo_pages.sql |
| pseo_generation_queue | Service role full access queue | ALL | public | true | true | 20260311000002_create_pseo_pipeline_tables.sql |
| pseo_generation_log | Service role full access log | ALL | public | true | true | 20260311000002_create_pseo_pipeline_tables.sql |
| consent_records | Service role full access | ALL | service_role | true | true | 20260413000001_create_consent_records.sql |
| social_accounts | Service role full access | ALL | service_role | true | true | 20260520000006_create_social_accounts.sql |
| newsletter_campaigns | Service role full access | ALL | service_role | true | true | 20260520000008_create_newsletter_campaigns.sql |
| trending_config | Service role full access | ALL | service_role | true | true | 20260520000009_create_trending_config.sql |
| newsletter_deliveries | Service role full access | ALL | service_role | true | true | 20260520000013_newsletter_delivery_tracking.sql |
| feedback_replies | Service role full access | ALL | service_role | true | true | 20260520000014_create_feedback_replies.sql |
| web_vitals | web_vitals_insert_any | INSERT | public | — | true | 20260620000004_web_vitals.sql |

> **Verdict**: each must be either an insert-only analytics/telemetry table (acceptable — justify inline) or tightened by an ADDITIVE migration. Do NOT tighten a policy a shipped mobile binary relies on in one release (CLAUDE.md) — flag those in §"Needs human decision".

### 2. Write access granted to the `anon` role

| Table | Policy | Cmd | Roles | USING | WITH CHECK | Source |
|---|---|---|---|---|---|---|
| consent_records | Anonymous consent inserts with no user binding | INSERT | anon | — | user_id IS NULL | 20260413000001_create_consent_records.sql |
| user_roles | user_roles_deny_client_insert | INSERT | authenticated, anon | — | false | 20260612000000_lock_down_user_roles_writes.sql |
| user_roles | user_roles_deny_client_update | UPDATE | authenticated, anon | false | false | 20260612000000_lock_down_user_roles_writes.sql |
| user_roles | user_roles_deny_client_delete | DELETE | authenticated, anon | false | — | 20260612000000_lock_down_user_roles_writes.sql |

> **Verdict**: confirm each is an intentional anonymous-write surface (e.g. anonymous analytics/feedback). Otherwise restrict to `authenticated`.

### 3. Tables with policies but no `ENABLE ROW LEVEL SECURITY` seen in migrations

> NOTE: RLS may have been enabled out-of-band (Supabase dashboard) and not captured in a migration. Treat as "verify", not "confirmed hole".

- `profiles`
- `storage.objects`
- `trending_scores`
- `user_analytics`
- `user_reputation`

### 4. SECURITY DEFINER functions without a pinned `search_path`

> A SECURITY DEFINER function without `SET search_path` is a privilege-escalation risk (search_path hijacking). Fix is additive + safe: `ALTER FUNCTION ... SET search_path = ...`.

- `aggregate_ad_analytics_for_date` (20251107000002_analytics_aggregation_job.sql)
- `aggregate_daily_ad_analytics` (20251107000002_analytics_aggregation_job.sql)
- `backfill_ad_analytics` (20251107000002_analytics_aggregation_job.sql)
- `calculate_campaign_pricing` (20260227000000_campaign_notifications_and_lifecycle.sql)
- `check_magic_link_rate_limit` (20251204000000_security_features.sql)
- `check_password_reset_rate_limit` (20251204000000_security_features.sql)
- `check_reminder_cron_status` (20251110000002_add_event_reminders_cron.sql)
- `cleanup_expired_sessions` (20251203000000_user_sessions.sql)
- `cleanup_security_data` (20251204000000_security_features.sql)
- `cleanup_security_logs` (20250805134517_c5a29be8-af07-4660-b465-079dc7d54170.sql)
- `create_api_key` (20251204000000_security_features.sql)
- `get_active_ads` (20260227000000_campaign_notifications_and_lifecycle.sql)
- `get_active_password_policy` (20251204000000_security_features.sql)
- `get_campaign_analytics_summary` (20251107000002_analytics_aggregation_job.sql)
- `get_current_usage` (20260110000001_add_usage_tracking.sql)
- `get_database_metrics` (20250806025748_2a16fb2c-cdac-486f-a5c0-8fb483226373.sql)
- `get_pending_reminders` (20251110000001_add_event_reminders_system.sql)
- `get_user_login_activity` (20251204000000_security_features.sql)
- `get_user_payment_summary` (20260110000000_add_payments_and_invoices.sql)
- `get_user_reminders_for_event` (20251110000001_add_event_reminders_system.sql)
- `get_user_session_policy` (20251204000000_security_features.sql)
- `get_user_subscription_tier` (20251225000000_stripe_payment_enhancements.sql)
- `increment_media_views` (20260127000001_media_infrastructure.sql)
- `is_account_locked` (20251204000000_security_features.sql)
- `log_login_activity` (20251204000000_security_features.sql)
- `log_security_event` (20260128000001_security_layers.sql)
- `mark_reminder_sent` (20251110000001_add_event_reminders_system.sql)
- `optimize_database_performance` (20250806025748_2a16fb2c-cdac-486f-a5c0-8fb483226373.sql)
- `process_campaign_lifecycle` (20260227000000_campaign_notifications_and_lifecycle.sql)
- `record_login_attempt` (20251204000000_security_features.sql)
- `record_password_reset_request` (20251204000000_security_features.sql)
- `record_usage_event` (20260110000001_add_usage_tracking.sql)
- `revoke_all_other_sessions` (20251203000000_user_sessions.sql)
- `revoke_api_key` (20251204000000_security_features.sql)
- `revoke_session` (20251203000000_user_sessions.sql)
- `run_social_media_automation` (20250903140840_3c9fa09a-0449-4e7e-9794-88f0bc6e419f.sql)
- `run_social_media_publishing` (20250903140840_3c9fa09a-0449-4e7e-9794-88f0bc6e419f.sql)
- `search_events_near_location` (20251110000000_add_geospatial_proximity_search.sql)
- `toggle_event_reminder` (20251110000001_add_event_reminders_system.sql)
- `trigger_due_scraping_jobs` (20250823012338_f22cb5f1-a713-4a8b-903e-f1a2238b9bb0.sql)
- `update_session_activity` (20251203000000_user_sessions.sql)
- `update_session_with_timeout` (20251204000000_security_features.sql)
- `update_subscription_stripe_prices` (20251225000000_stripe_payment_enhancements.sql)
- `update_trending_scores` (20250729000000_enhanced_analytics_system.sql)
- `user_has_permission` (20260128000001_security_layers.sql)
- `user_meets_role_level` (20260128000001_security_layers.sql)
- `user_owns_resource` (20260128000001_security_layers.sql)
- `validate_ad_creative_upload` (20251107000001_ad_creatives_storage.sql)
- `validate_api_key` (20251204000000_security_features.sql)
- `validate_password_policy` (20251204000000_security_features.sql)

## Full policy inventory

| Table | Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| accessibility_reports | Admins can update accessibility reports | UPDATE | public | auth.jwt() ->> 'role' = 'admin' OR EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| accessibility_reports | Admins can view accessibility reports | SELECT | public | auth.jwt() ->> 'role' = 'admin' OR EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| accessibility_reports | Anyone can submit accessibility reports | INSERT | public | — | true |
| activity_feed | System can insert activity | INSERT | public | — | true |
| activity_feed | Users can view their own activity and followed users' activity | SELECT | public | auth.uid() = user_id OR EXISTS ( SELECT 1 FROM user_follows WHERE follower_id = auth.uid() AND following_id = activity_feed.user_id ) | — |
| ad_rate_card | Admins can manage rate card | ALL | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| ad_rate_card | Public can read rate card | SELECT | public | true | — |
| admin_action_logs | Admins can view action logs | ALL | public | is_admin_or_root() | — |
| admin_action_logs | Moderators can insert admin action logs | INSERT | public | — | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('moderator', 'admin', 'root_admin') ) |
| admin_action_logs | Only admins can view admin action logs | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| advertising_packages | Admins can manage advertising packages | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| advertising_packages | Anyone can view active advertising packages | SELECT | public | is_active = true | — |
| agent_action_approvals | agent_approvals_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_action_approvals | agent_approvals_admin_update | UPDATE | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_action_log | agent_action_log_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_audit_log | agent_audit_log_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_quality_scores | agent_quality_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_registry | Admin-only delete for agent registry | DELETE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_registry | Admin-only insert for agent registry | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| agent_registry | Admin-only read for agent registry | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_registry | Admin-only update for agent registry | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_tasks | agent_tasks_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| agent_tasks | agent_tasks_admin_update | UPDATE | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| ai_configuration | Admins can manage AI configuration | ALL | public | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| ai_model_configurations | Admin full access to ai_model_configurations | ALL | public | is_admin() | — |
| ai_models | Admins can manage AI models | ALL | public | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| ai_models | Anyone can view active AI models | SELECT | public | is_active = true | — |
| analytics_properties | analytics_properties_policy | ALL | public | auth.uid() = user_id | — |
| analytics_sync_jobs | analytics_sync_jobs_policy | ALL | public | auth.uid() = user_id | — |
| api_key_usage | Users can view own API key usage | SELECT | public | EXISTS ( SELECT 1 FROM api_keys WHERE id = api_key_usage.api_key_id AND user_id = auth.uid() ) | — |
| api_keys | Users can manage own API keys | ALL | public | auth.uid() = user_id | — |
| article_categories | Admins can manage categories | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| article_categories | Anyone can view active categories | SELECT | public | is_active = true | — |
| article_categories | Authenticated users can view all categories | SELECT | authenticated | true | — |
| article_comments | Admins can manage all comments | ALL | public | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| article_comments | Anyone can view approved comments | SELECT | public | is_approved = true | — |
| article_comments | Users can create comments | INSERT | public | — | auth.uid() = user_id |
| article_comments | Users can update their own comments | UPDATE | public | auth.uid() = user_id | — |
| article_tag_relations | Admins can manage all tag relations | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| article_tag_relations | Anyone can view tag relations | SELECT | public | true | — |
| article_tag_relations | Authors can manage their article tags | ALL | authenticated | EXISTS ( SELECT 1 FROM articles WHERE articles.id = article_id AND articles.author_id = auth.uid() ) | — |
| article_tags | Admins can manage tags | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| article_tags | Anyone can view tags | SELECT | public | true | — |
| article_webhooks | Admins can manage article webhooks | ALL | public | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| articles | Admins can manage all articles | ALL | public | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| articles | Anyone can view published articles | SELECT | public | status = 'published' | — |
| articles | Authors can manage their own articles | ALL | public | auth.uid() = author_id | — |
| author_profiles | Admins can manage all author profiles | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| author_profiles | Authenticated users can view all author profiles | SELECT | authenticated | true | — |
| author_profiles | Public can view active author profiles | SELECT | public | is_active = true | — |
| author_profiles | Users can update their own author profile | UPDATE | authenticated | user_id = auth.uid() | user_id = auth.uid() |
| auto_approval_rules | Admin full access to auto_approval_rules | ALL | public | is_admin() | — |
| automation_job_runs | automation_job_runs_admin_read | SELECT | authenticated | public.is_admin() | — |
| backup_checks | backup_checks_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| badges | Anyone can view active badges | SELECT | public | is_active = true | — |
| blocked_email_domains | Admins can delete blocked email domains | DELETE | authenticated | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| blocked_email_domains | Admins can insert blocked email domains | INSERT | authenticated | — | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) |
| blocked_email_domains | Admins can update blocked email domains | UPDATE | authenticated | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) |
| blocked_email_domains | Blocked email domains are publicly readable | SELECT | public | true | — |
| blocked_ips | Admins can manage blocked IPs | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| brewery_trail_checkins | Authenticated users can check in | INSERT | public | — | auth.uid() = user_id |
| brewery_trail_checkins | Public read checkin counts | SELECT | public | true | — |
| brewery_trail_checkins | Users can update own checkins | UPDATE | public | auth.uid() = user_id | — |
| brewery_trail_checkins | Users can view own checkins | SELECT | public | auth.uid() = user_id | — |
| business_analytics | Business owners can view their own analytics | SELECT | public | EXISTS ( SELECT 1 FROM public.business_profiles WHERE id = business_analytics.business_id AND user_id = auth.uid() ) | — |
| business_analytics | Service role can manage analytics | ALL | public | auth.role() = 'service_role'::text | — |
| business_profiles | Admins can manage all business profiles | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| business_profiles | Public can view verified business profiles | SELECT | public | verification_status = 'verified' | — |
| business_profiles | Users can create their own business profile | INSERT | public | — | auth.uid() = user_id |
| business_profiles | Users can update their own business profile | UPDATE | public | auth.uid() = user_id | — |
| calendar_events | Users can manage their own calendar events | ALL | public | auth.uid() = user_id | — |
| calendar_events | Users can view their own calendar events | SELECT | public | auth.uid() = user_id | — |
| calendar_preferences | Users can manage their own calendar preferences | ALL | public | auth.uid() = user_id | — |
| calendar_preferences | Users can view their own calendar preferences | SELECT | public | auth.uid() = user_id | — |
| campaign_notifications | Service role manages notifications | ALL | public | auth.role() = 'service_role' | — |
| campaign_notifications | Users can read own notifications | SELECT | public | auth.uid() = recipient_user_id | — |
| campaign_notifications | Users can update own notifications | UPDATE | public | auth.uid() = recipient_user_id | auth.uid() = recipient_user_id |
| ci_runs | ci_runs_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| community_challenges | Admins can manage challenges | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| community_challenges | Anyone can view active challenges | SELECT | public | is_active = true | — |
| competitor_content | Admin can manage competitor content | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| competitor_reports | Admin can view competitor reports | SELECT | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| competitors | Admin can manage competitors | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| consent_records | Anonymous consent inserts with no user binding | INSERT | anon | — | user_id IS NULL |
| consent_records | Authenticated users insert their own consent | INSERT | authenticated | — | auth.uid() = user_id |
| consent_records | Service role full access | ALL | service_role | true | true |
| consent_records | Users read their own consent records | SELECT | authenticated | auth.uid() = user_id | — |
| contact_submissions | Admins can update submissions | UPDATE | public | is_admin() | — |
| contact_submissions | Admins can view all submissions | SELECT | public | is_admin() | — |
| contact_submissions | Anyone can submit contact form | INSERT | public | — | true |
| contact_submissions | Users can view own submissions | SELECT | public | auth.uid() = user_id | — |
| content_favorites | content_favorites_delete_own | DELETE | public | auth.uid() = user_id | — |
| content_favorites | content_favorites_insert_own | INSERT | public | — | auth.uid() = user_id |
| content_favorites | content_favorites_select_own | SELECT | public | auth.uid() = user_id | — |
| content_helpful_votes | Users can manage their own votes | ALL | public | auth.uid() = user_id | — |
| content_helpful_votes | Users can view all helpful votes | SELECT | public | true | — |
| content_merge_candidates | Admins read merge candidates | SELECT | authenticated | public.is_admin() | — |
| content_merges | Admins read merges | SELECT | authenticated | public.is_admin() | — |
| content_moderation | Admins read moderation queue | SELECT | authenticated | public.is_admin() | — |
| content_performance_metrics | Everyone can read content performance | SELECT | public | true | — |
| content_performance_metrics | Service role can manage content performance | ALL | public | auth.role() = 'service_role' | — |
| content_queue | Admins can manage all queue items | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| content_queue | Admins can manage content queue | ALL | public | is_admin_or_root() | — |
| content_queue | Authors can create queue items | INSERT | authenticated | — | submitted_by = auth.uid() |
| content_queue | Authors can view their own queue items | SELECT | authenticated | submitted_by = auth.uid() OR assigned_reviewer = auth.uid() | — |
| content_queue | Reviewers can update assigned items | UPDATE | authenticated | assigned_reviewer = auth.uid() | assigned_reviewer = auth.uid() |
| content_queue_comments | Admins can manage all comments | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| content_queue_comments | Users can create comments on accessible queue items | INSERT | authenticated | — | user_id = auth.uid() AND EXISTS ( SELECT 1 FROM content_queue cq WHERE cq.id = queue_item_id AND (cq.submitted_by = auth.uid() OR cq.assigned_reviewer = auth.uid()) ) |
| content_queue_comments | Users can view comments on their queue items | SELECT | authenticated | EXISTS ( SELECT 1 FROM content_queue cq WHERE cq.id = queue_item_id AND (cq.submitted_by = auth.uid() OR cq.assigned_reviewer = auth.uid()) ) | — |
| content_suggestions | Admin can manage content suggestions | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| crm_activities | Activities accessible by admins and owners | ALL | authenticated | is_crm_admin() OR EXISTS ( SELECT 1 FROM crm_contacts WHERE id = crm_activities.contact_id AND user_id = auth.uid() ) | is_crm_admin() |
| crm_communications | Communications accessible by admins | ALL | authenticated | is_crm_admin() OR EXISTS ( SELECT 1 FROM crm_contacts WHERE id = crm_communications.contact_id AND user_id = auth.uid() ) | is_crm_admin() |
| crm_contact_segments | Contact segments accessible by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_contacts | Contacts accessible by admins | ALL | authenticated | is_crm_admin() OR user_id = auth.uid() | is_crm_admin() |
| crm_deal_stage_history | Deal stage history accessible by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_deals | Deals accessible by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_lead_score_history | Lead score history accessible by admins | ALL | authenticated | is_crm_admin() OR EXISTS ( SELECT 1 FROM crm_contacts WHERE id = crm_lead_score_history.contact_id AND user_id = auth.uid() ) | is_crm_admin() |
| crm_lead_score_rules | Lead score rules readable by authenticated | SELECT | authenticated | true | — |
| crm_lead_score_rules | Lead score rules writable by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_notes | Notes accessible by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_pipeline_stages | Pipeline stages readable by authenticated users | SELECT | authenticated | true | — |
| crm_pipeline_stages | Pipeline stages writable by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_segments | Segments accessible by admins | ALL | authenticated | is_crm_admin() | is_crm_admin() |
| crm_tasks | Tasks accessible by admins and assigned users | ALL | authenticated | is_crm_admin() OR assigned_to = auth.uid() OR created_by = auth.uid() | is_crm_admin() OR assigned_to = auth.uid() OR created_by = auth.uid() |
| cron_logs | Admin access for cron_logs | ALL | public | auth.role() = 'authenticated' OR auth.role() = 'service_role' | — |
| cron_logs | Admins can view cron logs | SELECT | public | is_admin_or_root() | — |
| csp_violation_logs | Only admins can view CSP violations | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| csp_violation_logs | System can insert CSP violations | INSERT | public | — | true |
| curated_itineraries | Admins can manage itineraries | ALL | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| curated_itineraries | Public read for published itineraries | SELECT | public | is_published = true | — |
| data_quality_scans | Admin full access to data_quality_scans | ALL | public | is_admin() | — |
| deals | Admins can manage all deals | ALL | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| deals | Business owners and admins can insert deals | INSERT | public | — | auth.role() = 'authenticated' |
| deals | Public read for active deals | SELECT | public | start_date <= now() AND (end_date IS NULL OR end_date >= now()) | — |
| discover_chat_usage | Users can read their own discover_chat usage | SELECT | public | auth.uid() = user_id | — |
| discussion_forums | Anyone can view public forums | SELECT | public | is_public = true | — |
| discussion_forums | Authenticated users can create forums | INSERT | public | — | auth.uid() IS NOT NULL AND auth.uid() = created_by |
| discussion_forums | Forum creators can update their forums | UPDATE | public | auth.uid() = created_by | — |
| discussion_likes | Anyone can view discussion likes | SELECT | public | true | — |
| discussion_likes | Authenticated users can like discussions | INSERT | public | — | auth.uid() = user_id |
| discussion_likes | Users can unlike discussions | DELETE | public | auth.uid() = user_id | — |
| discussion_replies | Anyone can view replies in public forum threads | SELECT | public | EXISTS ( SELECT 1 FROM public.discussion_threads dt JOIN public.discussion_forums df ON dt.forum_id = df.id WHERE dt.id = thread_id AND df.is_public = true ) | — |
| discussion_replies | Authenticated users can create replies | INSERT | public | — | auth.uid() IS NOT NULL AND auth.uid() = created_by |
| discussion_replies | Reply creators can update their replies | UPDATE | public | auth.uid() = created_by | — |
| discussion_threads | Anyone can view threads in public forums | SELECT | public | EXISTS ( SELECT 1 FROM public.discussion_forums WHERE id = forum_id AND is_public = true ) | — |
| discussion_threads | Authenticated users can create threads | INSERT | public | — | auth.uid() IS NOT NULL AND auth.uid() = created_by |
| discussion_threads | Thread creators can update their threads | UPDATE | public | auth.uid() = created_by | — |
| error_events | error_events_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| event_archive | Admins can read event_archive | SELECT | authenticated | public.is_admin() | — |
| event_attendance | Users can manage their own attendance | ALL | public | auth.uid() = user_id | — |
| event_attendance | Users can view all attendance | SELECT | public | true | — |
| event_attendees | Anyone can view attendee status | SELECT | public | true | — |
| event_attendees | Users can delete their own attendee status | DELETE | public | auth.uid() = user_id | — |
| event_attendees | Users can manage their own attendee status | INSERT | public | — | auth.uid() = user_id |
| event_attendees | Users can update their own attendee status | UPDATE | public | auth.uid() = user_id | — |
| event_attendees | Users can view public attendee status | SELECT | public | visibility = 'public' OR auth.uid() = user_id | — |
| event_checkins | Anyone can view check-ins | SELECT | public | true | — |
| event_checkins | Anyone can view event checkins | SELECT | public | true | — |
| event_checkins | Authenticated users can check in | INSERT | public | — | auth.uid() = user_id |
| event_checkins | Users can create their own checkins | INSERT | public | — | auth.uid() = user_id |
| event_checkins | Users can update their own checkins | UPDATE | public | auth.uid() = user_id | — |
| event_checkins | Users can view public event checkins | SELECT | public | true | — |
| event_discussion_reactions | Anyone can view discussion reactions | SELECT | public | true | — |
| event_discussion_reactions | Users can create their own reactions | INSERT | public | — | auth.uid() = user_id |
| event_discussion_reactions | Users can delete their own reactions | DELETE | public | auth.uid() = user_id | — |
| event_discussion_reactions | Users can update their own reactions | UPDATE | public | auth.uid() = user_id | — |
| event_discussions | Anyone can view discussions | SELECT | public | NOT is_deleted | — |
| event_discussions | Anyone can view event discussions | SELECT | public | true | — |
| event_discussions | Authenticated users can create discussions | INSERT | public | — | auth.uid() = user_id |
| event_discussions | Users can delete their own discussions | DELETE | public | auth.uid() = user_id | — |
| event_discussions | Users can update their own discussions | UPDATE | public | auth.uid() = user_id | — |
| event_hotels | Authenticated users can delete event_hotels | DELETE | public | auth.role() = 'authenticated' | — |
| event_hotels | Authenticated users can insert event_hotels | INSERT | public | — | auth.role() = 'authenticated' |
| event_hotels | Authenticated users can update event_hotels | UPDATE | public | auth.role() = 'authenticated' | — |
| event_hotels | Public read access for event_hotels | SELECT | public | true | — |
| event_invitations | Invitees can update invitation status | UPDATE | public | auth.uid() = invitee_id | — |
| event_invitations | Users can create event invitations | INSERT | public | — | auth.uid() = inviter_id |
| event_invitations | Users can view invitations they sent or received | SELECT | public | auth.uid() = inviter_id OR auth.uid() = invitee_id | — |
| event_live_feed | Anyone can view event live feed | SELECT | public | true | — |
| event_live_feed | Authenticated users can create feed items | INSERT | public | — | auth.uid() = user_id |
| event_live_stats | Anyone can view event live stats | SELECT | public | true | — |
| event_live_stats | Service role can manage event live stats | ALL | public | auth.role() = 'service_role' | auth.role() = 'service_role' |
| event_photo_reactions | Anyone can view photo reactions | SELECT | public | true | — |
| event_photo_reactions | Users can create their own reactions | INSERT | public | — | auth.uid() = user_id |
| event_photo_reactions | Users can delete their own reactions | DELETE | public | auth.uid() = user_id | — |
| event_photos | Anyone can view approved photos | SELECT | public | is_approved = true | — |
| event_photos | Anyone can view event photos | SELECT | public | true | — |
| event_photos | Authenticated users can upload photos | INSERT | public | — | auth.uid() = user_id |
| event_photos | Users can create their own photos | INSERT | public | — | auth.uid() = user_id |
| event_photos | Users can delete their own photos | DELETE | public | auth.uid() = user_id | — |
| event_photos | Users can update their own photos | UPDATE | public | auth.uid() = user_id | — |
| event_reviews | Users can create their own reviews | INSERT | public | — | auth.uid() = user_id |
| event_reviews | Users can update their own reviews | UPDATE | public | auth.uid() = user_id | — |
| event_reviews | Users can view all reviews | SELECT | public | true | — |
| event_social_metrics | Anyone can view social metrics | SELECT | public | true | — |
| event_social_metrics | Service role can manage social metrics | ALL | public | auth.role() = 'service_role' | — |
| event_tips | Users can create their own tips | INSERT | public | — | auth.uid() = user_id |
| event_tips | Users can view all tips and reviews | SELECT | public | true | — |
| experiment_assignments | Admins can read all experiment assignments | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| experiment_assignments | Authenticated users can insert own experiment assignments | INSERT | public | — | user_id = auth.uid() OR user_id IS NULL |
| experiment_assignments | Users can read own experiment assignments | SELECT | public | user_id = auth.uid() | — |
| failed_auth_attempts | Only admins can view failed auth attempts | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| failed_auth_attempts | System can insert failed auth attempts | INSERT | public | — | true |
| failed_login_attempts | Admins can view all login attempts | SELECT | public | EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| failed_login_attempts | Admins can view failed login attempts | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| failed_login_attempts | Service role can insert failed attempts | INSERT | public | — | true |
| feature_flags | Admin-only delete for feature flags | DELETE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| feature_flags | Admin-only insert for feature flags | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| feature_flags | Admin-only update for feature flags | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| feature_flags | Public read access for feature flags | SELECT | public | true | — |
| feedback_replies | Admin can insert replies | INSERT | authenticated | — | is_admin() |
| feedback_replies | Admin can read replies | SELECT | authenticated | is_admin() | — |
| feedback_replies | Service role full access | ALL | service_role | true | true |
| friend_group_members | Group admins can manage members | ALL | public | EXISTS (SELECT 1 FROM public.friend_groups WHERE id = group_id AND created_by = auth.uid()) OR EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = friend_group_members.group_id AND user_id = auth.uid() AND role = 'admin') | — |
| friend_group_members | Users can view group members if they are members | SELECT | public | auth.uid() = user_id OR public.user_can_access_group(auth.uid(), group_id) | — |
| friend_group_members | Users can view group memberships for groups they can see | SELECT | public | EXISTS (SELECT 1 FROM public.friend_groups WHERE id = group_id AND ( is_public = true OR created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.friend_group_members m2 WHERE m2.group_id = group_id AND m2.user_id = auth.uid()) )) | — |
| friend_groups | Group creators and admins can update groups | UPDATE | public | created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = id AND user_id = auth.uid() AND role = 'admin') | — |
| friend_groups | Users can create their own groups | INSERT | public | — | auth.uid() = created_by |
| friend_groups | Users can view groups they're members of or public groups | SELECT | public | is_public = true OR created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = id AND user_id = auth.uid()) | — |
| geofence_events | Admins can view all geofence events | SELECT | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| geofence_events | Users can log their own geofence events | INSERT | authenticated | — | user_id = auth.uid() |
| geofence_events | Users can view their own geofence events | SELECT | authenticated | user_id = auth.uid() | — |
| geofence_regions | Admins can manage all geofence regions | ALL | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| geofence_regions | Anyone can view active geofence regions | SELECT | public | active = true | — |
| geofence_regions | Authenticated users can create geofence regions | INSERT | authenticated | — | true |
| geofence_regions | Users can update their own geofence regions | UPDATE | authenticated | created_by = auth.uid() | — |
| group_planning_sessions | Group members can create and update planning sessions | ALL | public | EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = group_planning_sessions.group_id AND user_id = auth.uid()) | — |
| group_planning_sessions | Group members can view planning sessions | SELECT | public | EXISTS (SELECT 1 FROM public.friend_group_members WHERE group_id = group_planning_sessions.group_id AND user_id = auth.uid()) | — |
| gsc_keyword_performance | Admin full access to gsc_keyword_performance | ALL | public | is_admin() | is_admin() |
| gsc_oauth_credentials | Admin full access to gsc_oauth_credentials | ALL | public | is_admin() | is_admin() |
| gsc_page_performance | Admin full access to gsc_page_performance | ALL | public | is_admin() | is_admin() |
| gsc_properties | Admin full access to gsc_properties | ALL | public | is_admin() | is_admin() |
| guide_requests | Admin read | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| guide_requests | Admin update | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| guide_requests | Users can insert guide requests | INSERT | public | — | true |
| hotel_areas | Admin full access to hotel_areas | ALL | public | is_admin() | — |
| hotel_blacklist | Authenticated users can delete hotel_blacklist | DELETE | public | auth.role() = 'authenticated' | — |
| hotel_blacklist | Authenticated users can insert hotel_blacklist | INSERT | public | — | auth.role() = 'authenticated' |
| hotel_blacklist | Authenticated users can update hotel_blacklist | UPDATE | public | auth.role() = 'authenticated' | — |
| hotel_blacklist | Public read access for hotel_blacklist | SELECT | public | true | — |
| hotels | Authenticated users can delete hotels | DELETE | public | auth.role() = 'authenticated' | — |
| hotels | Authenticated users can insert hotels | INSERT | public | — | auth.role() = 'authenticated' |
| hotels | Authenticated users can update hotels | UPDATE | public | auth.role() = 'authenticated' | — |
| hotels | Public read access for hotels | SELECT | public | true | — |
| image_optimization_queue | Public read access for optimization queue | SELECT | public | true | — |
| image_optimization_queue | System can manage optimization queue | ALL | service_role | true | — |
| import_jobs | Admin full access to import_jobs | ALL | public | is_admin() | — |
| invoices | Service role can manage all invoices | ALL | public | true | true |
| invoices | Users can view own invoices | SELECT | public | auth.uid() = user_id | — |
| keyword_rankings | keyword_rankings_policy | ALL | public | auth.uid() = user_id | — |
| known_venues | Admins can manage venues | ALL | public | is_admin() | — |
| known_venues | Public can view active venues | SELECT | public | is_active = true | — |
| location_history | Admins can view all location history | SELECT | authenticated | EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| location_history | Users can delete their own location history | DELETE | authenticated | user_id = auth.uid() | — |
| location_history | Users can insert their own location data | INSERT | authenticated | — | user_id = auth.uid() |
| location_history | Users can view their own location history | SELECT | authenticated | user_id = auth.uid() | — |
| login_activity | Admins can view all login activity | SELECT | public | EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| login_activity | Users can view own login activity | SELECT | public | auth.uid() = user_id | — |
| login_attempts | Service role only | ALL | public | auth.role() = 'service_role' | auth.role() = 'service_role' |
| media_assets | Admins can manage all media | ALL | authenticated | is_admin() | is_admin() |
| media_assets | Authenticated users can upload media | INSERT | authenticated | — | auth.uid() = user_id OR user_id IS NULL |
| media_assets | Public read access for media assets | SELECT | public | true | — |
| media_assets | Users can delete their own media | DELETE | authenticated | auth.uid() = user_id | — |
| media_assets | Users can update their own media | UPDATE | authenticated | auth.uid() = user_id | — |
| media_performance_metrics | Admins can view performance metrics | SELECT | authenticated | is_admin() | — |
| media_performance_metrics | Anyone can insert performance metrics | INSERT | public | — | true |
| meeting_venues | Admin insert | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| meeting_venues | Public read access | SELECT | public | true | — |
| newsletter_campaigns | Admin can read campaigns | SELECT | authenticated | is_admin() | — |
| newsletter_campaigns | Service role full access | ALL | service_role | true | true |
| newsletter_deliveries | Admin can read deliveries | SELECT | authenticated | is_admin() | — |
| newsletter_deliveries | Service role full access | ALL | service_role | true | true |
| newsletter_subscribers | Admins can read newsletter subscribers | SELECT | public | EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| newsletter_subscribers | Anyone can subscribe to newsletter | INSERT | public | — | true |
| oauth_providers | Admin full access to oauth_providers | ALL | public | is_admin() | — |
| ops_notification_log | ops_notification_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| partnership_applications | Admins can manage all applications | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| partnership_applications | Users can create their own applications | INSERT | public | — | auth.uid() = user_id |
| partnership_applications | Users can view their own applications | SELECT | public | auth.uid() = user_id | — |
| partnership_benefits | Admins can manage partnership benefits | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| partnership_benefits | Anyone can view active partnership benefits | SELECT | public | is_active = true | — |
| password_policies | Anyone can read password policies | SELECT | public | TRUE | — |
| password_policies | Only admins can modify password policies | ALL | public | EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| payments | Service role can manage all payments | ALL | public | true | true |
| payments | Users can view own payments | SELECT | public | auth.uid() = user_id | — |
| permission_definitions | Anyone can view permission definitions | SELECT | public | true | — |
| permission_definitions | Only root_admin can modify permission definitions | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'root_admin' ) | — |
| personalized_recommendations | Anonymous users can view session recommendations | SELECT | public | auth.uid() IS NULL AND user_id IS NULL | — |
| personalized_recommendations | Service role can manage recommendations | ALL | public | auth.role() = 'service_role' | — |
| personalized_recommendations | Users can view their own recommendations | SELECT | public | auth.uid() = user_id | — |
| photo_likes | Anyone can view photo likes | SELECT | public | true | — |
| photo_likes | Authenticated users can like photos | INSERT | public | — | auth.uid() = user_id |
| photo_likes | Users can unlike photos | DELETE | public | auth.uid() = user_id | — |
| profiles | Admins can delete profiles | DELETE | authenticated | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| profiles | Admins can update all profiles | UPDATE | authenticated | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | user_has_role_or_higher(auth.uid(), 'admin'::user_role) |
| profiles | Admins can view all profiles | SELECT | authenticated | user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| pseo_generation_log | Admin read log | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| pseo_generation_log | Service role full access log | ALL | public | true | true |
| pseo_generation_queue | Admin read queue | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| pseo_generation_queue | Service role full access queue | ALL | public | true | true |
| pseo_pages | Public can read published pseo pages | SELECT | public | is_published = true | — |
| pseo_pages | Service role full access to pseo pages | ALL | public | true | true |
| rate_limit_entries | Service role only | ALL | public | auth.role() = 'service_role' | auth.role() = 'service_role' |
| recently_viewed | recently_viewed_delete_own | DELETE | public | auth.uid() = user_id | — |
| recently_viewed | recently_viewed_insert_own | INSERT | public | — | auth.uid() = user_id |
| recently_viewed | recently_viewed_select_own | SELECT | public | auth.uid() = user_id | — |
| recently_viewed | recently_viewed_update_own | UPDATE | public | auth.uid() = user_id | auth.uid() = user_id |
| referrals | Users can create referrals | INSERT | public | — | auth.uid() = referrer_id |
| referrals | Users can view own referrals | SELECT | public | auth.uid() = referrer_id | — |
| restaurant_blacklist | Admins can delete blacklist | DELETE | public | is_admin() | — |
| restaurant_blacklist | Admins can insert blacklist | INSERT | public | — | is_admin() |
| restaurant_blacklist | Admins can update blacklist | UPDATE | public | is_admin() | — |
| restaurant_blacklist | Public read access for blacklist | SELECT | public | true | — |
| restaurant_menu_items | Admins can delete menu items | DELETE | public | auth.jwt() ->> 'role' = 'admin' | — |
| restaurant_menu_items | Admins can update menu items | UPDATE | public | auth.jwt() ->> 'role' = 'admin' | — |
| restaurant_menu_items | Authenticated users can insert menu items | INSERT | public | — | auth.role() = 'authenticated' |
| restaurant_menu_items | Public read access on restaurant_menu_items | SELECT | public | true | — |
| restaurant_menus | Admins can delete menus | DELETE | public | auth.jwt() ->> 'role' = 'admin' | — |
| restaurant_menus | Admins can update menus | UPDATE | public | auth.jwt() ->> 'role' = 'admin' | — |
| restaurant_menus | Authenticated users can insert menus | INSERT | public | — | auth.role() = 'authenticated' |
| restaurant_menus | Public read access on restaurant_menus | SELECT | public | true | — |
| rfp_submissions | Admin read RFPs | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| rfp_submissions | Admin update RFPs | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| rfp_submissions | Anyone can submit RFP | INSERT | public | — | true |
| role_definitions | Anyone can view role definitions | SELECT | public | true | — |
| role_definitions | Only root_admin can modify role definitions | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'root_admin' ) | — |
| role_permissions | Anyone can view role permissions | SELECT | public | true | — |
| role_permissions | Only root_admin can modify role permissions | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'root_admin' ) | — |
| saved_searches | Users can create their own saved searches | INSERT | public | — | auth.uid() = user_id |
| saved_searches | Users can delete their own saved searches | DELETE | public | auth.uid() = user_id | — |
| saved_searches | Users can update their own saved searches | UPDATE | public | auth.uid() = user_id | — |
| saved_searches | Users can view their own saved searches | SELECT | public | auth.uid() = user_id | — |
| scene_updates | Admin delete scene updates | DELETE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| scene_updates | Admin insert scene updates | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| scene_updates | Admin update scene updates | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| scene_updates | Public read published scene updates | SELECT | public | is_published = true | — |
| scraping_jobs | Admins can delete scraping jobs | DELETE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| scraping_jobs | Admins can insert scraping jobs | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| scraping_jobs | Admins can read all scraping jobs | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| scraping_jobs | Admins can update scraping jobs | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| search_analytics | Admins can view search analytics | SELECT | public | is_admin_or_root() | — |
| search_analytics | Anyone can log searches | INSERT | public | — | true |
| search_performance | search_performance_policy | ALL | public | auth.uid() = user_id | — |
| seasonal_guides | Admin full access | ALL | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| seasonal_guides | Public read published | SELECT | public | is_published = true | — |
| security_audit_logs | Admins can view security audit logs | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| security_audit_logs | Only admins can view security audit logs | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| security_audit_logs | Service role can insert audit logs | INSERT | public | — | true |
| security_audit_logs | System can insert security audit logs | INSERT | public | — | true |
| security_audit_tracking | Only admins can manage security audit tracking | ALL | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| security_audit_tracking | Only admins can view security audit tracking | SELECT | public | user_has_role_or_higher(auth.uid(), 'admin') | — |
| security_settings | Only root admins can manage security settings | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'root_admin' ) | — |
| seo_alert_rules | Admin full access to seo_alert_rules | ALL | public | is_admin() | — |
| seo_alerts | Admin full access to seo_alerts | ALL | public | is_admin() | — |
| seo_audit_history | Admin full access to seo_audit_history | ALL | public | is_admin() | — |
| seo_competitor_analysis | Admin full access to seo_competitor_analysis | ALL | public | is_admin() | — |
| seo_content_optimization | Admin full access to seo_content_optimization | ALL | public | is_admin() | — |
| seo_core_web_vitals | Admin full access to seo_core_web_vitals | ALL | public | is_admin() | — |
| seo_crawl_results | Admin full access to seo_crawl_results | ALL | public | is_admin() | — |
| seo_duplicate_content | Admin full access to seo_duplicate_content | ALL | public | is_admin() | — |
| seo_fixes_applied | Admin full access to seo_fixes_applied | ALL | public | is_admin() | — |
| seo_image_analysis | Admin full access to seo_image_analysis | ALL | public | is_admin() | — |
| seo_keyword_history | Admin full access to seo_keyword_history | ALL | public | is_admin() | — |
| seo_keywords | Admin full access to seo_keywords | ALL | public | is_admin() | — |
| seo_link_analysis | Admin full access to seo_link_analysis | ALL | public | is_admin() | — |
| seo_mobile_analysis | Admin full access to seo_mobile_analysis | ALL | public | is_admin() | — |
| seo_monitoring_log | Admin full access to seo_monitoring_log | ALL | public | is_admin() | — |
| seo_monitoring_schedules | Admin full access to seo_monitoring_schedules | ALL | public | is_admin() | — |
| seo_notification_preferences | Admin full access to seo_notification_preferences | ALL | public | is_admin() | — |
| seo_page_scores | Admin full access to seo_page_scores | ALL | public | is_admin() | — |
| seo_performance_budget | Admin full access to seo_performance_budget | ALL | public | is_admin() | — |
| seo_redirect_analysis | Admin full access to seo_redirect_analysis | ALL | public | is_admin() | — |
| seo_security_analysis | Admin full access to seo_security_analysis | ALL | public | is_admin() | — |
| seo_semantic_analysis | Admin full access to seo_semantic_analysis | ALL | public | is_admin() | — |
| seo_settings | Admin full access to seo_settings | ALL | public | is_admin() | — |
| seo_structured_data | Admin full access to seo_structured_data | ALL | public | is_admin() | — |
| session_policies | Anyone can read session policies | SELECT | public | TRUE | — |
| session_policies | Only admins can modify session policies | ALL | public | EXISTS ( SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| site_health_metrics | site_health_metrics_policy | ALL | public | auth.uid() = user_id | — |
| smart_event_suggestions | Users can manage their own event suggestions | ALL | public | auth.uid() = user_id | — |
| smart_event_suggestions | Users can view their own event suggestions | SELECT | public | auth.uid() = user_id | — |
| social_accounts | Service role full access | ALL | service_role | true | true |
| social_media_automation_settings | Admin access only for automation settings | ALL | public | auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'root_admin')) | — |
| social_media_schedules | Admins can manage social media schedules | ALL | public | EXISTS ( SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND user_role IN ('root_admin', 'admin') ) | — |
| sponsored_listing_links | Admins can read all sponsored links | SELECT | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| sponsored_listing_links | Admins full access to sponsored links | ALL | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| sponsored_listing_links | Users can insert own sponsored links | INSERT | public | — | EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = campaign_id AND campaigns.user_id = auth.uid()) |
| sponsored_listing_links | Users can read own sponsored links | SELECT | public | EXISTS (SELECT 1 FROM campaigns WHERE campaigns.id = sponsored_listing_links.campaign_id AND campaigns.user_id = auth.uid()) | — |
| storage.objects | Admins can manage all ad creatives | ALL | authenticated | bucket_id = 'ad-creatives' AND user_has_role_or_higher(auth.uid(), 'admin'::user_role) | — |
| storage.objects | Authenticated users can upload event photos | INSERT | public | — | bucket_id = 'event-photos' AND auth.uid() IS NOT NULL |
| storage.objects | Authenticated users can upload to media bucket | INSERT | authenticated | — | bucket_id = 'media' |
| storage.objects | Authenticated users can upload to videos bucket | INSERT | authenticated | — | bucket_id = 'videos' |
| storage.objects | Event photos are publicly accessible | SELECT | public | bucket_id = 'event-photos' | — |
| storage.objects | Public can view approved ads | SELECT | public | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT DISTINCT campaign_id::text FROM public.campaign_creatives WHERE is_approved = true ) | — |
| storage.objects | Public read access for event photos | SELECT | public | bucket_id = 'event-photos' | — |
| storage.objects | Public read access for media bucket | SELECT | public | bucket_id = 'media' | — |
| storage.objects | Public read access for thumbnails bucket | SELECT | public | bucket_id = 'thumbnails' | — |
| storage.objects | Public read access for videos bucket | SELECT | public | bucket_id = 'videos' | — |
| storage.objects | Review photos are publicly readable | SELECT | public | bucket_id = 'review-photos' | — |
| storage.objects | Service can manage thumbnails | ALL | service_role | bucket_id = 'thumbnails' | — |
| storage.objects | Team members can view campaign ads | SELECT | authenticated | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT DISTINCT c.id::text FROM public.campaigns c JOIN public.campaign_team_members ctm ON ctm.campaign_owner_id = c.user_id WHERE ctm.team_member_id = auth.uid() AND ctm.invitation_status = 'accepted' ) | — |
| storage.objects | Users can delete own ad creatives | DELETE | authenticated | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT id::text FROM public.campaigns WHERE user_id = auth.uid() ) | — |
| storage.objects | Users can delete their own event photos | DELETE | public | bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can delete their own media files | DELETE | authenticated | bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can delete their own video files | DELETE | authenticated | bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can manage their own uploads | ALL | public | bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can update own ad creatives | UPDATE | authenticated | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT id::text FROM public.campaigns WHERE user_id = auth.uid() ) | — |
| storage.objects | Users can update their own event photos | UPDATE | public | bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can update their own media files | UPDATE | authenticated | bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can update their own video files | UPDATE | authenticated | bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users can upload event photos | INSERT | public | — | bucket_id = 'event-photos' AND auth.uid()::text = (storage.foldername(name))[1] |
| storage.objects | Users can upload to own campaigns | INSERT | authenticated | — | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT id::text FROM public.campaigns WHERE user_id = auth.uid() ) |
| storage.objects | Users can view own ad creatives | SELECT | authenticated | bucket_id = 'ad-creatives' AND (storage.foldername(name))[1] IN ( SELECT id::text FROM public.campaigns WHERE user_id = auth.uid() ) | — |
| storage.objects | Users manage own review photos | ALL | public | bucket_id = 'review-photos' AND auth.uid()::text = (storage.foldername(name))[1] | — |
| storage.objects | Users upload own review photos | INSERT | public | — | bucket_id = 'review-photos' AND auth.uid()::text = (storage.foldername(name))[1] |
| subscription_events | subscription_events_admin_select | SELECT | authenticated | public.is_admin() | — |
| subscription_plans | Anyone can view subscription plans | SELECT | public | is_active = true | — |
| surprise_pick_outcomes | Users can insert their own surprise outcomes | INSERT | public | — | auth.uid() = user_id OR user_id IS NULL |
| surprise_pick_outcomes | Users can read their own surprise outcomes | SELECT | public | auth.uid() = user_id | — |
| swipe_interactions | Users can delete own swipes | DELETE | public | auth.uid() = user_id | — |
| swipe_interactions | Users can record own swipes | INSERT | public | — | auth.uid() = user_id |
| swipe_interactions | Users can view own swipes | SELECT | public | auth.uid() = user_id | — |
| swipe_session_participants | Anyone can join an active session | INSERT | public | — | EXISTS ( SELECT 1 FROM public.swipe_sessions s WHERE s.id = session_id AND s.status = 'active' AND s.expires_at > NOW() ) |
| swipe_session_participants | Anyone can read participants in active sessions | SELECT | public | true | — |
| swipe_sessions | Anyone can read swipe sessions by code | SELECT | public | true | — |
| swipe_sessions | Hosts insert their own session | INSERT | public | — | auth.uid() = host_user_id |
| swipe_sessions | Hosts update / end their own session | UPDATE | public | auth.uid() = host_user_id | auth.uid() = host_user_id |
| system_settings | Only admins can manage system settings | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| teams | Admin insert | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| teams | Admin update | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| teams | Public read access | SELECT | public | true | — |
| traffic_metrics | traffic_metrics_policy | ALL | public | auth.uid() = user_id | — |
| trails | Admin insert | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| trails | Admin update | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| trails | Public read access | SELECT | public | true | — |
| trending_config | Admin can read trending_config | SELECT | authenticated | is_admin() | — |
| trending_config | Admin can update trending_config | UPDATE | authenticated | is_admin() | — |
| trending_config | Service role full access | ALL | service_role | true | true |
| trending_config_history | Admin can read trending_config_history | SELECT | authenticated | is_admin() | — |
| trending_scores | Admins can view trending scores | SELECT | public | is_admin_or_root() | — |
| trending_scores_realtime | Everyone can read trending scores | SELECT | public | true | — |
| trending_scores_realtime | Service role can manage trending scores | ALL | public | auth.role() = 'service_role' | — |
| trip_plan_items | Users can manage own trip plan items | ALL | public | EXISTS ( SELECT 1 FROM public.trip_plans tp WHERE tp.id = trip_plan_id AND tp.user_id = auth.uid() ) | — |
| trip_plan_items | Users can view trip plan items | SELECT | public | EXISTS ( SELECT 1 FROM public.trip_plans tp WHERE tp.id = trip_plan_id AND (tp.user_id = auth.uid() OR tp.is_public = true) ) | — |
| trip_plans | Users can create own trip plans | INSERT | public | — | auth.uid() = user_id |
| trip_plans | Users can delete own trip plans | DELETE | public | auth.uid() = user_id | — |
| trip_plans | Users can update own trip plans | UPDATE | public | auth.uid() = user_id | — |
| trip_plans | Users can view own trip plans | SELECT | public | auth.uid() = user_id OR is_public = true | — |
| uptime_probes | uptime_probes_admin_read | SELECT | authenticated | EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| usage_events | Service role can manage all usage events | ALL | public | true | true |
| usage_events | Users can view own usage events | SELECT | public | auth.uid() = user_id | — |
| usage_quotas | Anyone can view usage quotas | SELECT | public | true | — |
| usage_quotas | Service role can manage usage quotas | ALL | public | true | true |
| user_activities | Service can manage activities | ALL | public | auth.role() = 'service_role' | — |
| user_activities | Users can view their own activities | SELECT | public | auth.uid() = user_id | — |
| user_analytics | Admins can view all analytics | SELECT | public | is_admin_or_root() | — |
| user_badges | Service can manage user badges | ALL | public | auth.role() = 'service_role' | — |
| user_badges | Users can view their own badges | SELECT | public | auth.uid() = user_id | — |
| user_calendars | Users can manage their own calendars | ALL | public | auth.uid() = user_id | — |
| user_calendars | Users can view their own calendars | SELECT | public | auth.uid() = user_id | — |
| user_challenge_participation | Users can join challenges | INSERT | public | — | auth.uid() = user_id |
| user_challenge_participation | Users can update their own participation | UPDATE | public | auth.uid() = user_id | — |
| user_challenge_participation | Users can view their own participation | SELECT | public | auth.uid() = user_id | — |
| user_email_preferences | Users can insert their own email preferences | INSERT | public | — | auth.uid() = user_id |
| user_email_preferences | Users can update their own email preferences | UPDATE | public | auth.uid() = user_id | — |
| user_email_preferences | Users can view their own email preferences | SELECT | public | auth.uid() = user_id | — |
| user_event_reminders | Service role full access | ALL | public | auth.jwt() ->> 'role' = 'service_role' | — |
| user_event_reminders | Users can delete own reminders | DELETE | public | auth.uid() = user_id | — |
| user_event_reminders | Users can insert own reminders | INSERT | public | — | auth.uid() = user_id |
| user_event_reminders | Users can update own reminders | UPDATE | public | auth.uid() = user_id | — |
| user_event_reminders | Users can view own reminders | SELECT | public | auth.uid() = user_id | — |
| user_follows | Anyone can view follows | SELECT | public | true | — |
| user_follows | Users can follow others | INSERT | public | — | auth.uid() = follower_id |
| user_follows | Users can unfollow | DELETE | public | auth.uid() = follower_id | — |
| user_friends | Users can create friend requests | INSERT | public | — | auth.uid() = user_id |
| user_friends | Users can delete their own friendships | DELETE | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can respond to friend requests | UPDATE | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can send friend requests | INSERT | public | — | auth.uid() = requested_by AND (auth.uid() = user_id OR auth.uid() = friend_id) |
| user_friends | Users can update their friend relationships | UPDATE | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can update their own friend requests | UPDATE | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can view their own friends and incoming requests | SELECT | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can view their own friends and pending requests | SELECT | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_friends | Users can view their own friendships | SELECT | public | auth.uid() = user_id OR auth.uid() = friend_id | — |
| user_interactions_enhanced | Admins can insert enhanced analytics | INSERT | public | — | is_admin_or_root() |
| user_interactions_enhanced | Admins can view enhanced analytics | SELECT | public | is_admin_or_root() | — |
| user_interactions_enhanced | Service role can manage enhanced analytics | ALL | public | auth.role() = 'service_role' | — |
| user_interactions_enhanced | Users can insert their own enhanced analytics | INSERT | public | — | auth.uid() = user_id OR auth.uid() IS NULL |
| user_journeys | Service role can manage user journeys | ALL | public | auth.role() = 'service_role' | — |
| user_journeys | Users can view their own journeys | SELECT | public | auth.uid() = user_id | — |
| user_locations | Anyone can view public locations | SELECT | public | is_public = true | — |
| user_locations | Users can manage their own location | ALL | public | auth.uid() = user_id | — |
| user_locations | Users can view public locations | SELECT | public | is_public = true OR auth.uid() = user_id | — |
| user_locations | Users can view public locations and their own | SELECT | public | is_public = true OR auth.uid() = user_id | — |
| user_oauth_tokens | user_oauth_tokens_policy | ALL | public | auth.uid() = user_id | — |
| user_preference_profiles | Anonymous users can manage session preferences | ALL | public | auth.uid() IS NULL AND user_id IS NULL | — |
| user_preference_profiles | Service role can manage preference profiles | ALL | public | auth.role() = 'service_role' | — |
| user_preference_profiles | Users can manage their own preferences | ALL | public | auth.uid() = user_id | — |
| user_reputation | Admins can view all reputation | SELECT | public | is_admin_or_root() | — |
| user_roles | user_roles_deny_client_delete | DELETE | authenticated, anon | false | — |
| user_roles | user_roles_deny_client_insert | INSERT | authenticated, anon | — | false |
| user_roles | user_roles_deny_client_update | UPDATE | authenticated, anon | false | false |
| user_roles | user_roles_select_own_or_admin | SELECT | authenticated | auth.uid() = user_id OR public.is_admin() | — |
| user_sessions | Users can revoke own sessions | DELETE | public | auth.uid() = user_id | — |
| user_sessions | Users can update own sessions | UPDATE | public | auth.uid() = user_id | — |
| user_sessions | Users can view own sessions | SELECT | public | auth.uid() = user_id | — |
| user_submitted_events | Admins can update all submissions | UPDATE | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| user_submitted_events | Admins can view all submissions | SELECT | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | — |
| user_submitted_events | Admins can view submitted events | ALL | public | is_admin_or_root() | — |
| user_submitted_events | Users can insert own submissions | INSERT | public | — | auth.uid() = user_id |
| user_submitted_events | Users can update own pending submissions | UPDATE | public | auth.uid() = user_id AND status = 'pending' | — |
| user_submitted_events | Users can view own submissions | SELECT | public | auth.uid() = user_id | — |
| user_subscriptions | Admins can manage subscriptions | ALL | public | EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' ) | — |
| user_subscriptions | Service role can manage all subscriptions | ALL | public | true | true |
| user_subscriptions | Users can view own subscription | SELECT | public | auth.uid() = user_id | — |
| venues | Admin insert | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| venues | Admin update | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| venues | Public read access | SELECT | public | true | — |
| votes | Authenticated users can vote | INSERT | public | — | auth.uid() = user_id |
| votes | Public read votes | SELECT | public | true | — |
| votes | Users can delete own votes | DELETE | public | auth.uid() = user_id | — |
| voting_categories | Admin insert voting categories | INSERT | public | — | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) |
| voting_categories | Admin update voting categories | UPDATE | public | EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')) | — |
| voting_categories | Public read voting categories | SELECT | public | true | — |
| web_vitals | web_vitals_admin_read | SELECT | authenticated | EXISTS ( SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'root_admin') ) | — |
| web_vitals | web_vitals_insert_any | INSERT | public | — | true |
| weekend_guides | Authenticated users can read weekend guides | SELECT | authenticated | true | — |
| weekend_guides | Only admins can modify weekend guides | ALL | authenticated | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin') ) |
| weekend_guides | Weekend guides are publicly readable | SELECT | public | true | — |
| weekly_digest_log | Users can view their own digest log | SELECT | public | auth.uid() = user_id | — |
| whitelisted_ips | Root admins can manage IP whitelist | ALL | public | EXISTS ( SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'root_admin' ) | — |

## Needs human decision

Anything in §1/§2 that a shipped iOS/Android binary might rely on must NOT be tightened in a single release — stage it via the CLAUDE.md deprecation flow. Items confirmed safe (web-only or additive) are fixed in the accompanying migration.
