/**
 * notify-business-claim (WEB-ADS-047)
 *
 * Emails the claimant when an admin approves, rejects or revokes a business
 * claim. The admin screen calls it right after review_business_claim or
 * revoke_business_claim has committed, the same shape as
 * notify-event-submission after an event decision (src/lib/submissionNotify.ts).
 *
 * Request: POST { claimId: uuid, decision: "approved" | "rejected" | "revoked" }
 * Response: { sent: boolean, reason?: string }
 *
 * NOTHING THE CALLER SENDS DECIDES WHO IS MAILED OR WHAT IT SAYS. The
 * recipient is the claiming account's confirmed address from Supabase Auth, the
 * listing name comes from the listing row, and the decision must match the
 * claim's current state (decisionMatchesClaim), so a stale or forged call
 * cannot tell a pending claimant they were approved.
 *
 * Admins and machine callers only (requireAdminOrApiKey).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { adminAlertEmail, sendEmail } from "../_shared/email.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import {
  buildClaimDecisionEmail,
  CLAIM_DECISIONS,
  type ClaimDecision,
  decisionMatchesClaim,
} from "../_shared/businessClaims.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LISTING_TABLE = {
  restaurant: "restaurants",
  attraction: "attractions",
  venue: "known_venues",
} as const;

type ListingType = keyof typeof LISTING_TABLE;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // One mail per admin decision; 60 in 15 minutes is far above a person
  // working a queue and still stops a loop.
  const rateLimit = checkRateLimit(req, { max: 60, endpoint: "notify-business-claim" });
  if (!rateLimit.success) return rateLimit.response!;

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
  } catch {
    // not JSON; validated below
  }
  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  const decision = body.decision as ClaimDecision;
  if (!UUID_RE.test(claimId) || !CLAIM_DECISIONS.includes(decision)) {
    return json({ error: "claimId (uuid) and decision (approved, rejected or revoked) are required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: claim, error: claimError } = await supabase
    .from("business_claims")
    .select("id, user_id, listing_type, listing_id, status, revoked_at")
    .eq("id", claimId)
    .maybeSingle();
  if (claimError) {
    console.error("[notify-business-claim] claim lookup failed:", claimError.message);
    return json({ error: "Could not read the claim" }, 503);
  }
  if (!claim) return json({ error: "No such claim" }, 404);
  if (!decisionMatchesClaim(decision, claim)) {
    return json({ error: `The claim is ${claim.status}${claim.revoked_at ? " (revoked)" : ""}, not ${decision}` }, 409);
  }

  const listingType = claim.listing_type as ListingType;
  let listingName = "";
  const table = LISTING_TABLE[listingType];
  if (table) {
    const { data: listing, error: listingError } = await supabase
      .from(table)
      .select("name")
      .eq("id", claim.listing_id)
      .maybeSingle();
    // A missing name is not worth losing the mail over; the copy falls back
    // to "your restaurant".
    if (listingError) console.warn("[notify-business-claim] listing name lookup failed:", listingError.message);
    listingName = (listing?.name as string | undefined) ?? "";
  }

  // The claiming account's address, and only when Auth says it is confirmed.
  const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(claim.user_id);
  if (ownerError) {
    console.error("[notify-business-claim] claimant lookup failed:", ownerError.message);
    return json({ error: "Could not read the claimant" }, 503);
  }
  const to = owner?.user?.email?.trim();
  if (!to) return json({ sent: false, reason: "claimant has no email address" });
  if (!owner.user.email_confirmed_at) return json({ sent: false, reason: "claimant email is not confirmed" });

  const email = buildClaimDecisionEmail({ decision, listingName, listingType, siteUrl: getSiteUrl() });
  const result = await sendEmail(
    {
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      category: "transactional",
      template: `business_claim_${decision}`,
      replyTo: adminAlertEmail(),
      userId: claim.user_id,
      ref: { type: "business_claim", id: claim.id },
    },
    { supabase },
  );

  if (!result.ok) return json({ sent: false, reason: result.error ?? "send failed" });
  return json({ sent: true });
});
