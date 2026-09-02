/**
 * Delete User Account Edge Function
 *
 * Two-step account deletion with confirmation token (SEC-025):
 *
 * Step 1: POST { action: "request" }
 *   - Generates a confirmation token, stores it in account_deletion_tokens table
 *   - Returns the token (client should send it to user's email or display for confirmation)
 *   - Token expires after 15 minutes
 *
 * Step 2: POST { action: "confirm", confirmation_token: "..." }
 *   - Validates the token against stored value and expiry
 *   - Proceeds with account deletion if valid
 *
 * Legacy: POST without an action field is treated as direct deletion, for
 * backwards compatibility with shipped iOS/Android binaries that predate the
 * two-step flow. See the branch at the bottom of the handler for the removal
 * condition (XPLAT-001).
 *
 * Cancels web billing BEFORE erasing anything (WEB-AUTH-006). user_subscriptions
 * is the only mapping to the Stripe customer, and it is in PURGE_TABLES, so a
 * cancellation attempted after the purge has nothing to cancel. A Stripe
 * failure REFUSES the deletion with 409 rather than leaving a live charge
 * behind an account that no longer exists. Store subscriptions (ios/android)
 * cannot be ended server-side and are returned in
 * store_subscriptions_still_active so the client can say so.
 *
 * Permanently deletes every table listed in _shared/userDataTables.ts
 * (PURGE_TABLES), plus newsletter_subscribers (by email) and auth.users.
 * Tables kept on purpose, each with its stated basis, are RETAINED_TABLES in
 * the same file. Both lists are covered by _tests/user-data-tables.test.ts.
 *
 * Also purges uploaded files from every user-writable storage bucket
 * (WEB-LEGAL-003). See _shared/purgeUserStorage.ts for the bucket list and for
 * why ad-creatives is excluded.
 *
 * GDPR Art. 17 (right to erasure) — the delete set is kept aligned with every
 * table that stores user-identifiable data. Records with an independent legal
 * basis for retention (e.g. append-only consent_records kept as proof of
 * consent, invoices kept for tax) are intentionally NOT purged here.
 *
 * Required by Apple App Store Review for apps that support account creation.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { writeAuditLog, auditIp } from "../_shared/auditLog.ts";
import { purgeUserStorage, type BucketPurgeResult } from "../_shared/purgeUserStorage.ts";
import { PURGE_TABLES } from "../_shared/userDataTables.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import {
  cancelBillingBeforeErasure,
  type BillingClient,
} from "../_shared/cancelBillingBeforeErasure.ts";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a cryptographically random token
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Irreversibly erase the account. Shared by the confirmed two-step flow and the
 * legacy no-body flow so the two can never drift in what they delete.
 */
async function performDeletion(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  user: any,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const userId = user.id;

  // WEB-AUTH-006. STOP THE BILLING FIRST.
  //
  // user_subscriptions is in PURGE_TABLES, and that row is the ONLY mapping
  // from this user to their Stripe customer and subscription. This function
  // used to delete it without ever calling Stripe -- `grep -ci stripe` returned
  // 0 -- so the charge kept recurring and the webhook that would react to a
  // cancellation could no longer find a user to react for. The account was
  // gone; the money was not.
  //
  // This has to run BEFORE the purge loop, and not merely "early": after the
  // loop there is nothing left to read the subscription id from, and the only
  // remaining way to find the customer is a search by email, which the erasure
  // has also just removed.
  const { data: subscriptionRows } = await supabase
    .from("user_subscriptions")
    .select("platform, status, stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripe: BillingClient | null = stripeKey
    ? (new Stripe(stripeKey, { apiVersion: "2023-10-16" }) as unknown as BillingClient)
    : null;

  const billing = await cancelBillingBeforeErasure(stripe, subscriptionRows ?? []);

  if (billing.error) {
    // REFUSE, do not continue. Erasing the account here would leave an active
    // charge with nothing behind it and no way to trace it back.
    console.error("Billing teardown failed, refusing deletion:", billing.error);
    return new Response(
      JSON.stringify({
        error: billing.error,
        code: "BILLING_TEARDOWN_FAILED",
        // The user's own subscription is still live, so tell them where it is
        // rather than leaving them to find out from a statement.
        manage_subscription_url: "/profile?tab=subscription",
      }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Delete user data in dependency order. The list, and the tables deliberately
  // kept with their basis, live in _shared/userDataTables.ts, which is covered
  // by a test that fails if a user_id table is left unclassified (WEB-LEGAL-004).
  const tableFailures: { table: string; code?: string; message: string }[] = [];

  for (const table of PURGE_TABLES) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId);

    if (!error) continue;

    // Keep going so one failure never leaves the erasure half-done, but record
    // it. The previous version warned and moved on, which made a delete against
    // a table that does not exist (42P01) indistinguishable from a successful
    // one - and console.* is stripped from production builds, so the warning did
    // not even reach a log.
    tableFailures.push({ table, code: error.code, message: error.message });

    if (error.code === "42P01") {
      console.error(
        `Erasure targeted a non-existent table "${table}". The delete list has ` +
        `drifted from the schema; see _shared/userDataTables.ts.`,
      );
    } else {
      console.error(`Failed deleting from ${table} (${error.code}):`, error.message);
    }
  }

  // Newsletter subscriptions are keyed by email, not user_id. Remove any
  // subscription tied to this account's email so marketing data is purged too.
  if (user.email) {
    const { error: newsletterError } = await supabase
      .from("newsletter_subscribers")
      .delete()
      .eq("email", user.email.toLowerCase());
    if (newsletterError) {
      tableFailures.push({
        table: "newsletter_subscribers",
        code: newsletterError.code,
        message: newsletterError.message,
      });
      console.error(
        "Failed deleting from newsletter_subscribers:",
        newsletterError.message,
      );
    }
  }

  // Purge uploaded files (WEB-LEGAL-003). Runs BEFORE the auth user is deleted:
  // the service-role client works either way, but the audit entry below should
  // be written while the subject is still resolvable. Every upload bucket is
  // public, so a file left here stays fetchable by URL forever.
  const storageResults: BucketPurgeResult[] = await purgeUserStorage(supabase, userId);
  const storageRemoved = storageResults.reduce((n, r) => n + r.removed, 0);
  const storageFailures = storageResults.filter((r) => r.error);
  for (const failure of storageFailures) {
    console.warn(`Warning purging storage bucket ${failure.bucket}:`, failure.error);
  }

  // Delete the auth user entry
  const { error: deleteAuthError } =
    await supabase.auth.admin.deleteUser(userId);

  if (deleteAuthError) {
    console.error("Error deleting auth user:", deleteAuthError.message);
    return new Response(
      JSON.stringify({
        error: "Failed to delete authentication record. Please contact support.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log(`Successfully deleted account for user: ${userId}`);

  await writeAuditLog(supabase, {
    eventType: "account_deletion",
    actorId: userId,
    action: "delete_account",
    resource: "profiles",
    severity: "high",
    ipAddress: auditIp(req),
    userAgent: req.headers.get("user-agent"),
    details: {
      target_user_id: userId,
      storage_files_removed: storageRemoved,
      storage_buckets: storageResults,
      tables_attempted: PURGE_TABLES.length,
      table_failures: tableFailures,
      stripe_subscriptions_cancelled: billing.cancelled,
      stripe_customers_deleted: billing.customersDeleted,
      store_subscriptions_left_active: billing.storeSubscriptions,
    },
  });

  return new Response(
    JSON.stringify({
      // The auth record is gone, so the account is unrecoverable either way and
      // the client should still sign out. But do not claim a clean erasure when
      // rows or files were left behind - reporting success regardless is what
      // hid this for so long.
      success: true,
      complete: tableFailures.length === 0 && storageFailures.length === 0,
      storage_files_removed: storageRemoved,
      // Additive fields; older clients ignore what they do not read.
      subscriptions_cancelled: billing.cancelled.length,
      // AC3. An App Store or Play subscription CANNOT be cancelled from a
      // server -- Apple and Google own it. Saying nothing would let the user
      // believe deleting the account stopped the charge, which is the same
      // failure this story is about, one platform over.
      store_subscriptions_still_active: billing.storeSubscriptions,
      ...(storageFailures.length > 0
        ? { storage_incomplete: storageFailures.map((f) => f.bucket) }
        : {}),
      ...(tableFailures.length > 0
        ? { tables_incomplete: tableFailures.map((f) => f.table) }
        : {}),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userId = user.id;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { action, confirmation_token } = body;

    // Step 1: Request deletion — generate and store confirmation token
    if (action === "request") {
      const confirmationToken = generateToken();
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();

      // Delete any existing tokens for this user
      await supabase
        .from("account_deletion_tokens")
        .delete()
        .eq("user_id", userId);

      // Store the new token
      const { error: insertError } = await supabase
        .from("account_deletion_tokens")
        .insert({
          user_id: userId,
          token: confirmationToken,
          expires_at: expiresAt,
        });

      if (insertError) {
        // Table may not exist yet — log and return guidance
        console.error("Failed to store deletion token:", insertError.message);
        return new Response(
          JSON.stringify({
            error: "Deletion confirmation service unavailable. Please contact support.",
          }),
          {
            status: 503,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log(`Deletion token generated for user: ${userId}, expires: ${expiresAt}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Deletion confirmation token generated. Use it within 15 minutes to confirm account deletion.",
          confirmation_token: confirmationToken,
          expires_at: expiresAt,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 2: Confirm deletion — validate token and delete account
    if (action === "confirm") {
      if (!confirmation_token || typeof confirmation_token !== "string") {
        return new Response(
          JSON.stringify({ error: "confirmation_token is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Fetch and validate the token
      const { data: tokenRecord, error: fetchError } = await supabase
        .from("account_deletion_tokens")
        .select("*")
        .eq("user_id", userId)
        .eq("token", confirmation_token)
        .single();

      if (fetchError || !tokenRecord) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired confirmation token" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check expiry
      if (new Date(tokenRecord.expires_at) < new Date()) {
        // Clean up expired token
        await supabase
          .from("account_deletion_tokens")
          .delete()
          .eq("id", tokenRecord.id);

        return new Response(
          JSON.stringify({ error: "Confirmation token has expired. Please request a new one." }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Token is valid — proceed with deletion
      console.log(`Confirmed deletion for user: ${userId}`);

      // Delete the token first
      await supabase
        .from("account_deletion_tokens")
        .delete()
        .eq("user_id", userId);

      return await performDeletion(supabase, user, req, corsHeaders);
    }

    // Legacy: no action field — direct deletion (XPLAT-001).
    //
    // Every shipped iOS and Android binary invokes this function with an empty
    // body. The two-step token flow (SEC-025) was added without a
    // MIN_SUPPORTED_APP_VERSION bump, so those binaries have been getting a 400
    // and account deletion has been broken on both stores — an App Store
    // 5.1.1(v) violation. This branch restores the contract they were built
    // against. Both clients run their own confirmation dialog before calling, so
    // the user-facing "are you sure" step still exists; what is missing versus
    // the two-step flow is the server-side proof of it.
    //
    // DEPRECATION (CLAUDE.md multi-release flow): the current clients now use
    // request+confirm. Once MIN_SUPPORTED_APP_VERSION excludes every binary that
    // predates that change, delete this branch and restore the 400.
    if (action === undefined || action === null) {
      console.log(`Legacy no-body deletion for user: ${userId}`);
      return await performDeletion(supabase, user, req, corsHeaders);
    }

    // An action was supplied but is not one we handle.
    return new Response(
      JSON.stringify({
        error: "Invalid action. Use action: 'request' to get a confirmation token, then action: 'confirm' with the token.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Delete account error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
