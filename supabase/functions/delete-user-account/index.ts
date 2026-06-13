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
 * Legacy: POST without action field treated as direct deletion (backwards compat)
 *   - Only allowed if the account_deletion_tokens table doesn't exist yet
 *
 * Permanently deletes from: user_event_interactions, user_restaurant_interactions,
 * user_subscriptions, profiles, and auth.users.
 *
 * Required by Apple App Store Review for apps that support account creation.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { writeAuditLog, auditIp } from "../_shared/auditLog.ts";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a cryptographically random token
 */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

      // Delete user data in order (respect foreign key constraints)
      const tables = [
        "user_event_interactions",
        "user_restaurant_interactions",
        "favorites",
        "ratings",
        "reviews",
        "user_subscriptions",
        "profiles",
      ];

      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);

        if (error) {
          console.warn(`Warning deleting from ${table}:`, error.message);
        }
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
        details: { target_user_id: userId },
      });

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // No action specified — return error
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
