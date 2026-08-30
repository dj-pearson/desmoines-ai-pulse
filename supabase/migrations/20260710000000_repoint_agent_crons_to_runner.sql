-- Edge-function consolidation: repoint the 34 AOS agent cron jobs from their
-- individual `agent-<name>` functions to the consolidated `agent-runner`
-- dispatcher, addressed by agent_key in the URL sub-path
-- (`/functions/v1/agent-runner/<agent_key>`).
--
-- Rewrites each existing pg_cron job's command URL in place via cron.alter_job,
-- preserving the job's name and schedule. Additive-safe and idempotent: once a
-- job points at agent-runner, its command no longer contains the old
-- `/functions/v1/agent-<name>` substring, so a re-run is a no-op. No agent
-- behavior changes — runAgent still keys the ledger/budgets by agent_key.

DO $$
DECLARE
  r   record;
  jid bigint;
  newcmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('agent-api-watchdog',        'api-cost-watchdog'),
      ('agent-backup-verify',       'backup-verifier'),
      ('agent-billing-selfservice', 'billing-selfservice'),
      ('agent-churn-winback',       'churn-winback'),
      ('agent-ci-health',           'ci-health-watcher'),
      ('agent-compliance-monitor',  'compliance-monitor'),
      ('agent-config-audit',        'config-drift-auditor'),
      ('agent-csat',                'csat-agent'),
      ('agent-data-quality',        'data-quality-sweeper'),
      ('agent-db-health',           'db-health'),
      ('agent-dep-scan',            'dependency-cve-scanner'),
      ('agent-dep-update',          'dependency-update-agent'),
      ('agent-dev-fix',             'dev-fix-agent'),
      ('agent-edge-metrics',        'edge-metrics-monitor'),
      ('agent-error-triage',        'error-triage'),
      ('agent-fraud-monitor',       'fraud-abuse-detector'),
      ('agent-lead-enrichment',     'lead-enrichment'),
      ('agent-lead-sourcing',       'lead-sourcing'),
      ('agent-lifecycle',           'lifecycle-classifier'),
      ('agent-link-monitor',        'link-content-monitor'),
      ('agent-milestones',          'milestone-recognition'),
      ('agent-onboarding-drip',     'onboarding-drip'),
      ('agent-outreach',            'outreach-sequencer'),
      ('agent-pr-review',           'pr-review-agent'),
      ('agent-reengagement',        'dormant-reengagement'),
      ('agent-release-notes',       'release-notes-agent'),
      ('agent-secret-scan',         'secret-leak-scanner'),
      ('agent-security-monitor',    'security-anomaly-detector'),
      ('agent-subscription-nurture','subscription-nurture'),
      ('agent-support-responder',   'support-responder'),
      ('agent-test-gen',            'test-coverage-agent'),
      ('agent-ticket-classifier',   'ticket-classifier'),
      ('agent-uptime-monitor',      'uptime-monitor'),
      ('agent-weekly-digest',       'weekly-digest-personal')
    ) AS t(fn, key)
  LOOP
    FOR jid IN
      SELECT jobid FROM cron.job
      WHERE command LIKE '%/functions/v1/' || r.fn || '%'
    LOOP
      SELECT replace(command,
                     '/functions/v1/' || r.fn,
                     '/functions/v1/agent-runner/' || r.key)
        INTO newcmd
      FROM cron.job WHERE jobid = jid;

      PERFORM cron.alter_job(job_id := jid, command := newcmd);
    END LOOP;
  END LOOP;
END $$;
