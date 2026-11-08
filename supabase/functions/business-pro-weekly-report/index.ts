/**
 * business-pro-weekly-report (growth roadmap #3, part 3)
 *
 * Mondays, from cron (20261102000007). Emails each live Business Pro owner
 * last week's numbers for each listing they pay for.
 *
 * Exactly once per owner, listing and week: a business_pro_report_sends row is
 * inserted BEFORE the send and the mail goes out only if that insert created
 * the row. A failed send deletes the row again, so a manual rerun retries just
 * the ones that failed and never mails anyone twice.
 *
 * Transactional, not marketing: the report is part of what the owner pays for,
 * and it stops when Business Pro does, because the rows function only returns
 * listings where business_pro_active() is true.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { sendEmail } from "../_shared/email.ts";
import { renderEmail } from "../_shared/emailLayout.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import { buildWeeklyReport, type WeeklyReportRow } from "../_shared/businessProReport.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const siteUrl = getSiteUrl();

  const job = await runJob("business-pro-weekly-report", async (ctx) => {
    const { data, error } = await supabase.rpc("business_pro_weekly_report_rows");
    if (error) throw error;
    const rows = (data ?? []) as WeeklyReportRow[];

    let sent = 0;
    let alreadySent = 0;
    const failures: string[] = [];

    for (const row of rows) {
      const key = {
        user_id: row.user_id,
        listing_type: row.listing_type,
        listing_id: row.listing_id,
        week_start: row.week_start,
      };
      const { data: claimed, error: claimError } = await supabase
        .from("business_pro_report_sends")
        .upsert(key, { onConflict: "user_id,listing_type,listing_id,week_start", ignoreDuplicates: true })
        .select("user_id");
      if (claimError) {
        failures.push(`${row.listing_id}: could not record the send (${claimError.message})`);
        continue;
      }
      if (!claimed || claimed.length === 0) {
        alreadySent++;
        continue;
      }

      const report = buildWeeklyReport(row, siteUrl);
      const rendered = renderEmail({
        bodyHtml: report.bodyHtml,
        bodyText: report.bodyText,
        category: "transactional",
        recipient: { email: row.email },
      });
      const result = await sendEmail(
        {
          to: row.email,
          subject: report.subject,
          html: rendered.html,
          text: rendered.text,
          category: "transactional",
          template: "business_pro_weekly_report",
          userId: row.user_id,
          ref: { type: row.listing_type, id: row.listing_id },
        },
        { supabase },
      );

      if (result.ok) {
        sent++;
        continue;
      }
      failures.push(`${row.listing_id}: ${result.error ?? "send failed"}`);
      // Release the slot so a rerun can retry this one.
      const { error: releaseError } = await supabase
        .from("business_pro_report_sends")
        .delete()
        .match(key);
      if (releaseError) {
        failures.push(`${row.listing_id}: could not release the send slot (${releaseError.message})`);
      }
    }

    ctx.processed(sent);
    ctx.failed(failures.length);
    ctx.meta({ listings: rows.length, sent, alreadySent, failures });
    return { listings: rows.length, sent, alreadySent, failed: failures.length };
  });

  return new Response(JSON.stringify({ success: job.ok, ...job.result }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
