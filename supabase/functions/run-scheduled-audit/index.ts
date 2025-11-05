// ============================================================================
// Run Scheduled Audit Edge Function
// ============================================================================
// Purpose: Execute scheduled SEO audits (called by cron jobs)
// Returns: Audit results and alert status
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify cron secret if configured
    if (cronSecret) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { scheduleId, url } = await req.json();
    const startTime = Date.now();

    console.log(`Running scheduled audit for: ${url || "multiple URLs"}`);

    let schedule = null;
    let urlsToAudit: string[] = [];

    // Get schedule details if scheduleId provided
    if (scheduleId) {
      const { data, error } = await supabase
        .from("seo_monitoring_schedules")
        .select("*")
        .eq("id", scheduleId)
        .eq("is_active", true)
        .single();

      if (error || !data) {
        throw new Error("Schedule not found or inactive");
      }

      schedule = data;

      // Get URLs from schedule
      if (schedule.target_url) {
        urlsToAudit.push(schedule.target_url);
      } else if (schedule.target_urls && schedule.target_urls.length > 0) {
        urlsToAudit = schedule.target_urls;
      }
    } else if (url) {
      // Single URL provided directly
      urlsToAudit = [url];
    } else {
      // Get URLs from SEO settings or monitoring schedules
      const { data: settings } = await supabase
        .from("seo_settings")
        .select("canonical_domain")
        .single();

      if (settings?.canonical_domain) {
        urlsToAudit.push(settings.canonical_domain);
      }
    }

    if (urlsToAudit.length === 0) {
      throw new Error("No URLs to audit");
    }

    console.log(`Auditing ${urlsToAudit.length} URLs`);

    const results: any[] = [];
    let alertsTriggered = 0;

    // Run audit for each URL
    for (const targetUrl of urlsToAudit) {
      try {
        // Call seo-audit function
        const auditResponse = await fetch(
          `${supabaseUrl}/functions/v1/seo-audit`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              url: targetUrl,
              auditType: schedule?.task_type === "quick_audit" ? "quick" : "full",
              saveResults: true,
            }),
          }
        );

        if (!auditResponse.ok) {
          throw new Error(`Audit failed: ${await auditResponse.text()}`);
        }

        const auditData = await auditResponse.json();
        const audit = auditData.audit;

        results.push({
          url: targetUrl,
          success: true,
          overallScore: audit.overallScore,
          criticalIssues: audit.criticalIssues,
          warningIssues: audit.warningIssues,
        });

        // Check alert rules
        const { data: alertRules } = await supabase
          .from("seo_alert_rules")
          .select("*")
          .eq("is_active", true);

        if (alertRules) {
          for (const rule of alertRules) {
            let shouldAlert = false;
            let alertMessage = "";

            // Check if rule applies to this URL
            if (rule.applies_to === "specific_urls" && rule.target_urls) {
              if (!rule.target_urls.includes(targetUrl)) {
                continue;
              }
            }

            // Evaluate rule conditions
            if (rule.metric === "overall_score") {
              if (rule.rule_type === "threshold") {
                const threshold = rule.threshold_value || 0;
                const operator = rule.threshold_operator || "<";

                if (operator === "<" && audit.overallScore < threshold) {
                  shouldAlert = true;
                  alertMessage = `Overall SEO score (${audit.overallScore}) is below threshold (${threshold})`;
                } else if (operator === ">" && audit.overallScore > threshold) {
                  shouldAlert = true;
                  alertMessage = `Overall SEO score (${audit.overallScore}) exceeds threshold (${threshold})`;
                }
              }
            } else if (rule.metric === "critical_issues") {
              if (rule.rule_type === "threshold") {
                const threshold = rule.threshold_value || 0;
                if (audit.criticalIssues > threshold) {
                  shouldAlert = true;
                  alertMessage = `Critical issues (${audit.criticalIssues}) exceed threshold (${threshold})`;
                }
              }
            }

            // Check cooldown period
            if (shouldAlert && rule.last_triggered_at) {
              const lastTriggered = new Date(rule.last_triggered_at);
              const cooldownMs = (rule.cooldown_minutes || 60) * 60 * 1000;
              if (Date.now() - lastTriggered.getTime() < cooldownMs) {
                console.log(`Rule ${rule.name} in cooldown, skipping alert`);
                shouldAlert = false;
              }
            }

            // Trigger alert
            if (shouldAlert) {
              const { data: alert } = await supabase
                .from("seo_alerts")
                .insert({
                  rule_id: rule.id,
                  rule_name: rule.name,
                  rule_category: rule.category,
                  severity: rule.severity,
                  title: `SEO Alert: ${rule.name}`,
                  message: alertMessage,
                  affected_url: targetUrl,
                  metric_name: rule.metric,
                  metric_value: audit.overallScore,
                  threshold_value: rule.threshold_value,
                  status: "open",
                })
                .select()
                .single();

              if (alert) {
                alertsTriggered++;

                // Update rule
                await supabase
                  .from("seo_alert_rules")
                  .update({
                    last_triggered_at: new Date().toISOString(),
                    trigger_count: (rule.trigger_count || 0) + 1,
                  })
                  .eq("id", rule.id);

                // Send notification
                try {
                  await fetch(`${supabaseUrl}/functions/v1/send-seo-notification`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                      alertId: alert.id,
                      channels: ["email"], // Could be configured
                    }),
                  });
                } catch (notifError) {
                  console.error("Failed to send notification:", notifError);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error auditing ${targetUrl}:`, error);
        results.push({
          url: targetUrl,
          success: false,
          error: error.message,
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const status = successCount === urlsToAudit.length ? "success" : successCount > 0 ? "warning" : "error";

    // Update schedule execution
    if (schedule) {
      await supabase
        .from("seo_monitoring_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: status,
          last_run_duration_ms: executionTime,
          total_runs: (schedule.total_runs || 0) + 1,
          successful_runs:
            status === "success" ? (schedule.successful_runs || 0) + 1 : schedule.successful_runs,
          failed_runs: status === "error" ? (schedule.failed_runs || 0) + 1 : schedule.failed_runs,
          consecutive_failures: status === "error" ? (schedule.consecutive_failures || 0) + 1 : 0,
        })
        .eq("id", scheduleId);
    }

    // Log monitoring activity
    await supabase.from("seo_monitoring_log").insert({
      monitoring_type: "scheduled_audit",
      url: urlsToAudit[0],
      status,
      issues_found: results.reduce(
        (sum, r) => sum + (r.criticalIssues || 0) + (r.warningIssues || 0),
        0
      ),
      alerts_triggered: alertsTriggered,
      details: { results, executionTime },
      execution_time_ms: executionTime,
    });

    console.log(
      `Scheduled audit completed: ${successCount}/${urlsToAudit.length} successful, ${alertsTriggered} alerts triggered`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          urlsAudited: urlsToAudit.length,
          successCount,
          failureCount: urlsToAudit.length - successCount,
          alertsTriggered,
          executionTime,
        },
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in run-scheduled-audit function:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
