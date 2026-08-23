/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: MEDIUM (unpublishes past events via reversible archived_at and
 *   records dead-link marks; every auto-action is audited + reversible; never
 *   hard-deletes).
 *
 * agent-link-monitor (AOS-MAINT-005) — broken-link & dead-content monitor.
 *
 * Daily:
 *  1. Expired events — events past their date with archived_at IS NULL are
 *     unpublished tier-1 by setting archived_at (reversible: null it to
 *     restore). A past event whose title looks *recurring* ("weekly", "annual",
 *     …) is ambiguous → escalated to tier-2 instead of auto-archived.
 *  2. Outbound links — a bounded batch of content URLs (events.source_url,
 *     restaurants.website/source_url, attractions.website) is probed. State is
 *     upserted per link in content_link_checks. A hard-dead link (404/410) for
 *     FAIL_THRESHOLD consecutive checks is marked_dead tier-1; a redirect to a
 *     different host is ambiguous → tier-2. Transient 5xx/timeouts accumulate
 *     but don't mark.
 *
 * Every auto-action (archive, mark-dead) is written to the audit trail with
 * before/after and is reversible. The content row is never mutated for links —
 * only the separate content_link_checks tracker.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "link-content-monitor";
const ARCHIVE_LIMIT = 100; // max past events auto-archived per run
const LINK_BUDGET = 50; // max link probes per run
const FAIL_THRESHOLD = 3; // consecutive hard failures before marking dead
const PROBE_TIMEOUT_MS = 8000;
const RECUR_RE = /\b(weekly|monthly|annual|annually|every\s+\w+day|recurring|series|each\s+\w+day)\b/i;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

interface LinkProbe {
  status: number | null;
  ok: boolean;
  hardDead: boolean; // 404 / 410
  redirectHost: string | null; // final host if it differs from the original
  error: string | null;
}

async function probeLink(url: string): Promise<LinkProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const origHost = hostOf(url);
  try {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some servers reject HEAD — fall back to a light GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    const finalHost = hostOf(res.url || url);
    const redirectHost = finalHost && origHost && finalHost !== origHost ? finalHost : null;
    return {
      status: res.status,
      ok: res.status < 400,
      hardDead: res.status === 404 || res.status === 410,
      redirectHost,
      error: null,
    };
  } catch (err) {
    return {
      status: null,
      ok: false,
      hardDead: false,
      redirectHost: null,
      error: (err as Error)?.name === "AbortError" ? "timeout" : ((err as Error)?.message ?? "probe error").slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const nowIso = new Date().toISOString();
    let archived = 0;
    let recurringEscalated = 0;
    let markedDead = 0;
    let ambiguousLinks = 0;

    // ── 1) Expired events ────────────────────────────────────────────────
    const { data: past } = await supabase
      .from("events")
      .select("id, title, date, source_url")
      .lt("date", nowIso)
      .is("archived_at", null)
      .limit(ARCHIVE_LIMIT);
    const pastEvents = (past ?? []) as { id: string; title: string | null; date: string; source_url: string | null }[];

    for (const ev of pastEvents) {
      if (ev.title && RECUR_RE.test(ev.title)) {
        // Possibly recurring — don't auto-archive; escalate for a human.
        const task = await createAgentTask(supabase, {
          agentKey: AGENT_KEY,
          category: "maintain",
          title: `Possibly-recurring event past its date: "${ev.title}"`,
          confidence: 0,
          forceTier: 2,
          dedupeKey: `recurring-event:${ev.id}`,
          payload: { eventId: ev.id, title: ev.title, date: ev.date, reason: "recurrence keyword in title" },
        });
        if (task.ok) {
          recurringEscalated++;
          ctx.escalated(1);
        }
        continue;
      }
      // Safe tier-1 unpublish — reversible (set archived_at back to null to restore).
      const { error } = await supabase.from("events").update({ archived_at: nowIso }).eq("id", ev.id).is("archived_at", null);
      if (!error) {
        archived++;
        await writeAgentAudit(supabase, {
          agentKey: AGENT_KEY,
          actionType: "unpublish_past_event",
          targetRef: `events:${ev.id}`,
          before: { archived_at: null },
          after: { archived_at: nowIso, reversible: true, restore: "set archived_at = null" },
        });
      }
    }

    // ── 2) Outbound links ────────────────────────────────────────────────
    // Prioritize currently-failing links (confirm/recover), then fill with a
    // rotating sample of unchecked links — all within LINK_BUDGET.
    type Cand = { table: string; rowId: string; url: string };
    const candidates: Cand[] = [];
    const seen = new Set<string>();
    const pushCand = (table: string, rowId: string, url: string | null) => {
      if (!url || !/^https?:\/\//i.test(url)) return;
      const key = `${table}:${rowId}:${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ table, rowId, url });
    };

    const { data: failing } = await supabase
      .from("content_link_checks")
      .select("target_table, row_id, url")
      .eq("marked_dead", false)
      .gt("consecutive_failures", 0)
      .order("last_checked_at", { ascending: true })
      .limit(Math.floor(LINK_BUDGET / 2));
    for (const f of (failing ?? []) as { target_table: string; row_id: string; url: string }[]) {
      pushCand(f.target_table, f.row_id, f.url);
    }

    // Rotating sample of content links (newest content first).
    const sampleLimit = LINK_BUDGET;
    const [{ data: evLinks }, { data: rLinks }, { data: aLinks }] = await Promise.all([
      supabase.from("events").select("id, source_url").not("source_url", "is", null).is("archived_at", null).order("created_at", { ascending: false }).limit(sampleLimit),
      supabase.from("restaurants").select("id, website, source_url").order("updated_at", { ascending: false }).limit(sampleLimit),
      supabase.from("attractions").select("id, website").not("website", "is", null).order("updated_at", { ascending: false }).limit(sampleLimit),
    ]);
    for (const e of (evLinks ?? []) as { id: string; source_url: string | null }[]) pushCand("events", e.id, e.source_url);
    for (const r of (rLinks ?? []) as { id: string; website: string | null; source_url: string | null }[]) {
      pushCand("restaurants", r.id, r.website);
      pushCand("restaurants", r.id, r.source_url);
    }
    for (const a of (aLinks ?? []) as { id: string; website: string | null }[]) pushCand("attractions", a.id, a.website);

    const toProbe = candidates.slice(0, LINK_BUDGET);
    // Load existing state for just these links.
    const stateByKey = new Map<string, { id: string; consecutive_failures: number; marked_dead: boolean; first_failed_at: string | null }>();
    const unreadableState = new Set<string>();
    for (const c of toProbe) {
      const { data: existing, error: existingError } = await supabase
        .from("content_link_checks")
        .select("id, consecutive_failures, marked_dead, first_failed_at")
        .eq("target_table", c.table)
        .eq("row_id", c.rowId)
        .eq("url", c.url)
        .maybeSingle();
      // A dropped error reads as "no prior state for this link", so
      // consecutive_failures restarts at 1 every run and a genuinely dead link
      // never reaches marked_dead - the counter this table exists to keep is the
      // thing the missing error resets. Skip the candidate instead (WEB-BE-032 AC2).
      if (existingError) {
        unreadableState.add(`${c.table}:${c.rowId}:${c.url}`);
        console.warn(`[link-content-monitor] link state read failed for ${c.url}; skipping: ${existingError.message}`);
        continue;
      }
      if (existing) stateByKey.set(`${c.table}:${c.rowId}:${c.url}`, existing);
    }

    let okLinks = 0;
    let deadLinks = 0;
    for (const c of toProbe) {
      // Skipping the state read is not enough on its own: an unread link probed
      // with no prior state writes consecutive_failures back to 1, which is the
      // reset this guard exists to prevent. Leave the row untouched this run.
      if (unreadableState.has(`${c.table}:${c.rowId}:${c.url}`)) continue;
      const probe = await probeLink(c.url);
      const key = `${c.table}:${c.rowId}:${c.url}`;
      const prev = stateByKey.get(key);
      const prevFails = prev?.consecutive_failures ?? 0;
      const alreadyDead = prev?.marked_dead ?? false;

      let consecutive = probe.ok ? 0 : prevFails + 1;
      let markedDeadNow = alreadyDead;

      if (probe.ok) {
        okLinks++;
        // Recovery: a previously dead link that now responds is un-marked.
        if (alreadyDead) {
          markedDeadNow = false;
          await writeAgentAudit(supabase, {
            agentKey: AGENT_KEY,
            actionType: "unmark_dead_link",
            targetRef: c.url,
            before: { marked_dead: true },
            after: { marked_dead: false, reason: "link recovered" },
          });
        }
        // Ambiguous: 200 but redirected to a different host → human review.
        if (probe.redirectHost) {
          const task = await createAgentTask(supabase, {
            agentKey: AGENT_KEY,
            category: "maintain",
            title: `Link redirects to a different host: ${c.table} → ${probe.redirectHost}`,
            confidence: 0,
            forceTier: 2,
            dedupeKey: `link-redirect:${key}`,
            payload: { ...c, redirectHost: probe.redirectHost, status: probe.status },
          });
          if (task.ok) {
            ambiguousLinks++;
            ctx.escalated(1);
          }
        }
      } else if (probe.hardDead && consecutive >= FAIL_THRESHOLD && !alreadyDead) {
        // Tier-1 mark-dead — recorded (reversible), content row untouched.
        markedDeadNow = true;
        markedDead++;
        deadLinks++;
        await writeAgentAudit(supabase, {
          agentKey: AGENT_KEY,
          actionType: "mark_dead_link",
          targetRef: c.url,
          before: { marked_dead: false, consecutive_failures: prevFails },
          after: { marked_dead: true, status: probe.status, reversible: true },
        });
      } else if (!probe.ok) {
        deadLinks++;
      }

      await supabase.from("content_link_checks").upsert(
        {
          target_table: c.table,
          row_id: c.rowId,
          url: c.url,
          status_code: probe.status,
          ok: probe.ok,
          consecutive_failures: consecutive,
          marked_dead: markedDeadNow,
          first_failed_at: probe.ok ? null : (prev?.first_failed_at ?? nowIso),
          last_checked_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "target_table,row_id,url" },
      );
    }

    ctx.processed(pastEvents.length + toProbe.length);
    ctx.summary(
      `links/content: archived ${archived} past events (${recurringEscalated} recurring→tier2); ` +
        `probed ${toProbe.length} links — ${okLinks} ok, ${deadLinks} failing, ${markedDead} newly dead, ${ambiguousLinks} ambiguous→tier2`,
    );
    ctx.meta({ archived, recurringEscalated, probed: toProbe.length, okLinks, deadLinks, markedDead, ambiguousLinks });
    return { archived, recurringEscalated, probed: toProbe.length, markedDead, ambiguousLinks };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
