/**
 * SECURITY: verify_jwt = false
 * Reason: CI-invoked; auth via requireAdminOrApiKey per WEB-SEC-001 (the
 *   release-notes workflow posts with EDGE_FUNCTION_API_KEY).
 * Risk level: LOW (records a changelog-draft summary; no code executed, no user data).
 *
 * agent-release-notes (AOS-DEV-007) — records each release-notes draft run as a
 * budgeted/audited agent run. The draft itself is generated in CI
 * (scripts/gen-release-notes.mjs) and opened as a DRAFT PR; this endpoint just
 * persists the run record for the ledger + audit trail.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";
import { writeAgentAudit } from "../_shared/auditLog.ts";

const AGENT_KEY = "release-notes-agent";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
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

  const body = await req.json().catch(() => ({}));
  const version = body.version ? String(body.version).slice(0, 40) : "Unreleased";
  const s = body.summary && typeof body.summary === "object" ? body.summary : {};
  const commits = Number(s.commits) || 0;
  const prs = Number(s.prs) || 0;
  const entries = Number(s.entries) || 0;
  const compatFlags = Number(s.compatFlags) || 0;
  const surfaces = Array.isArray(s.surfaces) ? s.surfaces.slice(0, 5).map((x: unknown) => String(x)) : [];
  const range = s.range ? String(s.range).slice(0, 120) : null;

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    ctx.processed(entries);
    ctx.summary(
      `Release notes ${version}: ${entries} entries from ${commits} commits / ${prs} PRs; ` +
        `${compatFlags} compat flag(s); surfaces ${surfaces.join("/") || "web"}`,
    );
    await writeAgentAudit(supabase, {
      agentKey: AGENT_KEY,
      actionType: "release_notes_draft",
      targetRef: `release:${version}`,
      after: { version, range, commits, prs, entries, compatFlags, surfaces },
    });
    ctx.meta({ version, commits, prs, entries, compatFlags, surfaces });
    return { version, entries, compatFlags, surfaces };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
