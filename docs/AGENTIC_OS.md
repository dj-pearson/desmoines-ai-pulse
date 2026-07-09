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

## CRM pipeline data model (AOS-PROSPECT-002)

Three additive tables give leads a pipeline: **`crm_accounts`** (a business we
might sell to), **`crm_leads`** (a discovered prospect entering the funnel, linked
back to its `prospect_leads` origin), and **`crm_opportunities`** (a deal moving
through a `crm_opp_stage` enum: new → qualified → contacted → proposal → won /
lost, with value, owner, next_action). A **won** opportunity links to a **real
campaign** via `campaign_id` — an additive FK, so a closed deal ties to an actual
advertiser record **without touching the campaigns/advertisements schema**.

RLS is **admin-or-sales** (`is_admin_or_sales()` — `user_roles` in
admin/root_admin/sales) for read+write; agents write via the service role. The
`crm-console` edge function is the audited write path: `promote_prospect`
(prospect_lead → account + lead), `create_opportunity`, `advance_stage`,
`upsert_lead` — every write goes to the audit trail. The **/admin/crm** view
(`CrmBoard`) shows open leads (promote → new opportunity) and a **stage board**
where an opportunity advances inline.

## Local-business discovery / lead sourcing (AOS-PROSPECT-001)

`agent-lead-sourcing` (cron, weekly) keeps a steady flow of advertiser leads.
**Data sources are documented and safe: existing platform content only** —
restaurants and attractions that are **not sponsored** (⇒ not already
advertising) and **event venues** of upcoming events. It performs **no external
fetch**, so there is no SSRF or cost-abuse surface; any future external
enrichment must go through `_shared/fetchGuard` (WEB-SEC-001 allowlist + byte
caps) and is intentionally off here. No gated/PII sources.

Each candidate becomes a `prospect_leads` row capturing **source**
(`existing_content:<table>`), **category** (restaurant / attraction /
event_organizer), city, website, a **fit_reason** (why it's a fit — popularity,
rating, has-website, hosts-events) and a **fit_score**. Leads are **deduped** by
a stable `dedupe_key` (normalized name + city) against existing leads, so weekly
runs don't pile up duplicates. The run is budgeted via `runAgent` and lead
discovery is audited. The digest reports 7-day new leads + open leads.

## Subscription lifecycle nurture (AOS-NURTURE-007)

`agent-subscription-nurture` (cron, daily) works the highest-leverage revenue
touchpoints:

- **Trial ending** — `trialing` subscriptions within 3 days of `current_period_end`
  get a keep-your-perks reminder.
- **Dunning** — `past_due` subscriptions get a payment-update reminder on a
  ~3-day cadence **aligned to Stripe smart retries** (Stripe drives the actual
  charge; the agent nudges). Any courtesy credit would be **approval-gated**
  (AOS-CORE-007), never auto-applied.
- **Upgrade prompts** — engaged free users (active lifecycle, no active/trialing
  paid sub) get a contextual upgrade nudge aligned to the paywall model, on a
  30-day cadence.

It reads only subscription **status + tier** — no schema tightening, so shipped
iOS/Android clients keep the entitlement shapes they read. Every send is
consent-checked, frequency-capped, and quality-gated (AOS-GOV-004).
**Conversion is measured**: a trial/upgrade send whose user later has an active
paid subscription is stamped `activated_at` (converted); a dunning send whose
subscription recovers counts as recovered. The digest reports 7-day
sent + converted/recovered. The agent is allow-listed for `issue_credit` /
`send_outreach` in `agentPolicy.ts`.

## Loyalty / milestone recognition (AOS-NURTURE-006)

`agent-milestones` (cron, daily) recognizes engagement to build habit. For
engaged users it detects the **highest newly-crossed** milestone across **saves**
(5/10/25/50/100), **reviews** (1/5/10/25), **weekly activity streaks**
(4/8/12/26/52 — consecutive ISO weeks with a save/review), and **account
anniversaries** (within ±2 days). Signals are pulled in **bulk** (favorites +
reviews for the batch, aggregated in memory).

Each new milestone is recorded in `user_milestones` — which is **user-readable**
(RLS), so that row *is* the in-app surface a frontend badge/toast can render, and
the user can acknowledge it. Recognition **email is optional** and gated: consent
(`messagingAllowed`), at most one milestone email per week, no overlap with other
nurture (`recentlyMessaged`, 3-day), and the AOS-GOV-004 quality gate. Milestones
are deduped by `(user, type, value)` so nobody is congratulated twice. The digest
reports 7-day milestones recognized + emailed.

## Dormant-user re-engagement (AOS-NURTURE-005)

`agent-reengagement` (cron, conservative weekly cadence) nudges **dormant** users
back with what they've missed + upcoming highlights, behind stacked guardrails
applied in order:

1. **Consent** (`messagingAllowed`) and **not already suppressed** (aged out).
2. **Age-out** — `shouldAgeOut` suppresses a user who ignored their last
   `MAX_ATTEMPTS` (3) re-engagement sends (no open/click/reactivation),
   stamping `reengage_suppressed_at` so we stop spamming the unresponsive.
3. **Cross-agent coordination** — `recentlyMessaged` checks the shared
   `nurture_sends` ledger and **skips if *any* nurture agent** (onboarding,
   win-back, digest, …) messaged this user within `COORD_WINDOW_DAYS` (7). This
   is the coordination point: because every nurture agent writes to one ledger,
   no user gets overlapping nurture + re-engagement in the same window.
4. **Cadence cap** — ≥ 21 days between re-engagement sends.
5. **Quality gate** (AOS-GOV-004) before send.

Reactivations are measured (a prior send whose user is now active/reactivated is
stamped `activated_at`); the digest reports 7-day sent + reactivated.
`_shared/nurtureCoordination.ts` (`recentlyMessaged`, `shouldAgeOut`) is reusable
by future nurture agents.

## Personalized weekly digest (AOS-NURTURE-004)

`agent-weekly-digest` (cron, weekly) sends each user a digest of what's relevant
to *them*, not a generic blast. Shared content — upcoming events, new
restaurants/attractions — is fetched **once** and filtered **per user in memory**
(interest-matched events, falling back to soonest), so a large audience is a few
queries, not N×. Per user it adds **saved-search matches** (upcoming events
matching a saved search's category) and gates **premium picks** by tier (free
users get non-sponsored picks; insider/vip see sponsored ones too).

Guardrails: a **7-day frequency cap**, the classifier's `messagingAllowed`
consent flag, the **AOS-GOV-004** quality gate before send, and — critically — a
user with **no relevant content is skipped**, never sent filler. Sends go through
`sendNurtureEmail` (one-click unsubscribe) and land in `nurture_sends`;
deliverability/opens/clicks flow back via `resend-webhook`. The digest reports
7-day weekly-digest sent/opened/clicked.

## Churn-risk + win-back agent (AOS-NURTURE-003)

`agent-churn-winback` (cron, daily) catches users before they leave. Three passes:

1. **Score** churn risk (0–1) from the lifecycle classifier's stored signals
   (days since active, subscription status — reusing `lifecycle_signals`, so no
   re-querying), stamp `profiles.churn_risk_score`, and move clearly high-risk
   `active` users to `at_risk` (recording the transition).
2. **Win-back play** for high-risk, **consented**, not-recently-contacted users
   (30-day frequency cap): a **value reminder**, or — above a higher risk bar —
   a **discount offer**. Offers within policy (≤ `WINBACK_AUTO_MAX_PCT` = 20%)
   send after the **AOS-GOV-004** quality gate; an offer **above** the threshold
   is **approval-gated** (`createApproval("issue_credit")`, AOS-CORE-007) —
   queued as `approval_pending`, **not sent** until a human approves. Every
   reminder/offer/approval is audited.
3. **Effectiveness** — interventions ≥ 14 days old are marked `retained` or
   `churned` from the user's current lifecycle stage.

`winback_interventions` records each play + outcome; the digest reports 60-day
intervention volume, pending approvals, and the **retained-share**. The
`churn-winback` agent is allow-listed for `issue_credit`/`send_outreach` in
`agentPolicy.ts`.

## Onboarding drip agent (AOS-NURTURE-002)

`agent-onboarding-drip` (cron, every 6h) runs a staged welcome sequence for users
in lifecycle stage `new`/`onboarding`: **welcome → key features → personalization
→ first-value**. It sends the **next appropriate step**, gated on:

- **Consent** — the classifier's `messagingAllowed` flag (unsubscribe + comm
  prefs); disallowed users are skipped.
- **Behavior** — steps already completed are skipped: personalization skips if
  the user set interests; first-value skips if they already have a favorite.
- **Frequency cap** — ≥ 24h between onboarding emails.
- **Quality** — the step passes the **AOS-GOV-004** quality gate
  (`scoreOutput`, `nurture`) before send; a failing draft is held, not sent.

Sends go through the shared `sendNurtureEmail` helper (existing Resend plumbing +
`emailLayout` CAN-SPAM footer with one-click unsubscribe) and are recorded in the
`nurture_sends` ledger. **Outcomes** — delivered/opened/clicked flow back via an
extended `resend-webhook` (which now also matches `nurture_sends` by message id);
**activation** is stamped when a user takes the first-value action (a favorite)
after the send. The ops digest reports 7-day onboarding sent/opened/clicked/
activated counts. `nurture_sends` is shared infrastructure for the rest of the
NURTURE epic.

## User lifecycle-stage model (AOS-NURTURE-001)

`agent-lifecycle` (cron, daily) classifies each user into a lifecycle stage —
`new → onboarding → active → at_risk → dormant → churned`, plus `reactivated` —
from activity signals, and stores it on `profiles.lifecycle_stage`. It processes
the **stalest profiles first** and pulls signals in **bulk** (a handful of
aggregate queries, joined in memory — not N+1):

- **Signup age** (`profiles.created_at`), **last activity** (max across
  favorites, reviews, and successful logins), **recent saves** (30-day favorites),
  and **subscription state** (`user_subscriptions.status`).
- Deterministic rules: active > 90d → churned, > 30d → dormant,
  `past_due`/lapsing → at_risk, brand-new/low-activity → new/onboarding, and a
  previously-lapsed user active in the last 7d → **reactivated**.

Every **stage transition** is recorded in `user_lifecycle_history` so downstream
nurture agents can react to changes; the current stage on `profiles` is their
**segmentation input**. The `/admin/lifecycle` view (`LifecyclePanel`) shows the
stage distribution + recent transitions.

**PII-safe:** the stored `lifecycle_signals` are only day-offsets, counts,
subscription status, and a `messagingAllowed` flag (derived from
`newsletter_subscribers` unsubscribe + `communication_preferences`) — never
names, emails, or content. Downstream messaging agents must honor
`messagingAllowed`.

## Human ticket console (AOS-CS-008)

`/admin/support` (`SupportConsole`) is the tier-2/3 human workspace, backed by the
`support-console` edge function. A two-pane layout (list ↔ thread, collapsing to
one pane on mobile) provides:

- **List + filter** by status/priority; **full thread** with internal notes
  visually distinct from user-visible messages.
- **User context** — subscription tier/status plus light activity (favorites,
  reviews) pulled for the ticket's user.
- **AI-suggested replies** — `suggest_reply` drafts a KB-grounded reply the human
  **edits before sending**; **canned responses** insert from a library; sending
  posts an `admin` message, updates status, and **audits** the action
  (`console_reply_sent`). "Send & resolve" closes it out.
- **Assignment** (assign to me), **internal notes** (system message flagged
  `internal`, never shown to users), and **merge-duplicate** (moves the
  duplicate's messages to the canonical ticket, marks it `merged_into` + closed).

Every state has an empty/loading/error branch, 44px touch targets, labelled
controls, and a responsive grid — WCAG 2.1 AA. Console actions are audited under
the `support-console` actor.

## Post-resolution CSAT loop (AOS-CS-007)

"A resolved ticket the user hated is not resolved." When a ticket becomes
`resolved` (a trigger stamps `resolved_at`), `agent-csat` (cron, hourly) posts a
**lightweight CSAT prompt** to the thread — one-click 1–5 rating links
(`/csat?ticket=…&score=N`) that work equally in-app and in email — and stamps
`csat_prompt_sent_at` plus whether resolution was **auto** (agent, never touched
by a human) or **human**.

`support-csat-submit` (public, rate-limited, one-click) records the score in
`support_csat` (with channel + resolved_by) and on the ticket. A **low score
(≤ 2) auto-re-escalates**: the ticket reopens (`status = escalated`,
`resolved_at` cleared) and a tier-2 task is created carrying the **original
context** (subject/body) so a human can make it right. The `/csat` page submits
immediately on a one-click link, or shows a star picker + optional comment.

The ops digest reports the **30-day CSAT trend by channel and by
auto-vs-human resolution** — the signal for whether auto-resolutions are
actually satisfying users. Every record + re-escalation is audited.

## In-app support chat (AOS-CS-006)

The `/support` route hosts an in-app chat (`SupportChat`) wired to the CS
first-responder. `support-chat` **reuses the discover-chat edge pattern** —
CORS, persistent per-IP rate limit, optional bearer auth — and is **available to
all tiers** (auth is optional; an authenticated user is attached when present,
no PremiumGate on core support). It grounds replies in the KB (`retrieveKb`,
AOS-CS-003) and returns the answer with cited sources.

When it **can't resolve** the question, or the user hits **"Talk to a human"**
(a first-class button, plus phrasing detection), it opens a `support_tickets`
row (`channel = in_app`), **attaches the full transcript** as `support_messages`,
escalates to a tier-2 task, and tells the user a ticket was created. The widget
is mobile-first and accessible: an `aria-live` conversation log, 44px touch
targets, labelled input, and starter suggestions. Cost is attributed to the
`support-chat` agent budget ($40/mo).

## Ticket sentiment + priority classifier with SLA (AOS-CS-005)

`agent-ticket-classifier` (cron every 10 min) makes angry/urgent users jump the
queue. Two passes:

1. **Classify** — each unclassified ticket is scored by the LLM for
   `sentiment` (positive/neutral/negative), `urgency`
   (low/medium/high/critical), and `category`. Priority is derived from urgency,
   then **bumped one level for negative sentiment**, and `sla_due_at` is set from
   priority (urgent 2h → high 8h → normal 24h → low 72h). The classification is
   stored on the ticket with `classification_source = 'agent'` and a confidence.
2. **SLA-breach guard** — any fast-track ticket approaching its `sla_due_at`
   (within a 30-min buffer) while still unhandled is **pre-escalated to a tier-2
   task before the breach** (tier-3 for urgent/negative), and `sla_escalated_at`
   is stamped so it isn't re-escalated.

Classification is visible in the **/admin/support-tickets** console
(`SupportTicketsConsole`) with priority/sentiment/urgency badges and a live SLA
countdown. An admin can **correct** any misclassification inline; the correction
(`support-ticket-reclassify`) recomputes the SLA, sets
`classification_source = 'human'`, and records the agent's prior values in
`support_ticket_feedback` for model improvement.

## Billing self-service automation (AOS-CS-004)

`agent-billing-selfservice` handles routine billing actions instantly, within
**explicit policy**:

- **plan_info / resend_receipt** — read-only, tier-1, audited.
- **cancel_subscription** — cancels at **period end** via Stripe (reversible;
  entitlement lasts the paid period). No schema change, so shipped iOS/Android
  clients keep reading the `subscription_tier` shape they expect. Audited with
  before/after.
- **refund** — `evaluateRefund` (AOS-GOV-003) defines a narrow **auto-approve
  window**: allowed reason (duplicate/accidental/service-unavailable),
  ≤ `$30`, charge ≤ `7d` old. In-policy refunds run immediately via Stripe and
  are audited as auto-approved. Anything outside the window creates a **tier-2
  approval** (AOS-CORE-007) and does **not** execute — a human approves it in the
  console, at which point the registered `process_refund` executor
  (`_shared/billingExecutors.ts`, imported by `agent-approvals`) runs the refund
  and audits it.

Every financial action is audited. The refund side-effect uses the same Stripe
integration (`STRIPE_SECRET_KEY`) as the app's Stripe functions; cancellation
never tightens any schema. The `billing-selfservice` agent is allow-listed for
`process_refund`, `cancel_subscription`, and `resend_receipt` in the policy
allowlist (`agentPolicy.ts`).

## AI first-responder (AOS-CS-002)

`agent-support-responder` (cron every 10 min + on-demand per ticket) answers
common support tickets and knows when to hand off. Per ticket whose latest
message is from the **user**:

1. **Anti-ping-pong** — it only engages when the user spoke last; if the agent
   already replied and is waiting, it skips. After `MAX_AGENT_REPLIES` (2)
   rounds without resolution it hands the ticket to a human rather than loop.
2. **Forced escalation** — a **human request** (regex on "talk to a person",
   etc.) or a **sensitive topic** (billing / account / legal, by keyword or
   category) always escalates and never auto-sends.
3. **Grounded draft** — retrieves KB passages (`retrieveKb`, AOS-CS-003) and
   drafts an answer **using only those passages**, citing sources. If the model
   reports it can't answer from the KB, or top similarity is low, that's low
   confidence → escalate.
4. **Quality gate** — before any auto-send, the draft passes the **AOS-GOV-004**
   quality/safety judge (`scoreOutput`, `support` category). A failing score
   escalates with the draft attached.
5. **Send vs escalate** — high confidence (top similarity ≥ 0.75 + model can
   answer) **and** gate pass → **auto-send** (tier-1): the reply (with sources)
   is posted to the thread and the ticket moves to `awaiting_user`. Otherwise →
   **tier-2 escalation** with the suggested draft stored as an *internal*
   (unsent) agent message and a routing task carrying the reason + sources.

Every auto-reply and escalation is written to the audit trail. Cost is
attributed to the `support-responder` agent budget ($30/mo).

## Support knowledge base + retrieval (AOS-CS-003)

Grounded answers need grounded sources. `support_kb` stores docs/FAQ/policy
passages with **pgvector embeddings** (OpenAI `text-embedding-3-small`, 1536
dims); `match_support_kb(query_embedding, count, threshold)` is an admin/service-
role RPC that returns the top passages by cosine similarity **with their
sources**, so the first-responder (AOS-CS-002) can cite them and humans can
verify. The shared `retrieveKb(supabase, query)` helper (`_shared/kbRetrieve.ts`)
embeds a query and calls the RPC in one step.

- **Embedding** — `support-kb-embed` (cron every 30 min + on-demand) embeds any
  article with `needs_embedding = true`, cost attributed to the `support-kb`
  agent budget ($10/mo). A DB trigger flips `needs_embedding` back on whenever an
  article's title/content changes, so **edits re-embed automatically**.
- **Admin UI** — `/admin/support-kb` (`SupportKbManager`) lists, adds, edits, and
  deletes articles through the service-role `support-kb-admin` function (the
  table has no client write policy); a save re-embeds inline so the article is
  immediately retrievable. The page also has a **retrieval tester** that shows
  the top passages + similarity for a sample query.
- **Seed** — the migration seeds a starter KB from existing docs/FAQ/policies
  (tiers, cancellation, refunds, password reset, reporting content, contact).

## Unified support intake (AOS-CS-001)

Every support request lands in one place — `support_tickets` (+ a
`support_messages` thread) — regardless of channel (`web_form` | `email` |
`in_app`). Ticket status is a real lifecycle enum
(`new → ai_handling → awaiting_user → escalated → resolved → closed`), with
nullable `sentiment`, `priority`, `sla_due_at`, and `assigned_to` that later CS
agents fill in.

**The public contact endpoint is unchanged.** Rather than rewrite the contact
form (which would touch the public shape and its anti-abuse path), a
`SECURITY DEFINER` trigger — `mirror_contact_to_support` — fires
`AFTER INSERT ON contact_submissions` and creates the ticket + first message.
So the form still inserts into `contact_submissions` exactly as before (its
"anyone can insert" RLS + rate limiting intact), and the ticket is created
server-side without needing a public INSERT policy on `support_tickets`.
Mirroring is idempotent via a unique `source_ref` (the originating
`contact_submissions.id`).

**RLS:** users see their own tickets/messages (`user_id = auth.uid()`), admins
see all (`is_admin()`), and agents write via the service role (RLS-bypassing).
Authenticated users may open their own `in_app` ticket directly.

**Import / backfill path:** the migration backfills all existing
`contact_submissions` into tickets (idempotent). A future support-email ingest
just inserts into `support_tickets` with `channel = 'email'` under the service
role (same shape the trigger uses) — no schema change needed.

## Edge-function error-rate & cold-start monitor (AOS-MAINT-007)

73 edge functions are otherwise unobservable. `_shared/instrument.ts` provides
a wrapper — `serve(instrument("fn-name", handler))` — that times each
invocation, derives the HTTP status class (2xx/3xx/**4xx**/**5xx**), and records
a sampled row to `edge_function_metrics` (fire-and-forget, never alters the
response, never throws; OPTIONS preflights skipped; `EDGE_METRICS_SAMPLE_RATE`
caps hot functions). `geocode-location` adopts it as the reference; new/hot
functions opt in the same way.

`agent-edge-metrics` (cron, every 6h) aggregates two 24h windows (current vs the
prior-24h baseline) from **both** sources:

- **`edge_function_metrics`** — instrumented HTTP functions: 5xx (server) vs 4xx
  (user) rate, p95 latency, and max latency (a cold-start proxy).
- **`automation_job_runs`** (the ledger) — internal agent/cron functions:
  failure rate and run-duration p95.

It opens a deduped **tier-2 task** per function that regresses on a **server**
signal — 5xx/failure rate ≥ 10% (with ≥ 20 samples, and not below baseline) or
p95 latency ≥ 2s and ≥ 1.5× baseline. **4xx is recorded as context but never
alerts** — user-caused errors aren't a server bug, so keeping them out of the
alert path keeps alerts actionable. The noisiest functions (by 5xx count) are
surfaced in the ops digest.

## External-API cost & quota watchdog (AOS-MAINT-006)

`agent-api-watchdog` (cron, hourly) keeps external-API spend under control per
provider. Each agent's ledger cost is attributed to a provider
(`agent_registry.provider` — anthropic/openai/google/stripe/resend); the
`provider_spend_mtd` view sums that plus optional `provider_usage` reports
(for providers with no ledger signal) month-to-date and compares to
`provider_budgets`:

- **Soft breach** (spend ≥ `soft_pct`, default 80%) → the provider is marked
  **throttled** and ops is alerted. This is graceful: the per-agent budget
  hard-stop in `runAgent` already slows spend as budgets fill; the watchdog
  flags it and warns *before* the hard line.
- **Hard breach** (≥ `hard_pct`, default 100%) → the affected agents are
  **paused** by setting `agent_registry.enabled = false` — the same mechanism
  the kill switch uses, so `runAgent` records their runs as *skipped*. The
  watchdog itself and the rest of the product are untouched — only that
  provider's agents stop.
- **Recovery** — when spend drops back under the hard line (e.g. month
  rollover), the exact agents this watchdog paused (tracked in
  `auto_paused_agents`) are **re-enabled** automatically; below soft, the
  throttle clears. Every pause/resume is audited with before/after and is
  reversible.

A **cost tile on /admin/agents** (`ProviderCostTile` + `useProviderCosts`) shows
per-provider spend vs budget MTD with a progress bar and throttled/paused badges.

## Broken-link & dead-content monitor (AOS-MAINT-005)

`agent-link-monitor` (cron, daily 09:00 UTC) keeps content trustworthy,
extending WEB-AUTO. Two passes, **audited and reversible** throughout:

- **Expired events** — events past their `date` with `archived_at IS NULL` are
  unpublished **tier-1** by setting `archived_at` (reversible: null it to
  restore; the content row is never deleted). A past event whose title reads
  *recurring* (`weekly`, `annual`, `every Monday`, …) is **ambiguous** and
  **escalates to tier-2** instead of being auto-archived. Up to `ARCHIVE_LIMIT`
  (100) per run.
- **Outbound links** — a bounded batch (`LINK_BUDGET` 50: currently-failing
  links first, then a rotating sample of `events.source_url`,
  `restaurants.website/source_url`, `attractions.website`) is probed with HEAD
  (GET fallback). State is upserted per link in `content_link_checks`. A
  **hard-dead** link (404/410) for `FAIL_THRESHOLD` (3) consecutive checks is
  **marked dead tier-1**; a 200 that **redirects to a different host** is
  ambiguous → **tier-2**. Transient 5xx/timeouts accumulate but never mark. A
  dead link that later responds is **un-marked** (recovery).

Marks live in the separate `content_link_checks` tracker — the content row is
never mutated for links, so every action is trivially reversible. Every
auto-action (archive, mark-dead, un-mark) is written to the `agent_audit_log`
with before/after. Link health (dead-link count) and stale-content are surfaced
in the ops digest.

## Data-quality sweeper (AOS-MAINT-004)

`agent-data-quality` (cron, daily 08:00 UTC) keeps content rows complete,
extending the WEB-AUTO backfills. Per table (`events`, `restaurants`,
`attractions`), it runs **detect → reconcile → fill → snapshot**:

1. **Detect** rows missing `image_url`, coordinates, `seo_title`, or
   `geo_summary` (bounded to `DETECT_LIMIT` per run).
2. **Reconcile** the per-row `data_quality_issues` tracker (idempotent by row):
   rows no longer gapped **resolve**; still-gapped rows advance their attempt
   count; a row still broken after `MAX_ATTEMPTS` (3) **escalates** to a tier-2
   data task carrying the reason (which fields, how many attempts).
3. **Auto-fill (tier-1)** by invoking the existing enrichment functions in
   **bounded batches** — `backfill-images` (`limit 5`), `generate-seo-content`
   (`batchSize 8`), and one `backfill-all-coordinates` pass — so external APIs
   (Google/Nominatim, image, LLM) stay rate-limited and within the agent's cost
   budget ($20/mo).
4. **Snapshot** fill-rate to `data_quality_snapshots`; the ops digest shows the
   current fill-rate per table as a trend.

Detect-**then**-fill ordering means each daily run measures the *previous* run's
fills, so attempt counts are honest (a row isn't re-counted as failed before the
fix has had a chance to land). Idempotent throughout; budgeted/audited via
`runAgent`.

## Backup verification agent (AOS-MAINT-003)

`agent-backup-verify` (cron, daily 06:30 UTC) answers "are backups real and
restorable?" with two read-only checks recorded to `backup_checks` and the
ledger:

1. **Recency** — when a Supabase Management API token is configured
   (`SUPABASE_ACCESS_TOKEN` + project ref, derived from `SUPABASE_URL`), it
   fetches the physical backup list and computes the age of the most recent
   backup. A backup older than `STALE_HOURS` (26h — daily cadence + slack) or a
   missing backup is a failure. Without a token, recency is *unverifiable* and
   recorded as such — it does **not** page (the spot check still runs).
2. **Restore-sanity spot check** — row counts of core content tables
   (`events`, `restaurants`, `attractions`, `profiles`). A core table returning
   0 rows is a restore-sanity failure (an unexpectedly empty table is exactly the
   signal a bad restore/backup would give).

A stale/missing backup or a failed spot check opens a **tier-3 incident**
(idempotent) and notifies ops immediately; a subsequent passing check
**auto-resolves** it. Backup status (last check OK/FAILED, method, age) is
surfaced in the ops digest.

## Database health agent (AOS-MAINT-002)

`agent-db-health` (cron, daily 07:00 UTC) calls the **admin-only, read-only**
`db_health_report` RPC (SECURITY DEFINER, gated to `service_role` / admin) and
turns its findings into tier-2 suggestion tasks. It **inspects and proposes —
never applies**:

- **Missing-index candidates** — tables with heavy sequential scanning
  (`pg_stat_user_tables.seq_scan` over sizable tables) get a task carrying an
  **additive `CREATE INDEX CONCURRENTLY` draft** (columns left for a human to
  fill). Concurrently = safe online; additive = compat-safe. Never auto-run.
- **Unused indexes** — `idx_scan = 0` (excluding PK/unique) surfaced for review.
  The task explicitly notes `DROP INDEX` is **destructive** per CLAUDE.md and
  must follow the multi-release deprecation flow — so no DROP is drafted.
- **Table bloat** — high dead-tuple ratio → a `VACUUM (ANALYZE)` / autovacuum
  suggestion.
- **Slow queries** — top patterns from `pg_stat_statements` (when installed;
  degrades gracefully when not) collected into one task.
- **Connections** — when in-use ≥ 80% of `max_connections`, an immediate ops
  alert fires (not just a task).

Connection/health metrics and open-suggestion counts are surfaced in the daily
ops digest. Every run is budgeted/audited through `runAgent`.

## Uptime / synthetic-monitoring agent (AOS-MAINT-001)

`agent-uptime-monitor` (cron, every 5 min) probes critical surfaces and records
latency/status to `uptime_probes`:

- **Public routes** — `GET` on the site URL (`/`, `/events`, `/restaurants`,
  `/attractions` by default; override with `UPTIME_ROUTES`). Up = any non-5xx
  (the server responded).
- **Edge-function health** — `OPTIONS` CORS preflight (override with
  `UPTIME_FUNCTIONS`). Preflight returns from `handleCors` **before any auth or
  logic**, so it's a genuine liveness check that mutates nothing and needs no
  credentials.

**Alerting threshold (documented, so blips don't page):** a single failed probe
is a *blip* — recorded, never alerted. **3 consecutive** failed probes for one
target is a *sustained* outage — it opens a **tier-2 incident** (idempotent per
target via a `uptime-down:<target>` dedupe key) and notifies ops immediately.
When a downed target probes healthy again, its incident is **auto-resolved** and
a recovery notice is sent. Every probe is budgeted/audited through `runAgent`.

The **/admin/agents status tile** (`UptimeStatusTile` + `useUptimeStatus`) reads
`uptime_probes` for the last hour and shows, per target, current up/down, p95
latency, and uptime %, with a headline of how many targets are down and the worst
p95.

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
