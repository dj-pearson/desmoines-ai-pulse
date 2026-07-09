/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (read-only backup recency + row counts; opens an incident on
 *   stale/missing backups — never mutates data or triggers a restore).
 *
 * agent-backup-verify (AOS-MAINT-003) — backup verification.
 *
 * Daily:
 *  1. Backup recency — if a Supabase Management API token is configured
 *     (SUPABASE_ACCESS_TOKEN + project ref, derived from SUPABASE_URL), fetch
 *     the physical backup list and compute the age of the most recent backup.
 *  2. Restore-sanity spot check — read-only row counts of core content tables
 *     (a proxy that live, restorable data is present).
 *
 * Records the result to `backup_checks` and the ledger. A missing or STALE
 * backup (older than STALE_HOURS) opens a **tier-3 incident** and notifies ops
 * immediately. An unverifiable backup age (no Management API token) is recorded
 * but does not page — the row spot-check still runs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { createAgentTask } from "../_shared/agentTasks.ts";
import { notifyOps } from "../_shared/notifyOps.ts";

const AGENT_KEY = "backup-verifier";
const STALE_HOURS = 26; // daily backups: >26h without a fresh backup is stale
const CORE_TABLES = ["events", "restaurants", "attractions", "profiles"];

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function projectRef(): string | null {
  const explicit = Deno.env.get("SUPABASE_PROJECT_REF");
  if (explicit) return explicit;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

interface BackupRecency {
  available: boolean; // could we query the Management API?
  latestBackupAt: string | null;
  ageHours: number | null;
}

async function fetchBackupRecency(): Promise<BackupRecency> {
  const token = Deno.env.get("SUPABASE_ACCESS_TOKEN");
  const ref = projectRef();
  if (!token || !ref) return { available: false, latestBackupAt: null, ageHours: null };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { available: false, latestBackupAt: null, ageHours: null };
    const body = await res.json().catch(() => ({}));
    // Response shape: { backups: [{ inserted_at | created_at, status, ... }], ... }
    const backups: { inserted_at?: string; created_at?: string; status?: string }[] = Array.isArray(body?.backups)
      ? body.backups
      : Array.isArray(body)
        ? body
        : [];
    const times = backups
      .map((b) => b.inserted_at || b.created_at)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return { available: true, latestBackupAt: null, ageHours: null };
    const latest = Math.max(...times);
    return {
      available: true,
      latestBackupAt: new Date(latest).toISOString(),
      ageHours: Math.round(((Date.now() - latest) / (60 * 60 * 1000)) * 10) / 10,
    };
  } catch {
    return { available: false, latestBackupAt: null, ageHours: null };
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
    // 1) Backup recency (Management API when configured).
    const recency = await fetchBackupRecency();

    // 2) Restore-sanity spot check: core tables have live rows.
    const rowCounts: Record<string, number> = {};
    let emptyCoreTable = false;
    for (const table of CORE_TABLES) {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true });
      rowCounts[table] = count ?? 0;
      if ((count ?? 0) === 0) emptyCoreTable = true;
    }

    // Verdict: stale/missing backup (only when we could actually read recency),
    // or a core table unexpectedly empty (restore-sanity failure).
    const stale = recency.available && (recency.ageHours == null || recency.ageHours > STALE_HOURS);
    const method = recency.available ? "management_api" : "row_spotcheck";
    const ok = !stale && !emptyCoreTable;

    await supabase.from("backup_checks").insert({
      method,
      ok,
      latest_backup_at: recency.latestBackupAt,
      backup_age_hours: recency.ageHours,
      row_counts: rowCounts,
      details: { staleThresholdHours: STALE_HOURS, recencyAvailable: recency.available, emptyCoreTable },
    });

    // Missing/stale backup → tier-3 incident + immediate notify.
    let incident = false;
    if (stale || emptyCoreTable) {
      const reason = emptyCoreTable
        ? `restore-sanity failed — a core table returned 0 rows (${JSON.stringify(rowCounts)})`
        : recency.ageHours == null
          ? `no backup found via Management API`
          : `latest backup is ${recency.ageHours}h old (> ${STALE_HOURS}h)`;
      const task = await createAgentTask(supabase, {
        agentKey: AGENT_KEY,
        category: "maintain",
        title: `Backup verification FAILED — ${reason}`,
        confidence: 0,
        forceTier: 3,
        dedupeKey: "backup-verification-failed",
        payload: { method, reason, recency, rowCounts, staleThresholdHours: STALE_HOURS },
      });
      if (task.ok) {
        incident = true;
        ctx.escalated(1);
      }
      await notifyOps(supabase, {
        severity: "high",
        title: "Backup verification FAILED",
        body: reason,
        dedupeKey: "backup-verification-failed",
        capWindowMs: 12 * 60 * 60 * 1000,
      });
    } else {
      // Recovery: resolve any open backup incident once verification passes.
      const { data: open } = await supabase
        .from("agent_tasks")
        .select("id")
        .eq("agent_key", AGENT_KEY)
        .eq("dedupe_key", "backup-verification-failed")
        .in("status", ["open", "escalated", "assigned", "auto_resolving"])
        .limit(1);
      const openRows = (open ?? []) as { id: string }[];
      if (openRows.length > 0) {
        await supabase
          .from("agent_tasks")
          .update({
            status: "resolved",
            resolution: { auto: true, reason: "backup verification passed", method },
            updated_at: new Date().toISOString(),
          })
          .eq("id", openRows[0].id);
      }
    }

    ctx.processed(CORE_TABLES.length);
    ctx.summary(
      `backup verify (${method}): ${ok ? "OK" : "FAILED"}` +
        (recency.ageHours != null ? `, latest ${recency.ageHours}h old` : "") +
        `; rows ${JSON.stringify(rowCounts)}`,
    );
    ctx.meta({ ok, method, recency, rowCounts, incident });
    return { ok, method, ageHours: recency.ageHours, incident };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
