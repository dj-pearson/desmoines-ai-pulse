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
