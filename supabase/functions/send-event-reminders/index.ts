// send-event-reminders - Cron job to send email reminders for upcoming events
// Runs every hour via pg_cron: */0 * * * *

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/escapeHtml.ts";
import { renderEmail } from "../_shared/emailLayout.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Reminder {
  reminder_id: string;
  user_id: string;
  user_email: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_start_utc: string;
  event_venue: string;
  event_location: string;
  reminder_type: string;
  time_until_event: string;
}

serve(async (req) => {
  try {
    // Verify this is a cron request or authenticated request
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get pending reminders
    const { data: reminders, error: remindersError } = await supabase
      .rpc("get_pending_reminders");

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch reminders", details: remindersError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders to send", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reminders.length} reminders to send`);

    // Send emails for each reminder
    const results = await Promise.allSettled(
      reminders.map((reminder: Reminder) => sendReminderEmail(reminder, supabase))
    );

    // Count successes and failures
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        message: "Reminder batch processed",
        total: reminders.length,
        successes,
        failures,
        results: results.map((r, i) => ({
          reminder_id: reminders[i].reminder_id,
          status: r.status,
          error: r.status === "rejected" ? r.reason : null,
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fatal error in send-event-reminders:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function sendReminderEmail(reminder: Reminder, supabase: any) {
  try {
    // Format event time
    const eventTime = formatEventTime(reminder.event_start_utc || reminder.event_date);
    const timeUntil = formatTimeUntil(reminder.reminder_type);

    // Build email content
    const subject = `Reminder: ${escapeHtml(reminder.event_title)} ${timeUntil}`;
    const eventUrl = `${SUPABASE_URL.replace('/v1', '')}/events/${createSlug(reminder.event_title)}`;

    const bodyHtml = `
  <div style="background: linear-gradient(135deg, #2D1B69 0%, #8B0000 50%, #DC143C 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Event Reminder</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd; border-top: none;">
    <p style="font-size: 16px; margin-top: 0;">
      Hi there! This is a friendly reminder about your upcoming event:
    </p>

    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #DC143C; margin: 20px 0;">
      <h2 style="margin: 0 0 15px 0; color: #2D1B69; font-size: 22px;">
        ${escapeHtml(reminder.event_title)}
      </h2>

      <p style="margin: 8px 0; font-size: 16px;">
        <strong>📅 When:</strong> ${escapeHtml(eventTime)}
      </p>

      <p style="margin: 8px 0; font-size: 16px;">
        <strong>📍 Where:</strong> ${escapeHtml(reminder.event_venue || reminder.event_location)}
      </p>

      ${reminder.event_location ? `
        <p style="margin: 8px 0; font-size: 14px; color: #666;">
          ${escapeHtml(reminder.event_location)}
        </p>
      ` : ''}
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${eventUrl}"
         style="background: #DC143C; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">
        View Event Details
      </a>
    </div>

    <p style="font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
      Don't miss out! We'll see you there! 🎉
    </p>
    `;

    const bodyText = `
Event Reminder: ${reminder.event_title}

You have an upcoming event ${timeUntil}!

When: ${eventTime}
Where: ${reminder.event_venue || reminder.event_location}

View event details: ${eventUrl}

Don't miss out! We'll see you there!
    `.trim();

    // Look up this recipient's unsubscribe token so the footer renders a
    // one-click unsubscribe link that complies with CAN-SPAM §5(a)(5).
    const { data: subscriberRow } = await supabase
      .from("newsletter_subscribers")
      .select("unsubscribe_token")
      .eq("email", reminder.user_email.toLowerCase().trim())
      .maybeSingle();

    const rendered = renderEmail({
      bodyHtml,
      bodyText,
      // Event reminders are opted-in notifications, but we still render the
      // full marketing footer so users always have a visible unsubscribe.
      category: "marketing",
      recipient: {
        email: reminder.user_email,
        unsubscribeToken: subscriberRow?.unsubscribe_token ?? null,
        preferencesPath: "/profile?tab=settings",
      },
    });
    const htmlContent = rendered.html;
    const textContent = rendered.text;

    // Send email via Resend
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Des Moines Insider <events@desmoinesinsider.com>",
        to: [reminder.user_email],
        subject,
        html: htmlContent,
        text: textContent,
        // RFC 8058 one-click unsubscribe headers so Gmail/Apple Mail surface
        // a native Unsubscribe button above the message.
        headers: rendered.listUnsubscribe
          ? {
              "List-Unsubscribe": rendered.listUnsubscribe,
              "List-Unsubscribe-Post": rendered.listUnsubscribePost ?? "",
            }
          : undefined,
        tags: [
          { name: "type", value: "event_reminder" },
          { name: "reminder_type", value: reminder.reminder_type },
          { name: "event_id", value: reminder.event_id },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
    }

    const emailResult = await response.json();
    console.log(`✓ Sent ${reminder.reminder_type} reminder for event ${reminder.event_id} to ${reminder.user_email}`);

    // Mark reminder as sent
    await supabase.rpc("mark_reminder_sent", {
      p_reminder_id: reminder.reminder_id,
      p_status: "sent",
    });

    return { success: true, email_id: emailResult.id };
  } catch (error) {
    console.error(`✗ Failed to send reminder ${reminder.reminder_id}:`, error);

    // Mark reminder as failed
    await supabase.rpc("mark_reminder_sent", {
      p_reminder_id: reminder.reminder_id,
      p_status: "failed",
      p_error_message: error.message,
    });

    throw error;
  }
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  };
  return date.toLocaleString("en-US", options);
}

function formatTimeUntil(reminderType: string): string {
  switch (reminderType) {
    case "1_day":
      return "starts tomorrow";
    case "3_hours":
      return "starts in 3 hours";
    case "1_hour":
      return "starts in 1 hour";
    default:
      return "is coming up";
  }
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
