/**
 * Notify Event Submission
 *
 * Sends email notifications for event submission lifecycle events:
 * - event_submitted → admin (new submission needs review)
 * - event_approved  → submitter (event is live)
 * - event_rejected  → submitter (with admin notes)
 * - event_needs_revision → submitter (with admin notes)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const {
      notificationType,
      eventId,
      eventTitle,
      eventDate,
      eventVenue,
      eventCategory,
      submitterEmail,
      submitterName,
      adminNotes,
    } = body;

    if (!notificationType || !eventId) {
      return new Response(
        JSON.stringify({ error: "notificationType and eventId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // THE RECIPIENT AND THE TITLE COME FROM THE DATABASE, NOT THE CALLER.
    //
    // submitterEmail used to be taken straight off the request body and used as
    // the `to:` address. This function is deployed, has no caller check, and
    // verify_jwt only requires a valid Supabase JWT - which the publishable anon
    // key is, in every client bundle. So anyone who had loaded the site could
    // POST {notificationType:"event_approved", eventId:"anything",
    // submitterEmail:"<victim>", eventTitle:"<their text>"} and this would send
    // mail FROM the site's domain TO an arbitrary address with their wording in
    // the subject. That is an open relay, and eventId was required but never
    // used to look anything up.
    //
    // It cannot be fixed with an auth guard: the real caller is
    // useUserSubmittedEvents, i.e. a member of the public submitting an event.
    // The fix is to stop trusting the body for anything that decides WHO is
    // mailed or WHAT the subject says.
    //
    // Safe on ordering: useUserSubmittedEvents.ts inserts the row (:92) and only
    // then invokes this with eventId: data.id (:104-106).
    const { data: submission, error: submissionError } = await supabase
      .from("user_submitted_events")
      .select("id, title, contact_email")
      .eq("id", eventId)
      .maybeSingle();

    // Checked, not discarded (WEB-BE-032): a failed read must not fall through
    // to "no submission" and silently drop a real notification.
    if (submissionError) {
      console.error("[notify-event-submission] submission lookup failed:", submissionError);
      return new Response(
        JSON.stringify({ error: "Could not read the submission" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!submission) {
      return new Response(
        JSON.stringify({ error: "No such event submission" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authoritative values. The body may still carry eventDate/eventVenue/
    // eventCategory, which appear only in the admin mail whose recipient is the
    // env-configured ADMIN_NOTIFICATION_EMAIL.
    const submitterAddress: string | null = submission.contact_email ?? null;
    const verifiedTitle: string = submission.title ?? "";

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
    const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@desmoinesinsider.com";
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "admin@desmoinesinsider.com";
    const siteUrl = Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com";

    let recipientEmail: string;
    let emailSubject: string;
    let emailHtml: string;

    switch (notificationType) {
      case "event_submitted": {
        recipientEmail = adminEmail;
        // Recipient is the env-configured admin, so the risk here is not who
        // gets mailed but what they are told. Title and submitter address come
        // from the row so a caller cannot show the admin a false submitter.
        emailSubject = `New Event Submission: ${escapeHtml(verifiedTitle)}`;
        emailHtml = buildAdminNotificationEmail({
          eventTitle: verifiedTitle,
          eventDate,
          eventVenue,
          eventCategory,
          submitterEmail: submitterAddress ?? submitterEmail,
          submitterName,
          siteUrl,
        });
        break;
      }

      case "event_approved": {
        recipientEmail = submitterAddress ?? "";
        emailSubject = `Your event "${escapeHtml(verifiedTitle)}" has been approved!`;
        emailHtml = buildSubmitterEmail({
          eventTitle: verifiedTitle,
          status: "approved",
          message: "Great news! Your event has been approved and is now live on Des Moines Insider.",
          siteUrl,
          adminNotes,
        });
        break;
      }

      case "event_rejected": {
        recipientEmail = submitterAddress ?? "";
        emailSubject = `Update on your event "${escapeHtml(verifiedTitle)}`;
        emailHtml = buildSubmitterEmail({
          eventTitle: verifiedTitle,
          status: "rejected",
          message: "Unfortunately, your event submission was not approved at this time.",
          siteUrl,
          adminNotes,
        });
        break;
      }

      case "event_needs_revision": {
        recipientEmail = submitterAddress ?? "";
        emailSubject = `Action needed: Your event "${escapeHtml(verifiedTitle)}" needs changes`;
        emailHtml = buildSubmitterEmail({
          eventTitle: verifiedTitle,
          status: "needs_revision",
          message: "Your event submission needs some changes before it can be approved. Please review the notes below and resubmit.",
          siteUrl,
          adminNotes,
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${notificationType}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    // Send email
    let emailSent = false;
    if (recipientEmail) {
      if (resendApiKey) {
        try {
          const res = await fetchWithTimeout("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [recipientEmail],
              subject: emailSubject,
              html: emailHtml,
            }),
          });
          emailSent = res.ok;
          if (!res.ok) {
            console.error("Resend error:", await res.text());
          }
        } catch (err) {
          console.error("Resend email failed:", err);
        }
      } else if (sendgridApiKey) {
        try {
          const res = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sendgridApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: recipientEmail }] }],
              from: { email: fromEmail },
              subject: emailSubject,
              content: [{ type: "text/html", value: emailHtml }],
            }),
          });
          emailSent = res.ok || res.status === 202;
        } catch (err) {
          console.error("SendGrid email failed:", err);
        }
      } else {
        console.warn("No email provider configured (RESEND_API_KEY or SENDGRID_API_KEY)");
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailSent }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send notification" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildAdminNotificationEmail(params: {
  eventTitle: string;
  eventDate?: string;
  eventVenue?: string;
  eventCategory?: string;
  submitterEmail?: string;
  submitterName?: string;
  siteUrl: string;
}): string {
  const { eventTitle, eventDate, eventVenue, eventCategory, submitterEmail, submitterName, siteUrl } = params;

  const detailRows = [
    eventDate ? `<tr><td style="padding:4px 12px 4px 0;color:#71717a;font-size:14px;">Date</td><td style="font-size:14px;">${escapeHtml(eventDate)}</td></tr>` : '',
    eventVenue ? `<tr><td style="padding:4px 12px 4px 0;color:#71717a;font-size:14px;">Venue</td><td style="font-size:14px;">${escapeHtml(eventVenue)}</td></tr>` : '',
    eventCategory ? `<tr><td style="padding:4px 12px 4px 0;color:#71717a;font-size:14px;">Category</td><td style="font-size:14px;">${escapeHtml(eventCategory)}</td></tr>` : '',
    submitterName ? `<tr><td style="padding:4px 12px 4px 0;color:#71717a;font-size:14px;">Submitted by</td><td style="font-size:14px;">${escapeHtml(submitterName)}</td></tr>` : '',
    submitterEmail ? `<tr><td style="padding:4px 12px 4px 0;color:#71717a;font-size:14px;">Email</td><td style="font-size:14px;">${escapeHtml(submitterEmail)}</td></tr>` : '',
  ].filter(Boolean).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <tr>
              <td style="background-color:#1a1a2e;padding:24px 32px;">
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">Des Moines Insider</h1>
                <p style="margin:4px 0 0;color:#a0a0b0;font-size:13px;">Event Submission Review</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;font-weight:600;">New Event Submitted</h2>
                <p style="margin:0 0 20px;color:#4a4a5a;font-size:15px;line-height:1.6;">
                  A new event "<strong>${escapeHtml(eventTitle)}</strong>" has been submitted and is waiting for your review.
                </p>
                <table style="margin-bottom:24px;">${detailRows}</table>
                <a href="${siteUrl}/admin/tools?tab=event-submissions" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
                  Review Submission
                </a>
              </td>
            </tr>
            <tr>
              <td style="background-color:#fafafa;padding:20px 32px;border-top:1px solid #e4e4e7;">
                <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">
                  &copy; ${new Date().getFullYear()} Des Moines Insider
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function buildSubmitterEmail(params: {
  eventTitle: string;
  status: string;
  message: string;
  siteUrl: string;
  adminNotes?: string;
}): string {
  const { eventTitle, status, message, siteUrl, adminNotes } = params;

  const statusColor = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#ca8a04';
  const statusLabel = status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Needs Revision';
  const ctaUrl = status === 'approved' ? `${siteUrl}/events` : `${siteUrl}/dashboard?tab=events`;
  const ctaLabel = status === 'approved' ? 'View Events' : 'View My Submissions';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
            <tr>
              <td style="background-color:#1a1a2e;padding:24px 32px;">
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">Des Moines Insider</h1>
                <p style="margin:4px 0 0;color:#a0a0b0;font-size:13px;">Event Submission Update</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <div style="display:inline-block;padding:4px 12px;border-radius:12px;background-color:${statusColor}20;color:${statusColor};font-size:13px;font-weight:600;margin-bottom:16px;">
                  ${statusLabel}
                </div>
                <h2 style="margin:12px 0 8px;color:#1a1a2e;font-size:20px;font-weight:600;">${escapeHtml(eventTitle)}</h2>
                <p style="margin:0 0 20px;color:#4a4a5a;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
                ${adminNotes ? `
                <div style="background-color:#f8f9fa;border-left:4px solid ${statusColor};padding:12px 16px;margin-bottom:24px;border-radius:0 6px 6px 0;">
                  <p style="margin:0 0 4px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;">Notes from our team</p>
                  <p style="margin:0;color:#4a4a5a;font-size:14px;line-height:1.5;">${escapeHtml(adminNotes)}</p>
                </div>
                ` : ''}
                <a href="${ctaUrl}" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
                  ${ctaLabel}
                </a>
              </td>
            </tr>
            <tr>
              <td style="background-color:#fafafa;padding:20px 32px;border-top:1px solid #e4e4e7;">
                <p style="margin:0;color:#a1a1aa;font-size:12px;text-align:center;">
                  &copy; ${new Date().getFullYear()} Des Moines Insider &bull;
                  <a href="${siteUrl}/dashboard" style="color:#6366f1;text-decoration:none;">My Dashboard</a>
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}
