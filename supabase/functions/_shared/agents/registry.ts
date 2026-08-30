/**
 * Agent registry for the `agent-runner` dispatcher.
 *
 * Maps each agent_key to its `run(ctx, env)` implementation. The key here is the
 * SAME agent_key used in the `agent_registry` table and the `automation_job_runs`
 * ledger, so per-agent budgets/pause/observability are unchanged. Filenames
 * match the key (`_shared/agents/<agent_key>.ts`).
 *
 * When adding a new agent: create `_shared/agents/<key>.ts` exporting `run`, add
 * the import + map entry below, and register its cron via a migration that POSTs
 * to `/functions/v1/agent-runner/<key>`.
 */
import type { AgentRun } from "./types.ts";

import { run as apiCostWatchdog } from "./api-cost-watchdog.ts";
import { run as backupVerifier } from "./backup-verifier.ts";
import { run as billingSelfservice } from "./billing-selfservice.ts";
import { run as churnWinback } from "./churn-winback.ts";
import { run as ciHealthWatcher } from "./ci-health-watcher.ts";
import { run as complianceMonitor } from "./compliance-monitor.ts";
import { run as configDriftAuditor } from "./config-drift-auditor.ts";
import { run as csatAgent } from "./csat-agent.ts";
import { run as dataQualitySweeper } from "./data-quality-sweeper.ts";
import { run as dbHealth } from "./db-health.ts";
import { run as dependencyCveScanner } from "./dependency-cve-scanner.ts";
import { run as dependencyUpdateAgent } from "./dependency-update-agent.ts";
import { run as devFixAgent } from "./dev-fix-agent.ts";
import { run as edgeMetricsMonitor } from "./edge-metrics-monitor.ts";
import { run as errorTriage } from "./error-triage.ts";
import { run as fraudAbuseDetector } from "./fraud-abuse-detector.ts";
import { run as leadEnrichment } from "./lead-enrichment.ts";
import { run as leadSourcing } from "./lead-sourcing.ts";
import { run as lifecycleClassifier } from "./lifecycle-classifier.ts";
import { run as linkContentMonitor } from "./link-content-monitor.ts";
import { run as milestoneRecognition } from "./milestone-recognition.ts";
import { run as onboardingDrip } from "./onboarding-drip.ts";
import { run as outreachSequencer } from "./outreach-sequencer.ts";
import { run as prReviewAgent } from "./pr-review-agent.ts";
import { run as dormantReengagement } from "./dormant-reengagement.ts";
import { run as releaseNotesAgent } from "./release-notes-agent.ts";
import { run as secretLeakScanner } from "./secret-leak-scanner.ts";
import { run as securityAnomalyDetector } from "./security-anomaly-detector.ts";
import { run as subscriptionNurture } from "./subscription-nurture.ts";
import { run as supportResponder } from "./support-responder.ts";
import { run as testCoverageAgent } from "./test-coverage-agent.ts";
import { run as ticketClassifier } from "./ticket-classifier.ts";
import { run as uptimeMonitor } from "./uptime-monitor.ts";
import { run as weeklyDigestPersonal } from "./weekly-digest-personal.ts";

export const AGENTS: Record<string, AgentRun> = {
  "api-cost-watchdog": apiCostWatchdog,
  "backup-verifier": backupVerifier,
  "billing-selfservice": billingSelfservice,
  "churn-winback": churnWinback,
  "ci-health-watcher": ciHealthWatcher,
  "compliance-monitor": complianceMonitor,
  "config-drift-auditor": configDriftAuditor,
  "csat-agent": csatAgent,
  "data-quality-sweeper": dataQualitySweeper,
  "db-health": dbHealth,
  "dependency-cve-scanner": dependencyCveScanner,
  "dependency-update-agent": dependencyUpdateAgent,
  "dev-fix-agent": devFixAgent,
  "edge-metrics-monitor": edgeMetricsMonitor,
  "error-triage": errorTriage,
  "fraud-abuse-detector": fraudAbuseDetector,
  "lead-enrichment": leadEnrichment,
  "lead-sourcing": leadSourcing,
  "lifecycle-classifier": lifecycleClassifier,
  "link-content-monitor": linkContentMonitor,
  "milestone-recognition": milestoneRecognition,
  "onboarding-drip": onboardingDrip,
  "outreach-sequencer": outreachSequencer,
  "pr-review-agent": prReviewAgent,
  "dormant-reengagement": dormantReengagement,
  "release-notes-agent": releaseNotesAgent,
  "secret-leak-scanner": secretLeakScanner,
  "security-anomaly-detector": securityAnomalyDetector,
  "subscription-nurture": subscriptionNurture,
  "support-responder": supportResponder,
  "test-coverage-agent": testCoverageAgent,
  "ticket-classifier": ticketClassifier,
  "uptime-monitor": uptimeMonitor,
  "weekly-digest-personal": weeklyDigestPersonal,
};
