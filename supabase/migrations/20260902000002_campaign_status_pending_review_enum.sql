-- WEB-ADS-004 (part 1 of 2): campaign_status is missing two labels the code
-- already writes and reads.
--
-- campaign_status shipped as draft, pending_payment, pending_creative, active,
-- completed, cancelled, rejected, refunded. The web client has written
-- 'pending_review' since useAdminCampaigns.approveCreative was built (a
-- campaign approved before its start date parks there), AdminCampaigns,
-- CampaignDashboard and CampaignDetail render it, and
-- campaign-creative-review treats 'suspended' as a standing failure. Neither
-- label exists, so the approve click threw 22P02 AFTER is_approved = true had
-- already been committed, and the campaign was stuck with every creative
-- approved and a stale status.
--
-- Additive only (CLAUDE.md: new enum value is always safe in one release). No
-- shipped client is broken by an extra label they never see unless a row
-- carries it, and the rows that carry it are exactly the ones the web client
-- already expected.
--
-- Own file on purpose: a value added by ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction, and every migration file is one transaction.
-- 20260902000003 (the lifecycle schedule and the atomic approval RPC) is the
-- first thing that selects on the new label.

ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE public.campaign_status ADD VALUE IF NOT EXISTS 'suspended';
