// send-weekly-digest - Sends personalized weekly event digests to users
// Runs weekly via pg_cron: Sunday at 8 AM
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../../escapeHtml.ts";
import { renderEmail } from "../../emailLayout.ts";
import { fetchWithTimeout } from "../../fetchWithTimeout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://desmoinesinsider.com";

interface Recipient {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  categories_filter: string[];
  max_distance_miles: number;
  home_latitude: number;
  home_longitude: number;
}

interface DigestContent {
  upcoming_rsvps: any[];
  saved_events: any[];
  recommendations: any[];
  trending_events: any[];
}

export default (async (req) => {
  try {
    // Verify authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get eligible recipients
    const { data: recipients, error: recipientsError } = await supabase
      .rpc("get_weekly_digest_recipients");

    if (recipientsError) {
      console.error("Error fetching recipients:", recipientsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch recipients", details: recipientsError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: "No digests to send", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${recipients.length} recipients for weekly digest`);

    // Send digest to each recipient
    const results = await Promise.allSettled(
      recipients.map((recipient: Recipient) =>
        sendDigestEmail(recipient, supabase)
      )
    );

    // Count successes and failures
    const successes = results.filter((r) => r.status === "fulfilled").length;
    const failures = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        message: "Weekly digest batch processed",
        total: recipients.length,
        successes,
        failures,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fatal error in send-weekly-digest:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function sendDigestEmail(recipient: Recipient, supabase: any) {
  try {
    // Get personalized digest content
    const { data: digestContent, error: contentError } = await supabase
      .rpc("get_user_weekly_digest_content", {
        p_user_id: recipient.user_id
      });

    if (contentError) {
      throw new Error(`Failed to get digest content: ${contentError.message}`);
    }

    const content: DigestContent = digestContent;

    // Calculate total events
    const totalEvents =
      content.upcoming_rsvps.length +
      content.saved_events.length +
      content.recommendations.length;

    // Skip if no content
    if (totalEvents === 0) {
      console.log(`No content for user ${recipient.email}, skipping`);
      return;
    }

    // Build email body — the shared layout renders the branded wrapper and
    // the CAN-SPAM compliant footer (postal address + unsubscribe).
    const bodyHtml = buildDigestBodyHtml(recipient, content);
    const bodyText = buildDigestBodyText(recipient, content);
    const subject = `Your Weekly Events: ${totalEvents} Events to Explore 🎉`;

    // Look up unsubscribe token for one-click marketing opt-out.
    const { data: subscriberRow } = await supabase
      .from("newsletter_subscribers")
      .select("unsubscribe_token")
      .eq("email", recipient.email.toLowerCase().trim())
      .maybeSingle();

    const rendered = renderEmail({
      bodyHtml,
      bodyText,
      category: "marketing",
      recipient: {
        email: recipient.email,
        unsubscribeToken: subscriberRow?.unsubscribe_token ?? null,
      },
    });

    // Send email via Resend
    const resendResponse = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Des Moines Insider <events@desmoinesinsider.com>",
        to: [recipient.email],
        subject: subject,
        html: rendered.html,
        text: rendered.text,
        headers: rendered.listUnsubscribe
          ? {
              "List-Unsubscribe": rendered.listUnsubscribe,
              "List-Unsubscribe-Post": rendered.listUnsubscribePost ?? "",
            }
          : undefined,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      throw new Error(`Resend API error: ${errorData}`);
    }

    // Log successful send
    await supabase.from("weekly_digest_log").insert({
      user_id: recipient.user_id,
      events_included: totalEvents,
      email_status: "sent",
    });

    console.log(`✓ Sent digest to ${recipient.email}`);
  } catch (error) {
    console.error(`✗ Failed to send digest to ${recipient.email}:`, error);

    // Log failure
    await supabase.from("weekly_digest_log").insert({
      user_id: recipient.user_id,
      events_included: 0,
      email_status: "failed",
      error_message: error.message,
    });

    throw error;
  }
}

function buildDigestBodyText(recipient: Recipient, content: DigestContent): string {
  const greeting = recipient.first_name
    ? `Hi ${recipient.first_name}!`
    : "Hi there!";
  const totalEvents =
    (content.upcoming_rsvps?.length || 0) +
    (content.saved_events?.length || 0) +
    (content.recommendations?.length || 0) +
    (content.trending_events?.length || 0);
  return `
${greeting}

Here's your personalized weekly roundup of events happening in Des Moines — ${totalEvents} event${totalEvents === 1 ? "" : "s"} to explore.

Browse all events: ${SITE_URL}/events
Your event dashboard: ${SITE_URL}/my-events
`.trim();
}

function buildDigestBodyHtml(recipient: Recipient, content: DigestContent): string {
  const greeting = recipient.first_name
    ? `Hi ${recipient.first_name}!`
    : "Hi there!";

  return `
  <style>
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      padding: 30px 20px;
    }
    .greeting {
      font-size: 18px;
      margin-bottom: 20px;
    }
    .section {
      margin: 30px 0;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #667eea;
    }
    .event-card {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      border-left: 4px solid #667eea;
    }
    .event-title {
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 8px;
    }
    .event-details {
      font-size: 14px;
      color: #666;
      margin: 5px 0;
    }
    .event-badge {
      display: inline-block;
      padding: 4px 8px;
      background: #667eea;
      color: white;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 5px;
    }
    .cta-button {
      display: inline-block;
      padding: 12px 24px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px 5px;
      font-weight: bold;
    }
  </style>
  <div class="container">
    <div class="header">
      <h1>🎉 Your Weekly Events</h1>
      <p>Des Moines Insider</p>
    </div>

    <div class="content">
      <p class="greeting">${greeting}</p>
      <p>Here's your personalized weekly roundup of events happening in Des Moines!</p>

      ${buildUpcomingRSVPsSection(content.upcoming_rsvps)}
      ${buildSavedEventsSection(content.saved_events)}
      ${buildRecommendationsSection(content.recommendations)}
      ${buildTrendingSection(content.trending_events)}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${SITE_URL}/events" class="cta-button">Browse All Events</a>
        <a href="${SITE_URL}/my-events" class="cta-button">My Events Dashboard</a>
      </div>
    </div>
  </div>
  `;
}

function buildUpcomingRSVPsSection(events: any[]): string {
  if (!events || events.length === 0) return '';

  return `
    <div class="section">
      <div class="section-title">📅 Your Upcoming Events</div>
      <p style="margin-bottom: 15px;">Events you're attending this week:</p>
      ${events.map(event => `
        <div class="event-card">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-details">
            📍 ${escapeHtml(event.location)}<br>
            📆 ${escapeHtml(formatDate(event.date))}<br>
            ${event.status === 'going' ? '<span class="event-badge">✓ Going</span>' : '<span class="event-badge">Interested</span>'}
            <span class="event-badge">${escapeHtml(event.category)}</span>
          </div>
          <a href="${SITE_URL}/events/${createSlug(event.title)}" class="cta-button" style="margin-top: 10px; padding: 8px 16px; font-size: 14px;">View Details</a>
        </div>
      `).join('')}
    </div>
  `;
}

function buildSavedEventsSection(events: any[]): string {
  if (!events || events.length === 0) return '';

  return `
    <div class="section">
      <div class="section-title">❤️ Your Saved Events</div>
      <p style="margin-bottom: 15px;">Events you favorited that are happening soon:</p>
      ${events.map(event => `
        <div class="event-card">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-details">
            📍 ${escapeHtml(event.location)}<br>
            📆 ${escapeHtml(formatDate(event.date))}<br>
            <span class="event-badge">${escapeHtml(event.category)}</span>
          </div>
          <a href="${SITE_URL}/events/${createSlug(event.title)}" class="cta-button" style="margin-top: 10px; padding: 8px 16px; font-size: 14px;">View Details</a>
        </div>
      `).join('')}
    </div>
  `;
}

function buildRecommendationsSection(events: any[]): string {
  if (!events || events.length === 0) return '';

  return `
    <div class="section">
      <div class="section-title">✨ Recommended for You</div>
      <p style="margin-bottom: 15px;">Events we think you'll love based on your interests:</p>
      ${events.map(event => `
        <div class="event-card">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-details">
            📍 ${escapeHtml(event.location)}<br>
            📆 ${escapeHtml(formatDate(event.date))}<br>
            <span class="event-badge">${escapeHtml(event.category)}</span>
            ${event.recommendation_reason ? `<br><small style="color: #888;">💡 ${escapeHtml(event.recommendation_reason)}</small>` : ''}
          </div>
          <a href="${SITE_URL}/events/${createSlug(event.title)}" class="cta-button" style="margin-top: 10px; padding: 8px 16px; font-size: 14px;">View Details</a>
        </div>
      `).join('')}
    </div>
  `;
}

function buildTrendingSection(events: any[]): string {
  if (!events || events.length === 0) return '';

  // Only show if we don't have other content
  return `
    <div class="section">
      <div class="section-title">🔥 Trending Events</div>
      <p style="margin-bottom: 15px;">Popular events in Des Moines:</p>
      ${events.slice(0, 3).map(event => `
        <div class="event-card">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-details">
            📍 ${escapeHtml(event.location)}<br>
            📆 ${escapeHtml(formatDate(event.date))}<br>
            <span class="event-badge">${escapeHtml(event.category)}</span>
          </div>
          <a href="${SITE_URL}/events/${createSlug(event.title)}" class="cta-button" style="margin-top: 10px; padding: 8px 16px; font-size: 14px;">View Details</a>
        </div>
      `).join('')}
    </div>
  `;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
