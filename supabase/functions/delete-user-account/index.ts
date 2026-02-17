/**
 * Delete User Account Edge Function
 *
 * Permanently deletes a user's account and all associated data.
 * Required by Apple App Store Review for apps that support account creation.
 *
 * Deletes from: user_event_interactions, user_restaurant_interactions,
 * user_subscriptions, profiles, and auth.users.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    console.log(`Deleting account for user: ${userId}`);

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
        // Log but don't fail - table may not exist or have no rows
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

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Delete account error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
