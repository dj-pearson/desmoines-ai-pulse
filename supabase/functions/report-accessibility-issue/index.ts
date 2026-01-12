/**
 * Edge Function: report-accessibility-issue
 *
 * Handles accessibility issue reports from users.
 * Stores reports in the database and optionally sends notifications.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { validateInput, ValidationSchema } from "../_shared/validation.ts";

const schema: ValidationSchema = {
  url: { type: "url", required: true },
  description: { type: "string", required: true, min: 10, max: 2000 },
  issueType: { type: "string", required: true },
  assistiveTechnology: { type: "string", required: false },
  browser: { type: "string", required: false },
  email: { type: "email", required: false },
  name: { type: "string", required: false, max: 100 },
};

const validIssueTypes = [
  "keyboard_navigation",
  "screen_reader",
  "color_contrast",
  "text_size",
  "focus_indicator",
  "form_labels",
  "image_alt_text",
  "video_captions",
  "other",
];

interface AccessibilityReport {
  url: string;
  description: string;
  issue_type: string;
  assistive_technology?: string;
  browser?: string;
  reporter_email?: string;
  reporter_name?: string;
  user_agent?: string;
  status: "new" | "investigating" | "resolved" | "wont_fix";
  created_at: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) {
    return corsResponse;
  }

  // Validate origin
  const origin = req.headers.get("origin");
  if (origin && !isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const corsHeaders = getCorsHeaders(origin || undefined);

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Parse request body
    const body = await req.json();

    // Validate input
    const validation = validateInput(body, schema);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.errors,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = validation.data!;

    // Validate issue type
    if (!validIssueTypes.includes(data.issueType)) {
      return new Response(
        JSON.stringify({
          error: "Invalid issue type",
          validTypes: validIssueTypes,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Prepare the report
    const report: AccessibilityReport = {
      url: data.url,
      description: data.description,
      issue_type: data.issueType,
      assistive_technology: data.assistiveTechnology || null,
      browser: data.browser || null,
      reporter_email: data.email || null,
      reporter_name: data.name || null,
      user_agent: req.headers.get("user-agent") || null,
      status: "new",
      created_at: new Date().toISOString(),
    };

    // Insert the report
    const { data: insertedReport, error: insertError } = await supabase
      .from("accessibility_reports")
      .insert(report)
      .select()
      .single();

    if (insertError) {
      // If table doesn't exist, log but don't fail
      if (insertError.code === "42P01") {
        console.warn("accessibility_reports table does not exist. Report logged to console:", report);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Thank you for your accessibility report. Our team will review it.",
            reportId: "logged",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.error("Error inserting accessibility report:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to submit report" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send notification email if configured
    const notificationEmail = Deno.env.get("ACCESSIBILITY_NOTIFICATION_EMAIL");
    if (notificationEmail) {
      // You could integrate with your email service here
      console.log(`Accessibility report notification would be sent to: ${notificationEmail}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Thank you for your accessibility report. Our team will review it within 5 business days.",
        reportId: insertedReport?.id || "submitted",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing accessibility report:", error);

    return new Response(
      JSON.stringify({
        error: "An error occurred while processing your report",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
