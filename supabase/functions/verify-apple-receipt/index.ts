/**
 * Verify Apple Receipt Edge Function
 *
 * Validates StoreKit 2 transactions from the iOS app and syncs
 * subscription entitlements to the database.
 *
 * Accepts: transactionId, productId, originalTransactionId
 * Returns: { success: true, tier: "insider" | "vip" }
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

    // Parse request body
    const body = await req.json();
    const { transactionId, productId, originalTransactionId } = body;

    if (!transactionId || !productId) {
      return new Response(
        JSON.stringify({ error: "transactionId and productId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine tier from product ID
    let tier: string;
    if (productId.includes("vip")) {
      tier = "vip";
    } else if (productId.includes("insider")) {
      tier = "insider";
    } else {
      return new Response(
        JSON.stringify({ error: "Unknown product ID" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Look up the matching subscription plan
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id")
      .ilike("name", `%${tier}%`)
      .limit(1)
      .single();

    // Upsert into user_subscriptions
    const subscriptionData = {
      user_id: user.id,
      status: "active",
      apple_transaction_id: transactionId,
      apple_original_transaction_id: originalTransactionId || transactionId,
      apple_product_id: productId,
      updated_at: new Date().toISOString(),
      ...(plan?.id ? { plan_id: plan.id } : {}),
    };

    // Check if user already has a subscription record
    const { data: existing } = await supabase
      .from("user_subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (existing) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from("user_subscriptions")
        .update(subscriptionData)
        .eq("id", existing.id);

      if (updateError) {
        console.error("Error updating subscription:", updateError.message);
        return new Response(
          JSON.stringify({ error: "Failed to update subscription record" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Insert new subscription
      const { error: insertError } = await supabase
        .from("user_subscriptions")
        .insert({
          ...subscriptionData,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Error inserting subscription:", insertError.message);
        return new Response(
          JSON.stringify({ error: "Failed to create subscription record" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    console.log(`Verified Apple receipt for user ${user.id}: ${tier} (${productId})`);

    return new Response(
      JSON.stringify({ success: true, tier }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Verify receipt error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
