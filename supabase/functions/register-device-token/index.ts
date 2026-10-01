/**
 * Register Device Token Edge Function
 *
 * Stores an iOS/Android/Web push notification device token for the authenticated user.
 * Upserts into `device_tokens` keyed by device_token alone, so a token belongs
 * to the account that registered it most recently: a phone shared by two
 * accounts used to deliver both users' alerts (IOS-DD-PLATFORM-19).
 *
 *   POST { deviceToken, platform }                     register (default)
 *   POST { action: "unregister", deviceToken }         delete this device's row
 *                                                      for the calling user
 *
 * `action` is optional and additive: a body without it registers, as it
 * always did. The table is created by migration 20261015000005.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

const VALID_PLATFORMS = ['ios', 'android', 'web'];
const MAX_TOKEN_LENGTH = 500;

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { deviceToken, platform } = body;
    const isUnregister = body.action === "unregister";

    // Input validation (SEC-026)
    if (!deviceToken || typeof deviceToken !== 'string' || deviceToken.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "deviceToken is required and must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (deviceToken.length > MAX_TOKEN_LENGTH) {
      return new Response(
        JSON.stringify({ error: `deviceToken must be ${MAX_TOKEN_LENGTH} characters or less` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isUnregister) {
      const { error: deleteError } = await supabase
        .from("device_tokens")
        .delete()
        .eq("device_token", deviceToken)
        .eq("user_id", user.id);
      if (deleteError) {
        console.error("Error deleting device token:", deleteError.message);
        return new Response(
          JSON.stringify({ error: "Failed to unregister device token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return new Response(
        JSON.stringify({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert device token
    const { error: upsertError } = await supabase
      .from("device_tokens")
      .upsert(
        {
          user_id: user.id,
          device_token: deviceToken,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_token" }
      );

    if (upsertError) {
      console.error("Error upserting device token:", upsertError.message);
      return new Response(
        JSON.stringify({ error: "Failed to register device token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Register device token error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
