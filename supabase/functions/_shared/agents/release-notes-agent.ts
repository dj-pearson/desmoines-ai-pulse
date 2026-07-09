/**
 * agent release-notes (AOS-DEV-007) — records each release-notes draft run as a
 * budgeted/audited agent run. The draft itself is generated in CI
 * (scripts/gen-release-notes.mjs) and opened as a DRAFT PR; this endpoint just
 * persists the run record for the ledger + audit trail.
 *
 * Consolidated into `agent-runner` (was `agent-release-notes/index.ts`).
 */
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "release-notes-agent";

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const version = body.version ? String(body.version).slice(0, 40) : "Unreleased";
  // deno-lint-ignore no-explicit-any
  const s: any = body.summary && typeof body.summary === "object" ? body.summary : {};
  const commits = Number(s.commits) || 0;
  const prs = Number(s.prs) || 0;
  const entries = Number(s.entries) || 0;
  const compatFlags = Number(s.compatFlags) || 0;
  const surfaces = Array.isArray(s.surfaces) ? s.surfaces.slice(0, 5).map((x: unknown) => String(x)) : [];
  const range = s.range ? String(s.range).slice(0, 120) : null;

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
};
