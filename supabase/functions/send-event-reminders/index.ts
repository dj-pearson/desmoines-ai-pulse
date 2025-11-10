// send-event-reminders - Cron job to send email reminders for upcoming events
// Runs every hour via pg_cron: */0 * * * *

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      JSON.stringify({ error: "Internal server error", details: error.message }),
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
    const subject = `Reminder: ${reminder.event_title} ${timeUntil}`;
    const eventUrl = `${SUPABASE_URL.replace('/v1', '')}/events/${createSlug(reminder.event_title)}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2D1B69 0%, #8B0000 50%, #DC143C 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Event Reminder</h1>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #ddd; border-top: none;">
    <p style="font-size: 16px; margin-top: 0;">
      Hi there! This is a friendly reminder about your upcoming event:
    </p>

    <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #DC143C; margin: 20px 0;">
      <h2 style="margin: 0 0 15px 0; color: #2D1B69; font-size: 22px;">
        ${reminder.event_title}
      </h2>

      <p style="margin: 8px 0; font-size: 16px;">
        <strong>📅 When:</strong> ${eventTime}
      </p>

      <p style="margin: 8px 0; font-size: 16px;">
        <strong>📍 Where:</strong> ${reminder.event_venue || reminder.event_location}
      </p>

      ${reminder.event_location ? `
        <p style="margin: 8px 0; font-size: 14px; color: #666;">
          ${reminder.event_location}
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

    <p style="font-size: 12px; color: #999; margin-top: 20px;">
      You're receiving this because you set a reminder for this event on Des Moines Insider.
      <br>
      <a href="${eventUrl}" style="color: #DC143C;">Manage your event reminders</a>
    </p>
  </div>
</body>
</html>
    `;

    const textContent = `
Event Reminder: ${reminder.event_title}

You have an upcoming event ${timeUntil}!

When: ${eventTime}
Where: ${reminder.event_venue || reminder.event_location}

View event details: ${eventUrl}

Don't miss out! We'll see you there!

---
You're receiving this because you set a reminder for this event on Des Moines Insider.
    `.trim();

    // Send email via Resend
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
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
