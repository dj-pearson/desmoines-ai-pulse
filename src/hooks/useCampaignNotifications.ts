import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('CampaignNotifications');

/**
 * Campaign notification types sent at each lifecycle stage.
 * Each notification targets either the advertiser, admin, or both.
 */
type NotificationType =
  | 'campaign_created'           // → admin: new campaign submitted
  | 'payment_received'           // → admin + advertiser: payment confirmed
  | 'creative_uploaded'          // → admin: creative ready for review
  | 'creative_approved'          // → advertiser: creative approved
  | 'creative_rejected'          // → advertiser: creative rejected with reason
  | 'campaign_activated'         // → advertiser: campaign is now live
  | 'campaign_expiring_soon'     // → advertiser: campaign expires in 3 days
  | 'campaign_completed'         // → advertiser: campaign has ended
  | 'campaign_rejected'          // → advertiser: campaign rejected by admin
  | 'campaign_refunded'          // → advertiser: refund processed
  | 'creative_deadline_warning'; // → advertiser: upload creatives before deadline

interface NotificationPayload {
  campaignId: string;
  campaignName: string;
  recipientUserId?: string;
  recipientEmail?: string;
  notificationType: NotificationType;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Creates a campaign notification record and triggers appropriate
 * delivery channels (in-app toast, stored notification, email via edge function).
 */
export async function sendCampaignNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    // No insert here. campaign_notifications has SELECT and UPDATE policies for
    // the recipient and ALL for service_role, and NO insert policy for
    // authenticated - so this call was rejected by RLS every single time and
    // only log.warn'd about it ("Table may not exist yet"). The row is written
    // by send-campaign-notification below, with the service role. WEB-ADS-013.

    // Attempt to send email notification via edge function
    try {
      await supabase.functions.invoke('send-campaign-notification', {
        body: {
          recipientUserId: payload.recipientUserId,
          recipientEmail: payload.recipientEmail,
          notificationType: payload.notificationType,
          campaignId: payload.campaignId,
          campaignName: payload.campaignName,
          title: getNotificationTitle(payload.notificationType, payload.campaignName),
          message: getNotificationMessage(payload.notificationType, payload.campaignName, payload.metadata),
          metadata: payload.metadata,
        },
      });
    } catch {
      // Email delivery is best-effort; don't fail the workflow
      log.warn('sendNotification', 'Email delivery skipped (edge function not available)');
    }

    return true;
  } catch (error) {
    log.error('sendNotification', 'Failed to send notification', { error });
    return false;
  }
}

/**
 * Sends notification to all admin users.
 */
export async function notifyAdmins(
  campaignId: string,
  campaignName: string,
  notificationType: NotificationType,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  // The admin list is resolved SERVER-SIDE (WEB-ADS-013). This used to select
  // ids from `profiles` where user_role was admin or root_admin - a read of
  // other people's roles, issued from the browser by whoever was filling in an
  // advertising form. send-campaign-notification does it with the service role
  // now, behind the same authorization it already applied: the caller must be
  // an admin or own the campaign.
  try {
    const { error } = await supabase.functions.invoke('send-campaign-notification', {
      body: {
        notifyAdmins: true,
        campaignId,
        campaignName,
        notificationType,
        title: getNotificationTitle(notificationType, campaignName),
        message: getNotificationMessage(notificationType, campaignName, metadata),
        metadata,
      },
    });
    if (error) {
      log.warn('notifyAdmins', 'Admin notification not delivered', { message: error.message });
    }
  } catch (error) {
    log.error('notifyAdmins', 'Failed to notify admins', { error });
  }
}

/**
 * Sends notification to the campaign owner (advertiser).
 */
export async function notifyAdvertiser(
  campaignId: string,
  campaignName: string,
  advertiserId: string,
  notificationType: NotificationType,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  await sendCampaignNotification({
    campaignId,
    campaignName,
    recipientUserId: advertiserId,
    notificationType,
    metadata,
  });
}

function getNotificationTitle(type: NotificationType, campaignName: string): string {
  switch (type) {
    case 'campaign_created':
      return `New Campaign: ${campaignName}`;
    case 'payment_received':
      return `Payment Confirmed: ${campaignName}`;
    case 'creative_uploaded':
      return `Creative Ready for Review: ${campaignName}`;
    case 'creative_approved':
      return `Creative Approved: ${campaignName}`;
    case 'creative_rejected':
      return `Creative Needs Changes: ${campaignName}`;
    case 'campaign_activated':
      return `Campaign Live: ${campaignName}`;
    case 'campaign_expiring_soon':
      return `Campaign Expiring Soon: ${campaignName}`;
    case 'campaign_completed':
      return `Campaign Completed: ${campaignName}`;
    case 'campaign_rejected':
      return `Campaign Rejected: ${campaignName}`;
    case 'campaign_refunded':
      return `Refund Processed: ${campaignName}`;
    case 'creative_deadline_warning':
      return `Upload Deadline Approaching: ${campaignName}`;
    default:
      return `Campaign Update: ${campaignName}`;
  }
}

function getNotificationMessage(
  type: NotificationType,
  campaignName: string,
  metadata?: Record<string, string | number | boolean>
): string {
  switch (type) {
    case 'campaign_created':
      return `A new advertising campaign "${campaignName}" has been created and is awaiting payment.`;
    case 'payment_received':
      return `Payment of $${metadata?.amount || '0'} has been received for campaign "${campaignName}". The advertiser can now upload creatives.`;
    case 'creative_uploaded':
      return `New ad creatives have been uploaded for "${campaignName}" and are ready for your review.`;
    case 'creative_approved':
      return `Your ad creative for "${campaignName}" has been approved! Your ad will go live on the scheduled start date.`;
    case 'creative_rejected':
      return `Your ad creative for "${campaignName}" needs changes. Reason: ${metadata?.reason || 'See campaign details'}. Please upload a revised version.`;
    case 'campaign_activated':
      return `Your campaign "${campaignName}" is now live! Your ads are being displayed to visitors. Track performance in your analytics dashboard.`;
    case 'campaign_expiring_soon':
      return `Your campaign "${campaignName}" will end in ${metadata?.daysRemaining || 3} days. Consider renewing to maintain your ad visibility.`;
    case 'campaign_completed':
      return `Your campaign "${campaignName}" has ended. View your final performance report in the analytics dashboard.`;
    case 'campaign_rejected':
      return `Your campaign "${campaignName}" has been rejected. Reason: ${metadata?.reason || 'See campaign details'}. Contact support for more information.`;
    case 'campaign_refunded':
      return `A refund of $${metadata?.amount || '0'} has been processed for campaign "${campaignName}". It may take 5-10 business days to appear on your statement.`;
    case 'creative_deadline_warning':
      return `Your campaign "${campaignName}" starts on ${metadata?.startDate || 'soon'} but you haven't uploaded all your creatives yet. Please upload them to ensure your campaign starts on time.`;
    default:
      return `There's an update on your campaign "${campaignName}". Check your dashboard for details.`;
  }
}
