/**
 * Who a campaign notification may be sent to, and by whom (WEB-ADS-013 AC4).
 *
 * Extracted from index.ts because that file imports Stripe-adjacent modules
 * from esm.sh and cannot be loaded in a test without the network. The rules
 * below are the whole authorization surface of this endpoint, and they are the
 * part worth pinning: everything else is email rendering.
 *
 * The rules, in order, because the order IS the behaviour:
 *   1. No Authorization header, or a token that resolves to no user -> 401.
 *      This is the one the story asks for: an unauthenticated call cannot
 *      notify anybody.
 *   2. Missing notificationType or campaignId -> 400. Checked before
 *      authorization deliberately: a malformed body is not a permission
 *      problem, and answering 403 to it tells the caller less than nothing.
 *   3. An admin may notify about any campaign.
 *   4. A non-admin may notify only about a campaign they own. Not the
 *      recipient - the CAMPAIGN. An advertiser raising an admin notification
 *      about their own creative upload is the intended path.
 *   5. notifyAdmins fans out to every admin, resolved server-side with the
 *      service role. The browser used to resolve that list itself by reading
 *      other users' roles out of `profiles`.
 */

export type NotificationDecision =
  | { kind: "unauthenticated"; status: 401; error: string }
  | { kind: "invalid_request"; status: 400; error: string }
  | { kind: "forbidden"; status: 403; error: string }
  | { kind: "notify_admins" }
  | { kind: "notify_recipient" };

export interface NotificationRequest {
  hasAuthHeader: boolean;
  /** The user the bearer token resolved to, or null if it resolved to none. */
  userId: string | null;
  isAdmin: boolean;
  /** The campaign's owner, or null when the campaign does not exist. */
  campaignOwnerId: string | null;
  notificationType?: string | null;
  campaignId?: string | null;
  notifyAdmins?: boolean;
}

export function decideNotification(req: NotificationRequest): NotificationDecision {
  if (!req.hasAuthHeader) {
    return { kind: "unauthenticated", status: 401, error: "Authorization required" };
  }
  if (!req.userId) {
    return { kind: "unauthenticated", status: 401, error: "Invalid authentication" };
  }
  if (!req.notificationType || !req.campaignId) {
    return {
      kind: "invalid_request",
      status: 400,
      error: "notificationType and campaignId are required",
    };
  }
  if (!req.isAdmin && req.campaignOwnerId !== req.userId) {
    return {
      kind: "forbidden",
      status: 403,
      error: "Forbidden: not authorized for this campaign",
    };
  }
  return req.notifyAdmins ? { kind: "notify_admins" } : { kind: "notify_recipient" };
}

// ---------------------------------------------------------------------------
// What is sent, and to whom (business plan WP4 item 2).
//
// decideNotification answers "may this caller notify about this campaign". It
// used to be the only check, and the recipient, title and body all came from
// the request. So owning ANY campaign - a free draft is enough - let a caller
// send any text, from the site's noreply address, to any inbox: put a
// stranger's address in recipientEmail and a phishing message in `message`.
//
// For a non-admin, everything below comes from the campaign row and the
// notification type: the recipient is the campaign's owner, the name is the
// row's, and the words are built here from notificationType. The body's
// recipientUserId, recipientEmail, campaignName, title, message and metadata
// are ignored. An admin may still address the campaign's owner or another
// user (the admin screens pass recipientUserId), and may pass the few metadata
// values the templates use, but not free text for the title or body.
// ---------------------------------------------------------------------------

export const CAMPAIGN_NOTIFICATION_TYPES = [
  "campaign_created",
  "payment_received",
  "creative_uploaded",
  "creative_approved",
  "creative_rejected",
  "campaign_activated",
  "campaign_expiring_soon",
  "campaign_completed",
  "campaign_rejected",
  "campaign_refunded",
  "creative_deadline_warning",
] as const;

export type CampaignNotificationType = (typeof CAMPAIGN_NOTIFICATION_TYPES)[number];

/** The metadata the templates read. Nothing else from the request is used. */
export interface NotificationMetadata {
  amount?: number;
  reason?: string;
  daysRemaining?: number;
  startDate?: string;
}

const MAX_REASON_LENGTH = 500;

/**
 * Keep only the values a template uses, each checked for shape. Anything else
 * a caller sends is dropped, so the stored row's metadata cannot carry text
 * the in-app view might render.
 */
export function sanitizeMetadata(raw: unknown): NotificationMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: NotificationMetadata = {};

  const amount = typeof src.amount === "string" ? Number(src.amount) : src.amount;
  if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
    out.amount = Math.round(amount * 100) / 100;
  }
  if (typeof src.reason === "string") {
    // eslint-disable-next-line no-control-regex
    const reason = src.reason.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    if (reason) out.reason = reason.slice(0, MAX_REASON_LENGTH);
  }
  const days = typeof src.daysRemaining === "string" ? Number(src.daysRemaining) : src.daysRemaining;
  if (typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 366) {
    out.daysRemaining = days;
  }
  if (typeof src.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(src.startDate)) {
    out.startDate = src.startDate;
  }
  return out;
}

function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Title and body for a notification, from its type. The only place they are written. */
export function buildNotificationText(
  type: string,
  campaignName: string,
  metadata: NotificationMetadata = {},
): { title: string; message: string } {
  const name = campaignName;
  switch (type) {
    case "campaign_created":
      return {
        title: `New campaign: ${name}`,
        message: `A new advertising campaign "${name}" has been created and is awaiting payment.`,
      };
    case "payment_received":
      return {
        title: `Payment confirmed: ${name}`,
        message: metadata.amount !== undefined
          ? `Payment of ${formatAmount(metadata.amount)} has been received for "${name}". You can now upload your ad creatives.`
          : `Payment has been received for "${name}". You can now upload your ad creatives.`,
      };
    case "creative_uploaded":
      return {
        title: `Creative ready for review: ${name}`,
        message: `New ad creatives have been uploaded for "${name}" and are ready for review.`,
      };
    case "creative_approved":
      return {
        title: `Creative approved: ${name}`,
        message: `Your ad creative for "${name}" has been approved. It goes live on the campaign's start date.`,
      };
    case "creative_rejected":
      return {
        title: `Creative needs changes: ${name}`,
        message: `Your ad creative for "${name}" needs changes. Reason: ${metadata.reason ?? "see the campaign page"}. Please upload a revised version.`,
      };
    case "campaign_activated":
      return {
        title: `Campaign live: ${name}`,
        message: `Your campaign "${name}" is now live. Impressions and clicks are on its analytics page.`,
      };
    case "campaign_expiring_soon":
      return {
        title: `Campaign ending soon: ${name}`,
        message: metadata.daysRemaining !== undefined
          ? `Your campaign "${name}" ends in ${metadata.daysRemaining} day${metadata.daysRemaining === 1 ? "" : "s"}. You can renew it from the campaign page.`
          : `Your campaign "${name}" ends soon. You can renew it from the campaign page.`,
      };
    case "campaign_completed":
      return {
        title: `Campaign completed: ${name}`,
        message: `Your campaign "${name}" has ended. Its final numbers are on the analytics page.`,
      };
    case "campaign_rejected":
      return {
        title: `Campaign not approved: ${name}`,
        message: `Your campaign "${name}" was not approved. Reason: ${metadata.reason ?? "see the campaign page"}. Contact us if you have questions.`,
      };
    case "campaign_refunded":
      return {
        title: `Refund processed: ${name}`,
        message: metadata.amount !== undefined
          ? `A refund of ${formatAmount(metadata.amount)} has been processed for "${name}".`
          : `A refund has been processed for "${name}".`,
      };
    case "creative_deadline_warning":
      return {
        title: `Upload creatives for ${name}`,
        message: metadata.startDate
          ? `Your campaign "${name}" starts on ${metadata.startDate} and still needs its creatives. Upload them so it can start on time.`
          : `Your campaign "${name}" starts soon and still needs its creatives. Upload them so it can start on time.`,
      };
    default:
      return {
        title: `Campaign update: ${name}`,
        message: `There's an update on your campaign "${name}". Check your dashboard for details.`,
      };
  }
}

export interface NotificationBody {
  recipientUserId?: unknown;
  recipientEmail?: unknown;
  metadata?: unknown;
}

export interface NotificationCampaign {
  id: string;
  user_id: string;
  name: string | null;
}

export interface NotificationPlan {
  /** Whose in-app row this is, and whose auth email the mail goes to. */
  recipientUserId: string;
  /** Only an admin may name an address directly; null means "look up recipientUserId". */
  recipientEmail: string | null;
  campaignName: string;
  title: string;
  message: string;
  metadata: NotificationMetadata;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/**
 * Who a notify_recipient decision goes to and what it says. Call only after
 * decideNotification returned notify_recipient or notify_admins.
 */
export function planNotification(input: {
  isAdmin: boolean;
  notificationType: string;
  campaign: NotificationCampaign;
  body: NotificationBody;
}): NotificationPlan {
  const { isAdmin, notificationType, campaign, body } = input;
  const campaignName = (campaign.name ?? "").trim() || "your campaign";
  const metadata = isAdmin ? sanitizeMetadata(body.metadata) : {};
  const { title, message } = buildNotificationText(notificationType, campaignName, metadata);

  let recipientUserId = campaign.user_id;
  let recipientEmail: string | null = null;
  if (isAdmin) {
    if (typeof body.recipientUserId === "string" && UUID_RE.test(body.recipientUserId)) {
      recipientUserId = body.recipientUserId;
    }
    if (typeof body.recipientEmail === "string" && EMAIL_RE.test(body.recipientEmail.trim())) {
      recipientEmail = body.recipientEmail.trim();
    }
  }

  return { recipientUserId, recipientEmail, campaignName, title, message, metadata };
}
