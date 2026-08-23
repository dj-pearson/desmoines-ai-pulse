/**
 * jobRunner — observability wrapper for scheduled edge-function jobs
 * (WEB-AUTO-001). Records each run in automation_job_runs, retries transient
 * failures with backoff, and alerts the admin on terminal failure.
 *
 *   const result = await runJob('cleanup-old-events', async (ctx) => {
 *     // ... do work ...
 *     ctx.processed(deleted);          // count items processed
 *     ctx.failed(skipped);             // count items that failed
 *     return { deleted, skipped };     // stored in metadata
 *   });
 *
 * The wrapper never throws — a job-infra failure must not crash the function.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithTimeout } from './fetchWithTimeout.ts';
import { agentPaused } from './agentGuards.ts';

export interface JobContext {
  /** Add to the items-processed counter. */
  processed: (n: number) => void;
  /** Add to the items-failed counter. */
  failed: (n: number) => void;
  /** Merge keys into the run's metadata jsonb. */
  meta: (m: Record<string, unknown>) => void;
}

export interface RunJobOptions {
  /** Max attempts on transient failure (default 3 = 1 try + 2 retries). */
  maxAttempts?: number;
  /** Base backoff in ms (default 1000; doubles each retry). */
  backoffMs?: number;
  /**
   * Opt IN to whole-body retry (WEB-BE-008). On a transient failure runJob
   * re-invokes the ENTIRE `fn` body, so a non-idempotent, insert-heavy job would
   * double-write on retry. Retry is therefore OPT-IN and defaults to OFF:
   * without this flag (or an `isTransient` predicate) a job fails fast after one
   * attempt and alerts once. Only set `retriable: true` for jobs whose body is
   * idempotent (safe to run twice). For finer control, pass `isTransient`.
   */
  retriable?: boolean;
  /**
   * Classify an error as transient (retryable). Takes precedence over
   * `retriable`. Default (no predicate, `retriable` unset): NEVER retry — see
   * the idempotency note on `retriable`.
   */
  isTransient?: (err: unknown) => boolean;
  /** Admin alert email override (else ADMIN_ALERT_EMAIL / ALERT_EMAIL secret). */
  alertEmail?: string;
  /** Agent key for the pause gate (AOS-CORE-009); defaults to jobName. */
  agentKey?: string;
  /** Skip the global/per-agent pause gate — for infra jobs (e.g. the health
   *  watchdog) that must keep running during an incident pause. */
  exemptFromPause?: boolean;
}

export interface JobResult<T> {
  ok: boolean;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  runId: string | null;
  result?: T;
  error?: string;
  itemsProcessed: number;
  itemsFailed: number;
  attempts: number;
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runJob<T>(
  jobName: string,
  fn: (ctx: JobContext) => Promise<T>,
  options: RunJobOptions = {},
): Promise<JobResult<T>> {
  const { maxAttempts = 3, backoffMs = 1000 } = options;
  // Retry is opt-in (WEB-BE-008): an explicit isTransient predicate wins, else
  // `retriable: true` retries on any error, else the job never retries so
  // non-idempotent bodies can't double-write.
  const isTransient = options.isTransient ?? (options.retriable ? () => true : () => false);
  const supabase = serviceClient();

  // Global/per-agent pause gate (AOS-CORE-009). Record a skipped run and exit
  // without doing work when paused, so the gap is visible in the ledger. Infra
  // jobs can opt out via exemptFromPause.
  if (supabase && !options.exemptFromPause) {
    const pause = await agentPaused(supabase, options.agentKey ?? jobName);
    if (pause.paused) {
      let skipId: string | null = null;
      try {
        const nowIso = new Date().toISOString();
        // Best-effort, but the error is read: postgrest-js resolves with
        // { data: null, error } on a query failure and throws only on a
        // transport error, so the catch below never saw the common case
        // (WEB-BE-032 AC3).
        const { data, error } = await supabase
          .from('automation_job_runs')
          .insert({ job_name: jobName, status: 'skipped', finished_at: nowIso, metadata: { pausedReason: pause.reason } })
          .select('id')
          .single();
        if (error) throw error;
        skipId = data?.id ?? null;
      } catch (err) {
        console.warn(`[jobRunner:${jobName}] failed to record skipped run:`, err);
      }
      return {
        ok: true,
        status: 'skipped' as JobResult<T>['status'],
        runId: skipId,
        itemsProcessed: 0,
        itemsFailed: 0,
        attempts: 0,
      };
    }
  }

  let itemsProcessed = 0;
  let itemsFailed = 0;
  let metadata: Record<string, unknown> = {};
  const ctx: JobContext = {
    processed: (n) => { itemsProcessed += n; },
    failed: (n) => { itemsFailed += n; },
    meta: (m) => { metadata = { ...metadata, ...m }; },
  };

  // Open the run row (best-effort).
  let runId: string | null = null;
  if (supabase) {
    try {
      // Best-effort; see the skipped-run insert above for why the error is
      // read here rather than left to the catch.
      const { data, error } = await supabase
        .from('automation_job_runs')
        .insert({ job_name: jobName, status: 'running' })
        .select('id')
        .single();
      if (error) throw error;
      runId = data?.id ?? null;
    } catch (err) {
      console.error(`[jobRunner:${jobName}] failed to open run row:`, err);
    }
  }

  let attempt = 0;
  let lastError: unknown;
  let result: T | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      result = await fn(ctx);
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      console.error(`[jobRunner:${jobName}] attempt ${attempt}/${maxAttempts} failed:`, err);
      if (attempt >= maxAttempts || !isTransient(err)) break;
      await sleep(backoffMs * Math.pow(2, attempt - 1));
    }
  }

  const failedTerminally = lastError !== undefined;
  const status: JobResult<T>['status'] = failedTerminally
    ? 'failed'
    : itemsFailed > 0
      ? 'partial'
      : 'success';
  const errorMsg = failedTerminally
    ? (lastError instanceof Error ? lastError.message : String(lastError))
    : null;

  // Close the run row (best-effort).
  if (supabase && runId) {
    try {
      await supabase
        .from('automation_job_runs')
        .update({
          finished_at: new Date().toISOString(),
          status,
          items_processed: itemsProcessed,
          items_failed: itemsFailed,
          attempts: attempt,
          error: errorMsg,
          metadata,
        })
        .eq('id', runId);
    } catch (err) {
      console.error(`[jobRunner:${jobName}] failed to close run row:`, err);
    }
  }

  // Alert on terminal failure (best-effort; never throws).
  if (failedTerminally) {
    await sendJobAlert(jobName, `Job "${jobName}" failed after ${attempt} attempt(s): ${errorMsg}`, options.alertEmail);
  }

  return {
    ok: !failedTerminally,
    status,
    runId,
    result,
    error: errorMsg ?? undefined,
    itemsProcessed,
    itemsFailed,
    attempts: attempt,
  };
}

/**
 * Best-effort admin alert email via Resend. Shared by runJob (terminal failure)
 * and the missed-run watchdog.
 */
export async function sendJobAlert(jobName: string, message: string, alertEmail?: string): Promise<void> {
  try {
    const to =
      alertEmail || Deno.env.get('ADMIN_ALERT_EMAIL') || Deno.env.get('ALERT_EMAIL');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!to || !resendKey) {
      console.warn(`[jobRunner] alert not sent for "${jobName}" (missing ADMIN_ALERT_EMAIL or RESEND_API_KEY): ${message}`);
      return;
    }
    await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Des Moines Insider Automation <automation@desmoinesinsider.com>',
        to: [to],
        subject: `⚠️ Automation alert: ${jobName}`,
        text: `${message}\n\nSee the Admin → Job Health panel for details.`,
      }),
    });
  } catch (err) {
    console.error(`[jobRunner] failed to send alert for "${jobName}":`, err);
  }
}
