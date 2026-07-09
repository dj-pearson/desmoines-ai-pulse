# Agentic OS (AOS)

**Status:** in progress — foundational layer landing story by story (AOS-CORE-\*).

The Agentic OS is the governance and runtime layer for every **autonomous agent**
on the platform — the scheduled jobs and event-driven workers that ingest
content, keep data clean, moderate, nurture subscribers, prospect advertisers,
support users, and watch security/health. Historically this behavior was
scattered across ~73 edge functions and a pile of pg_cron jobs with no single
place to see, budget, or govern it. AOS gives it one spine.

This doc covers the **agent registry** (AOS-CORE-001). Later stories layer on a
run ledger (AOS-CORE-002), a shared runtime harness (AOS-CORE-003), a tiered
task + escalation model (AOS-CORE-004/005), and a human escalation console
(AOS-CORE-006).

## The agent registry

`agent_registry` (migration `20260709000001_agent_registry.sql`) is the
canonical, authoritative record of every autonomous agent. One row per agent.

| Column | Type | Meaning |
|---|---|---|
| `agent_key` | `text` unique | Stable identifier an agent passes to `getAgentConfig`. |
| `name` | `text` | Human-readable name (shown in admin). |
| `category` | `agent_category` enum | One of the eight categories below. |
| `description` | `text` | What the agent does. |
| `schedule_cron` | `text` null | pg_cron expression for scheduled agents; `NULL` for event-/trigger-driven ones. |
| `enabled` | `bool` default `true` | Master on/off switch. Agents check this at start and no-op when off. |
| `tier1_confidence_threshold` | `numeric` default `0.85` | Minimum confidence at which the agent may act autonomously (tier-1). Below it, the work must escalate to a human queue (AOS-CORE-004/005). |
| `monthly_cost_budget_usd` | `numeric` null | Soft monthly spend ceiling (LLM + API). `NULL` = not yet set. |
| `owner_role` | `text` default `admin` | Human role accountable for the agent (`admin` / `root_admin`). |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by trigger. |

**RLS:** admin/root_admin only for **read and write** — this is governance
config, not public data. Agents themselves run with the service-role key, which
bypasses RLS, so `getAgentConfig` reads the table directly.

### Categories (`agent_category` enum)

| Category | Scope | Example agents |
|---|---|---|
| `dev` | Code maintenance, small automated PRs | `dev-agent` |
| `maintain` | Data quality, ingestion, housekeeping | `content-ingest`, `data-quality-heal`, `backfill-images`, `dedupe-content`, `sitemap-refresh`, `validate-source-urls` |
| `nurture` | Audience lifecycle + content marketing | `weekly-digest`, `ai-article-pipeline`, `social-media-manager`, `nurture-agent` |
| `prospect` | Find + qualify new business/advertisers | `prospect-agent` |
| `support` | Inbound customer support triage | `support-agent` |
| `manage` | Advertiser/partner account management | `account-manager-agent` |
| `security` | Security signal monitoring + incident triage | `security-agent` |
| `governance` | Policy/budget audit, moderation, health | `moderate-content`, `job-health-watchdog`, `governance-agent` |

The seed reflects reality on day one: the WEB-AUTO scheduled jobs that already
run are seeded `enabled = true`; the AOS program agents this initiative
introduces are seeded `enabled = false` until their story lands.

## Reading config from an agent

Every agent calls `getAgentConfig` at the start of a run and honors it:

```ts
import { getAgentConfig } from "../_shared/agentConfig.ts";

const config = await getAgentConfig(supabase, "data-quality-heal");
if (!config.enabled) {
  console.log("agent disabled in registry — skipping run");
  return;
}
// Use config.tier1ConfidenceThreshold to decide auto-act vs escalate,
// and config.monthlyCostBudgetUsd as the spend ceiling.
```

`getAgentConfig(supabase, agentKey)` takes the service-role client the edge
function already holds. A `getAgentConfigByKey(url, key, agentKey)` overload
exists for callers that only have url + key (mirrors `getAIConfig`).

**Fail-safe:** if the row is missing or the read errors, `getAgentConfig`
returns permissive defaults (`enabled: true`, `0.85` threshold, no budget) with
`found: false` and logs — a registry hiccup must never silently kill a live
agent. Results are cached for 60s per `agent_key`.

## The run ledger (AOS-CORE-002)

Every agent execution is recorded so reliability and spend are visible. Rather
than a parallel table, the WEB-AUTO run ledger `automation_job_runs` was
**extended** with `agent_key` (FK → `agent_registry`), `items_escalated`,
`tokens_used`, `cost_usd`, and `summary`, and its status vocabulary widened to
include `escalated` and `skipped` alongside the existing job statuses.

Agents wrap their work in `runAgent` (`supabase/functions/_shared/agentRun.ts`):

```ts
import { runAgent } from "../_shared/agentRun.ts";

const res = await runAgent("backfill-images", async (ctx) => {
  ctx.processed(updated);
  ctx.escalated(needsHuman);   // items routed to a human queue
  ctx.tokens(tokensUsed);
  ctx.cost(usd);
  ctx.summary(`updated ${updated}, escalated ${needsHuman}`);
  return { updated };
}, { client: supabase });
```

Outcome resolves to `failure` (fn threw), `skipped` (`ctx.skip()`), `escalated`
(items escalated, none processed), or `success`. Like `jobRunner`, every ledger
write is **best-effort and fail-open** — a ledger hiccup logs a warning and
never crashes the isolate or fails the agent's real work.

The `agent_run_summary` view exposes, per registered agent, its latest run plus
a 7-day rollup of successes/failures/escalations, items, tokens, and cost joined
to the registry budget — the query surface for the control-plane dashboard
(AOS-CORE-008). `backfill-images` is wired as the first covered agent; the other
WEB-AUTO jobs continue to use `jobRunner` and migrate to `runAgent` as they gain
agent semantics (tokens/cost/escalation).

## The runtime harness (AOS-CORE-003)

`supabase/functions/_shared/agentRuntime.ts` is the one reusable Claude
tool-calling loop, so agents stop copy-pasting (and drifting) their own loops.
It has two entry points:

- **`runAgent({agentKey, systemPrompt, tools, maxSteps, costCapUsd})`** — the
  autonomous entry. It checks the **global kill switch** (`aos_kill_switch`
  feature flag) and the agent's `enabled` flag in the registry and returns
  `{status: 'disabled'}` **without acting** when either is off; otherwise it
  records the run in the ledger (AOS-CORE-002), audits every tool action to
  `agent_action_log`, defaults to the latest Claude model (from
  `ai_configuration`), and delegates to `runToolLoop`. Each `tool` is
  `{name, description, input_schema, execute}`.
- **`runToolLoop(...)`** — the pure, ungated loop underneath it: cost cap,
  wall-clock timeout, bounded retries with backoff, optional prompt caching, and
  a terminating-tool (`finalToolName`) convention. User-facing tool-using
  endpoints (e.g. `discover-chat`) use this directly so they are **not** subject
  to the autonomous kill switch.

Guardrails enforced per run: a token/cost ceiling (`costCapUsd`, checked between
steps), a wall-clock `timeoutMs`, `maxSteps`, and transient-error retries. Every
tool action is written to `agent_action_log` (audit trail) correlated to the
ledger row via `run_correlation`.

`discover-chat` is the first edge function refactored onto the harness — its
bespoke loop is gone, its response is unchanged.

## How to add a new agent

1. **Register it.** Add a row to `agent_registry` in a new additive migration
   (or via Admin once the console lands), with a unique `agent_key`, the right
   `category`, a `schedule_cron` (or `NULL` if event-driven), an `owner_role`,
   a `tier1_confidence_threshold`, and a `monthly_cost_budget_usd`.
2. **Read config at start.** Call `getAgentConfig(supabase, "<agent_key>")` and
   bail early when `!enabled`. Use the threshold to gate autonomous action vs
   escalation, and the budget as a spend ceiling.
3. **Schedule it.** If `schedule_cron` is set, add the matching pg_cron job and
   document it in [`AUTOMATION_JOBS.md`](./AUTOMATION_JOBS.md). Wrap the run in
   `jobRunner.runJob` so it shows up in Admin → Job Health.
4. **Keep the two in sync.** The registry's `schedule_cron` should mirror the
   real pg_cron schedule; `AUTOMATION_JOBS.md` remains the cron inventory.

## Related docs

- [`AUTOMATION_JOBS.md`](./AUTOMATION_JOBS.md) — the pg_cron inventory (schedules).
- `supabase/functions/_shared/agentConfig.ts` — the `getAgentConfig` accessor.
- `supabase/functions/_shared/jobRunner.ts` — run observability wrapper.
