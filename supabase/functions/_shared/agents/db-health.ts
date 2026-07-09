/**
 * agent db-health (AOS-MAINT-002) — database health agent.
 *
 * Daily, calls the admin-only db_health_report RPC (slow queries, unused /
 * missing indexes, bloat, connections) and opens tier-2 tasks with concrete,
 * copy-pasteable suggestions. Index suggestions are drafted as **additive
 * CREATE INDEX CONCURRENTLY** migrations — proposed only, never applied. The
 * agent inspects and proposes; a human / AOS-DEV applies.
 *
 * Consolidated into `agent-runner` (was `agent-db-health/index.ts`).
 */
import { createAgentTask } from "../agentTasks.ts";
import { notifyOps } from "../notifyOps.ts";
import type { AgentRun } from "./types.ts";

interface DbHealthReport {
  generated_at: string;
  pg_stat_statements: boolean;
  slow_queries: { query: string; mean_ms: number; calls: number; total_ms: number }[];
  unused_indexes: { table_name: string; index_name: string; index_size: string }[];
  missing_index_candidates: { table_name: string; seq_scan: number; idx_scan: number; live_rows: number }[];
  bloated_tables: { table_name: string; dead_rows: number; live_rows: number; dead_ratio: number; total_size: string }[];
  connections: { total: number; active: number; idle_in_transaction: number; max_connections: number };
}

const AGENT_KEY = "db-health";

// Additive index-migration draft — a suggestion, never auto-applied.
function indexDraft(table: string): string {
  return `-- Suggested (additive, CONCURRENTLY — safe online). Review columns before applying.\n` +
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${table}_review\n  ON public.${table} (/* column(s) driving the seq scans */);`;
}

export const run: AgentRun = async (ctx, { supabase }) => {
  const { data, error } = await supabase.rpc("db_health_report");
  if (error) throw new Error(`db_health_report RPC failed: ${error.message}`);
  const report = data as DbHealthReport;

  let opened = 0;
  const openTask = async (key: string, title: string, tier: 2 | 3, payload: Record<string, unknown>) => {
    const task = await createAgentTask(supabase, {
      agentKey: AGENT_KEY,
      category: "maintain",
      title,
      confidence: 0, // read-only suggestion, always human-reviewed
      forceTier: tier,
      dedupeKey: key,
      payload,
    });
    if (task.ok) {
      opened++;
      ctx.escalated(1);
    }
  };

  // Missing-index candidates → one task per table with an additive draft.
  for (const m of report.missing_index_candidates ?? []) {
    await openTask(
      `db-missing-index:${m.table_name}`,
      `Missing index? ${m.table_name} — ${m.seq_scan} seq scans over ${m.live_rows} rows`,
      2,
      { finding: "missing_index", ...m, suggestion: indexDraft(m.table_name) },
    );
  }
  // Unused indexes → suggest dropping (a human decides; DROP is destructive so
  // it must follow the deprecation flow — noted, not drafted as a migration).
  if ((report.unused_indexes ?? []).length > 0) {
    await openTask(
      `db-unused-indexes`,
      `${report.unused_indexes.length} unused index(es) — review for removal`,
      2,
      {
        finding: "unused_indexes",
        indexes: report.unused_indexes,
        note: "DROP INDEX is destructive per CLAUDE.md — remove only via the multi-release deprecation flow, never in the release that stops using it.",
      },
    );
  }
  // Bloated tables → suggest VACUUM/autovacuum tuning.
  for (const b of report.bloated_tables ?? []) {
    await openTask(
      `db-bloat:${b.table_name}`,
      `Table bloat: ${b.table_name} — ${Math.round(b.dead_ratio * 100)}% dead tuples (${b.total_size})`,
      2,
      { finding: "bloat", ...b, suggestion: `VACUUM (ANALYZE) public.${b.table_name}; -- or tune autovacuum for this table` },
    );
  }
  // Slow queries → a single digest task (queries are already normalized).
  if ((report.slow_queries ?? []).length > 0) {
    await openTask(
      `db-slow-queries`,
      `${report.slow_queries.length} slow query pattern(s) (mean ≥ threshold)`,
      2,
      { finding: "slow_queries", queries: report.slow_queries },
    );
  }

  // Connection pressure alert (immediate, not just a task) when saturated.
  const c = report.connections;
  if (c && c.max_connections > 0 && c.total / c.max_connections >= 0.8) {
    await notifyOps(supabase, {
      severity: "high",
      title: `DB connections at ${Math.round((c.total / c.max_connections) * 100)}% of max`,
      body: `total ${c.total}/${c.max_connections}, active ${c.active}, idle-in-txn ${c.idle_in_transaction}`,
      dedupeKey: "db-connections-saturated",
      capWindowMs: 60 * 60 * 1000,
    });
  }

  ctx.processed(
    (report.slow_queries?.length ?? 0) +
      (report.unused_indexes?.length ?? 0) +
      (report.missing_index_candidates?.length ?? 0) +
      (report.bloated_tables?.length ?? 0),
  );
  ctx.summary(
    `db health: ${report.missing_index_candidates?.length ?? 0} missing-index, ` +
      `${report.unused_indexes?.length ?? 0} unused-index, ${report.bloated_tables?.length ?? 0} bloat, ` +
      `${report.slow_queries?.length ?? 0} slow; ${opened} task(s)`,
  );
  ctx.meta({
    pgss: report.pg_stat_statements,
    missing: report.missing_index_candidates?.length ?? 0,
    unused: report.unused_indexes?.length ?? 0,
    bloat: report.bloated_tables?.length ?? 0,
    slow: report.slow_queries?.length ?? 0,
    connections: report.connections,
    opened,
  });
  return { opened, connections: report.connections };
};
