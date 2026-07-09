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

## Cost budgets (AOS-GOV-001)

Two caps keep autonomous LLM/API work from silently burning money:

- **Per-run**: `runToolLoop` stops at `costCapUsd` (default $0.50), checked
  between steps.
- **Monthly**: before any work, the runtime reads month-to-date spend from
  `agent_month_spend` (summed from the ledger's `cost_usd`) and compares it to
  `agent_registry.monthly_cost_budget_usd`. On breach the run **hard-stops
  before acting** (no partial state), records a `failure` run with
  `reason=budget`, opens a tier-2 task, and alerts ops.

Both fail safe: an unknown/unpriced model is costed with an **estimate** (the
default per-token rate), never zero, so spend can't hide; and a budget-read
error is treated as "no budget" so a metrics hiccup can't wrongly block an
agent. The `/admin/agents` header shows OS spend this month, budget, and any
over-budget agents.

## Confidence thresholds + auto-vs-human tuning (AOS-CORE-011)

Each agent's `tier1_confidence_threshold` is the line between acting
autonomously (tier 1) and escalating to a human — and the right line differs by
category. Admins tune it (and `monthly_cost_budget_usd`) per agent from the
**Config** button on `/admin/agents`. `getAgentConfig`/`createAgentTask` read the
registry live (≤60s cache), so tuning takes effect **without a deploy**; every
change is audited.

Seeded defaults lean conservative where mistakes are costly:

| Category | Default tier-1 threshold | Rationale |
|---|---|---|
| `security`, `governance` | 0.95 | destructive / policy — act only when almost certain |
| `dev`, `maintain` | 0.85–0.90 | code + data changes; medium caution |
| `manage`, `support` | 0.85 | account / customer actions |
| `nurture` | 0.80 | content/marketing; cheaper to get wrong |
| `prospect` | 0.75 | discovery; low blast radius |

**Safety floor:** for financial/destructive categories (`security`, `manage`),
a DB trigger (`enforce_threshold_floor`) rejects a threshold below **0.80**
unless `auto_override` is explicitly set — so you can't quietly make a sensitive
agent near-fully-auto. The config dialog surfaces the override checkbox and the
floor error for those categories.

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

## Notifications (AOS-CORE-010)

The OS reaches out — operators don't watch the console. `notifyOps`
(`supabase/functions/_shared/notifyOps.ts`) is the one place agents send
operational notifications, routed by severity over Resend email and an optional
Slack-compatible webhook (`OPS_WEBHOOK_URL`):

- **Immediate**: tier-2/3 escalations (from the router) and agent failures (from
  `agentRun`) send now, coalesced per queue / per agent.
- **Batched**: low-severity items (tier-1 auto-resolutions, open-task counts)
  are summarized once a day by the `agent-ops-digest` cron.

`notifyOps` is **frequency-capped**: a repeat with the same `dedupeKey` inside
the cap window (default 15 min) bumps a suppressed counter in
`ops_notification_log` instead of sending — so a storm of tasks is one alert,
not a hundred. Every delivery is **fail-safe**: a send error is logged and never
blocks the originating agent.

## Tasks + escalation (AOS-CORE-004)

`agent_tasks` is the shared record for every work item an agent produces,
classified **tier-1 (auto-resolve)** vs **tier-2/3 (human)**. Agents file tasks
with `createAgentTask` (`supabase/functions/_shared/agentTasks.ts`):

```ts
import { createAgentTask } from "../_shared/agentTasks.ts";

const { tier, status } = await createAgentTask(supabase, {
  agentKey: "dedupe-content",
  category: "maintain",
  title: "Merge duplicate: 'Farmers Market' x2",
  confidence: 0.94,
  payload: { primaryId, duplicateId },
});
// confidence >= the agent's tier1_confidence_threshold -> tier 1 (auto_resolving)
// below it -> tier 2/3 (escalated to a human)
```

Tiering uses the agent's `tier1_confidence_threshold` from the registry:
`confidence ≥ threshold` → tier 1; `≥ threshold/2` → tier 2; below → tier 3
(senior review). An SLA due date is computed from a per-category policy
(`SLA_HOURS`, tightest for `security`/`support`). The `agent_tasks_overdue` view
surfaces open/assigned work past its SLA for the escalation console
(AOS-CORE-006). RLS: agents write via the service role, admins read/update, and
`created_at` is immutable (trigger).

## The escalation console (AOS-CORE-006)

`/admin/inbox` (protected, admin-only) is where tier-2/3 operators work escalated
tasks. It lists `agent_tasks` in `escalated`/`assigned` status via the
`useAgentTasks` TanStack Query hook, with filters for tier, category, agent, and
SLA (overdue rows highlighted). An operator can **claim** a task (assigns it to
themselves), and **resolve** or **close** it — the resolution (with who acted and
when) is written to the task's `resolution` jsonb as the human-action record. The
detail sheet shows the task payload, the producing agent's latest run (from
`agent_run_summary`), and any AI-suggested resolution in the payload.

## Kill switch + global pause (AOS-CORE-009)

Every agent can be stopped instantly, without a deploy. An agent is **paused**
when either the global kill switch (`aos_kill_switch` feature flag) is on, or its
own `agent_registry.enabled` is false. The check (`_shared/agentGuards.ts`
`agentPaused`) is enforced **centrally in the shared run wrappers** — `runJob`
and `runAgent` — so *every* agent that records a run honors it without per-agent
code. When paused, the wrapper records a **skipped** run and never calls the
work function, so the gap is visible in the ledger and control-plane. The check
is **fail-open**: a read error is treated as "not paused" so a database hiccup
can never silently halt automation. Infra jobs (e.g. the health watchdog) can
opt out with `runJob(..., { exemptFromPause: true })`.

### How to pause in an incident

1. Open **`/admin/agents`** and flip the red **Global pause** switch at the top
   (one click; audited to `security_audit_logs`). It writes `aos_kill_switch =
   true` and takes effect on the **next** agent invocation — within ~15s (the
   guard's cache TTL), no deploy.
2. Every scheduled agent then records a `skipped` run instead of acting; the
   dashboard shows the gap.
3. To stop a **single** misbehaving agent instead, toggle just that agent's
   enable switch on the same page.
4. Resume by flipping the switch back off.

If the console is unreachable, the same effect comes from setting
`feature_flags.enabled = true` where `flag_key = 'aos_kill_switch'` directly.

## Control-plane dashboard (AOS-CORE-008)

`/admin/agents` (protected) is the single operating view: every agent from
`agent_registry` joined to its `agent_run_summary` rollup — last run, 7- and
30-day success rate, items processed vs escalated, and 30-day spend vs the
registry budget (over-budget highlighted), with a Recharts spend-by-agent chart.
Each agent has an enable/disable `Switch` and a **Run now** button; both route
through the `agent-control` edge function (admin-authenticated, audited) — toggle
writes `agent_registry.enabled`, run maps the agent to its edge function and
fires it. A drill-in sheet shows that agent's run history with error details.

## Flaky-test + CI-health watcher (AOS-DEV-005)

`.github/workflows/ci-health-report.yml` fires on **`workflow_run` completion**
of the test workflows (PR Checks, E2E, Android/iOS CI) and records each run's
conclusion, duration, and branch to `ci_runs` via `agent-ci-health`
(`mode:ingest`). The `ci-health-watcher` agent (every 6h, `mode:analyze`) then,
per workflow over a 2-week window: flags **flaky** workflows (reported flakes or
a mixed 10–60% failure rate — a clean break isn't flaky) with a deduped tier-2
fix task recommending quarantine/annotation, and detects **duration
regressions** (recent half > 1.5× the older half) raising an ops alert. Open
flaky/slow tasks are reported in the ops digest.

## Test-coverage agent (AOS-DEV-004)

The `test-coverage-agent` (`aos-test-gen.yml`, manual dispatch) writes tests for
high-value uncovered paths. `agent-test-gen` (`mode:target`) picks the next area
— **error-cluster hotspots first** (AOS-DEV-001), then a curated critical-path
rotation (auth, subscription/entitlement, edge-contract decode) — skipping areas
with an already-open test task. The workflow drives Claude Code with
`scripts/ralph/AOS-TEST.md` (which mandates **deterministic, no-live-network**
tests), then **runs the generated tests** (type-check + Playwright); a PR to
develop is opened **only when they pass**. A human reviews and merges — nothing
auto-merges. `mode:record` tracks the delivered test / logs a failure.

## Dependency-update agent (AOS-DEV-003)

The `dependency-update-agent` (`dependency-update.yml`, weekly) runs
`npm outdated`, splits updates into **non-breaking** (same major) and **majors**,
and prioritizes packages with an **open CVE task** (queried from `agent-dep-update`
`mode:priority` — coordinates with AOS-SEC-002). It applies the grouped
non-breaking bumps, gates them on `npm run validate && npm run build`, and opens
a PR **only when green** (red annotates the failure, no PR). Major-version bumps
are escalated to deduped **tier-2** review tasks via `agent-dep-update`
`mode:majors` — they can break, so a human reviews them.

## PR code-review agent (AOS-DEV-006)

`.github/workflows/pr-review.yml` runs on every PR to main/develop and reviews
the diff **deterministically** (`scripts/pr-review.mjs`) for high-confidence
CLAUDE.md violations: destructive migrations in one release (DROP/RENAME
COLUMN/TABLE/TYPE), direct `localStorage`, `process.env` in web code — plus
advisory nits (unwrapped `console`, `any`). Findings post as **inline
annotations** (errors on the changed lines); the check **blocks only on
high-confidence violations** and nits are advisory. It **fails open** — the
reviewer's own error prints a notice and never hard-fails the PR. Deterministic
means zero LLM budget; each review is recorded as an audited run via
`agent-pr-review`. (Semantic checks like RLS/rate-limit tightening are left out
deliberately — a false-positive block is worse than a miss.)

## Release-notes / changelog generator (AOS-DEV-007)

`.github/workflows/release-notes.yml` (manual dispatch, or on a `release/**`
push) turns the commit history since the last `v*` tag into a **draft** changelog
entry. `scripts/gen-release-notes.mjs` reads `git log <last-tag>..HEAD`
**deterministically** (no LLM budget) and:

- **Categorizes** each conventional commit into sections (feat / fix / perf /
  refactor / docs / test / chore; anything else → _Other_).
- **Distinguishes surfaces** by the files each commit touched — Web
  (`src/`, `supabase/`, `public/`, root config), iOS (`ios/`, `*.swift`), Android
  (`android/`, `*.kt/*.gradle`) — so a release note says which client each change
  affects.
- **Flags backward-compat-sensitive changes** for the release checklist per
  CLAUDE.md: destructive statements in a migration (DROP/RENAME COLUMN/TABLE/TYPE,
  SET NOT NULL, DROP DEFAULT) and **modified** edge-function contracts (newly
  *added* functions are additive-safe and skipped). Each becomes an unchecked
  checklist item — surfaced, never auto-blocked.
- **Links merged PRs** (`(#123)` squash subjects + merge commits).

The workflow prepends the entry to `CHANGELOG.md` and opens a **DRAFT PR to
develop** — a human edits and publishes; nothing is auto-released. The generator
**fails open** (a changelog hiccup never blocks CI), and each run is recorded as a
budgeted/audited run via `agent-release-notes`.

## Autonomous fix agent (AOS-DEV-002)

The `dev-fix-agent` formalizes the Ralph loop for **tier-1 dev tasks** (from the
error pipeline and dependency scanner). The `aos-fix-agent.yml` workflow
(manual dispatch — a safe-rollout gate) claims a task via `agent-dev-fix`
(`mode:claim`), cuts a `claude/aos-fix-<taskid>` branch **from develop**, runs a
scoped fix (Claude Code with `scripts/ralph/AOS-FIX.md`), runs
`npm run type-check && lint`, and — only on green — opens a **draft PR to
develop** for a human to merge. It never commits to `main`/`develop` and never
auto-merges.

Each attempt is recorded via `agent-dev-fix` (`mode:record`, budgeted + audited
through the ledger): a success resolves the task with the PR link; a failure
keeps it open with the failure logged, and after 3 failed attempts it
**escalates to tier-2**. Scope guardrails (blast-radius only, branching rules,
abort-if-uncertain) live in `AOS-FIX.md`.

## Production-error pipeline (AOS-DEV-001)

Raw error noise becomes actionable dev tasks. `@/lib/errorHandler` (and edge
functions) ship errors to the `log-error` sink, which **scrubs PII** (emails,
tokens, UUIDs, numbers, URL params) and stores a row in `error_events` with a
stable cluster **signature** (`_shared/scrubPii.ts`). The client throttles sends
(one per message/minute) so an error storm can't flood the sink.

The `error-triage` agent (every 30 min, over 24h) clusters `error_events` by
signature into de-duplicated dev tasks carrying **frequency, first/last seen,
affected routes, and affected-user count**. Tier is set by severity/frequency:
a high-frequency user-facing cluster (≥10 client-side occurrences) is **tier-2**,
rare/benign is **tier-1 backlog**. A signature with no recurrence in the window
**auto-closes** its task. No PII from error payloads is ever stored — only the
scrubbed message and light context.

## Compliance monitor (AOS-SEC-007)

The `compliance-monitor` agent (`agent-compliance-monitor`, weekly) tracks
legal-risk gaps and opens tier-2 review tasks:

- **Deletion SLA** — an `account_deletion_tokens` row still present past the
  30-day SLA suggests a deletion request that may not have completed (the row
  cascade-deletes with the user), so it's surfaced for review.
- **Retention** — rows past policy on telemetry/PII tables (`login_attempts`
  90d, `security_audit_logs` 180d) are **flagged for review only**; the agent
  never hard-deletes — a retention purge is approval-gated.
- **Consent** — required consent types must have granted-consent coverage.

Open compliance items appear in the ops digest. (Data-export requests aren't yet
tracked in a table, so that check is best-effort until one exists.) Nothing here
mutates the consent/deletion shapes older mobile binaries depend on.

## RLS / config drift audit (AOS-SEC-006)

The one-time WEB-SEC-005 RLS audit is now continuous. The
`.github/workflows/rls-config-audit.yml` workflow (daily) regenerates the audit
(`scripts/audit-rls.ts --json` → `docs/rls-audit-findings.json`) and a security
config snapshot (`scripts/security-config-snapshot.ts` → verify_jwt exemptions,
CSP, CORS) and **diffs them against the committed baselines** (`git show HEAD:…`).
Any drift — new permissive-write / anon-write / missing-RLS / unpinned
SECURITY-DEFINER finding, or a verify_jwt / CSP / CORS change vs the
WEB-SEC-001/004 baselines — is POSTed to `agent-config-audit`, which opens one
deduped **tier-2** task; a clean run just records success (and clears any open
drift task).

**Updating the baseline** is an audited admin action: after reviewing intended
drift, regenerate and commit `docs/RLS_AUDIT.md`,
`docs/rls-audit-findings.json`, and `docs/security-config-baseline.json` (the
PR review + the drift task's resolution are the audit record).

## Incident-response runbooks (AOS-SEC-005)

Incident tasks carry a codified **runbook** (`_shared/runbooks.ts`) mapping the
incident type to an ordered set of response steps. A responder opens the task in
`/admin/inbox` and triggers steps:

- **Safe, reversible steps** (`notify_ops`, `rotate_reminder`) run immediately
  (tier-1).
- **Account/data-affecting steps** (`revoke_sessions`, `lock_account`,
  `block_ip`, `throttle_client`, `flag_account_review`,
  `reconcile_entitlement`) are **approval-gated** — triggering them queues a
  human approval (AOS-CORE-007) rather than executing.

| Incident type | Steps |
|---|---|
| credential_stuffing | notify · block IP\* · revoke sessions\* |
| quota_abuse | notify · throttle client\* |
| refund | notify · flag account review\* |
| entitlement | notify · reconcile entitlement\* |
| secret_leak | notify · rotation reminder · revoke sessions\* |
| generic / policy_violation | notify |

<sup>\* approval-gated</sup>

Every triggered step is **audited** (`runbook_step:<id>` in `agent_audit_log`)
and appended to the incident task's `payload.timeline`, shown in the inbox.

## Fraud & abuse detector (AOS-SEC-004)

The `fraud-abuse-detector` agent (`agent-fraud-monitor`, every 6h) correlates
`payments` (refunds/chargebacks), `user_subscriptions` (entitlement), and
`usage_events` (AI quota) over 24h to flag **refund/chargeback risk**, **per-user
AI-quota abuse**, and **mismatched entitlements** (an active subscription with no
successful payment). Each finding opens a deduped **tier-2 incident with
evidence** for a human — the agent takes **no account-affecting action itself**.
Per WEB-SEC-002 it never tightens shipped client rate limits below their retry
thresholds; tier-1 auto-action is limited to safe throttling within the existing
rate-limit infra, so account impacts (suspend, throttle a paid user, refund
disputes) are always human-confirmed. Findings are audited via the task trail.

## Secret-leak scanning (AOS-SEC-003)

Two layers, extending WEB-SEC-008 hygiene:

- **Block before it lands** — `.github/workflows/secret-scan.yml` scans each PR
  diff and **fails the build** on a JWT/anon-key shape, an iOS `Secrets` file, or
  a provider key pattern (Stripe `sk_live`, AWS `AKIA…`, Google `AIza…`, private
  keys, high-entropy `key=…` assignments). Placeholders (`.env.example`, `*.md`,
  and obvious example / `process.env` references) are allowlisted; the failure
  message never echoes the value.
- **Detect if it slips in** — `.github/workflows/secret-history-scan.yml` (daily)
  scans the tree and POSTs findings as **`{file, line, type}` only — never the
  secret value** to `agent-secret-scan`, which opens one deduped **tier-3
  incident** listing the locations and linking the rotation runbook (and
  auto-closes it when the tree is clean).

### Secret rotation runbook

When a secret leak incident opens:

1. **Rotate first, investigate second.** Immediately revoke/rotate the exposed
   key at the provider (Supabase service key, Stripe, Anthropic, Resend, etc.).
2. **Update the secret** in Supabase (`supabase secrets set KEY=…`) and any CI
   secret store — never in the repo.
3. **Purge from the tree** and, if it was committed, from history
   (`git filter-repo`/BFG) on a coordinated force-push, then re-run the scan.
4. **Confirm** the incident auto-closes on the next clean scan, and note the
   rotation in the task resolution.

## Dependency & CVE scanner (AOS-SEC-002)

Because `npm audit` needs a Node environment, the scan runs in CI: the
`.github/workflows/dependency-scan.yml` workflow runs `npm audit --json` daily
and POSTs the report to the `agent-dep-scan` edge function (with
`EDGE_FUNCTION_API_KEY`). The function opens remediation tasks per advisory —
**low/moderate with a fix available → tier-1** (auto patch, handed to
AOS-DEV-003 via the payload `handoff`), **high/critical → tier-2** (human) — and
is idempotent per package (`cve:<name>` dedupe key). CVE tasks whose package no
longer appears in the audit are **auto-closed** (`resolved`). The daily ops
digest reports the open-CVE count. (Deno edge-function deps are pinned URLs with
no standard CVE feed, so they're reviewed at upgrade time rather than
auto-scanned.)

## Security anomaly detector (AOS-SEC-001)

The `security-anomaly-detector` agent (`agent-security-monitor`, every 15 min)
reads `login_attempts`, `rate_limit_entries`, and `security_audit_logs` over a
20-minute window and opens incident tasks. It **only reads and opens tasks** —
it never locks a user; remediation is always human-confirmed.

**Detection rules:**

| Signal | Rule | Incident |
|---|---|---|
| Credential stuffing (IP) | ≥ 15 failed logins from one IP / 20 min | tier-3 (high) |
| Credential stuffing (account) | one email failed from ≥ 5 distinct IPs / 20 min | tier-3 (high) |
| Quota abuse | a `client_id` with ≥ 300 requests across a 20-min window | tier-2 (medium) |
| High-severity events | ≥ 1 `high` severity row in `security_audit_logs` / 20 min | tier-3 (high) |
| Admin-action burst | ≥ 10 `admin_action` rows / 20 min | tier-2 (medium) |

Each incident carries its evidence (counts, IPs, samples) in the task payload
and is **idempotent** — `createAgentTask`'s `dedupeKey` means an ongoing anomaly
re-detected each run updates one task instead of stacking duplicates. Findings
below threshold are simply scanned (auto-noted in the run summary), not
escalated. The agent runs through the ledger wrapper so it's kill-switch aware
and its runs are recorded.

## Shadow / dry-run mode (AOS-GOV-005)

Every agent has a `mode` in the registry — **`shadow`** (the default for new
agents) or **`live`**. In shadow mode the runtime computes what it *would* do
but executes nothing: each state-changing tool call is recorded to
`agent_audit_log` with `shadow = true` and returns a `shadow_logged` result
instead of running (read-only tools still run so the agent can compute real
proposals). This lets an operator observe a new agent against reality before it
touches production. `getAgentConfig` **fails safe to shadow** — an
unregistered/unreadable agent can't act.

The `/admin/agents` list badges shadow agents, `/admin/agent-audit` flags shadow
proposals (with their before/after), and the per-agent Config dialog has a
**Live mode** switch. Promoting a `security`/`manage` (financial/destructive)
agent to live is gated behind the AOS-CORE-011 safety floor — it requires an
explicit `auto_override` — and the flip is audited. The WEB-AUTO jobs and
control-plane agents already in production ship as `live`; the AOS program
agents ship `shadow`.

## Output quality evaluation (AOS-GOV-004)

Before an agent ships user-facing content, it runs it through the LLM-judge
`scoreOutput` (`_shared/scoreOutput.ts`): a single lightweight (Haiku) call that
scores the content 0–100 against a **per-category rubric** (brand voice +
accuracy for `nurture`, helpfulness + safe info for `support`, etc.).
`evaluateAndGate` wraps it: if the score is **below the per-category threshold**
(`QUALITY_THRESHOLD`), the work is **downgraded to a tier-2 human review task**
instead of auto-executing; otherwise the caller proceeds.

Every score is stored in `agent_quality_scores` (with the run/task ids and the
eval's own cost) and rolled up per agent in `agent_quality_summary`, surfaced on
`/admin/agents`. The evaluator is **bounded**: one call with a hard 400-token
cap — it can't loop, and its cost is recorded so it is itself budgeted.
**Fail-safe**: if the judge can't run (no key/error), it returns a *failing*
score so the content is gated to a human, never silently shipped.

## Guardrail policy (AOS-GOV-003)

Each agent is constrained to an explicit **allowlist of action types**
(`_shared/agentPolicy.ts`), enforced centrally in the runtime dispatch before
any action runs — so an agent can never act outside its remit, even if its
prompt is manipulated. The policy is **default-deny**: a tool carrying an
`actionType` runs only if that type is in the agent's `AGENT_POLICY` allowlist
(read-only tools, which carry no `actionType`, always run). A disallowed action
is **refused, audited** (`policy_denied` in `agent_audit_log`), and **escalated
as a tier-2 security anomaly** with an ops alert — never silently dropped.

**Financial/destructive** action types (`process_refund`, `issue_credit`,
`modify_pricing`, `delete_records`, `destructive_fix`, `unpublish_content`,
`send_bulk_email`, `external_post`) are **approval-required by policy**
regardless of the allowlist — they queue a human approval (AOS-CORE-007) instead
of running. The policy logic has unit-style tests in
`_shared/agentPolicy.test.ts` (`deno test`).

## Immutable audit trail (AOS-GOV-002)

`agent_audit_log` is the append-only record of every state-changing action an
agent takes — task/approval creation, approved-action execution, and each
executed tool call — with a `before`/`after` diff, `agent_key`, `run_id`, and
`target_ref`. It is written via `writeAgentAudit` (`_shared/auditLog.ts`) by the
runtime, `createAgentTask`, and the approval helpers. **Immutability** is
enforced two ways: insert-only RLS (no non-service update/delete policies) and a
trigger that blocks `UPDATE` for every role — so not even a buggy agent can
rewrite history (DELETE stays available to the service role for retention). The
admin viewer at `/admin/agent-audit` filters by agent, action, and date and
shows each entry's before/after and its run/target references.

(`agent_action_log` from AOS-CORE-003 is the lower-level tool-call *trace*;
`agent_audit_log` is the governance-grade immutable *audit*.)

## Human-in-the-loop approvals (AOS-CORE-007)

Some actions must never run unattended (publishing, outreach, refunds,
destructive fixes). A tool is marked with an `actionType` from
`agentApprovals.GUARDED_ACTIONS`; when the runtime dispatches it, instead of
executing it **creates a pending `agent_action_approvals` row and stops**,
telling the model the action is queued. A human works the queue at
`/admin/approvals`: reviewing the proposed payload and either **approving**
(which runs the registered executor for that `action_type` server-side via the
`agent-approvals` edge function) or **rejecting** with a reason. Every decision
is audited, and decisions are idempotent (a non-pending approval is a no-op).

Guarded actions register their executor with
`registerApprovalExecutor(actionType, fn)`; an unregistered type is surfaced,
never silently run. The `approval-sweeper` cron (every 15 min) expires stale
pending approvals and re-escalates them as human tasks so nothing is dropped.

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
