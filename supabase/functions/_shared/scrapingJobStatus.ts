/**
 * scraping_jobs.status contract between the pg_cron dispatcher and
 * scrape-events (WEB-BE-035).
 *
 * The dispatcher (run_scraping_jobs, migration 20260902000005) never writes
 * status: pg_net's http_post is fire-and-forget, so a 'running' flag set before
 * the POST protects nothing and, when nothing resets it, excludes the job from
 * every later dispatch. The only writer of status is scrape-events itself,
 * which sets 'idle' when it finishes a job.
 *
 * Rows can still carry 'running' from the years the old dispatcher wrote it,
 * from an admin console, or from a run that died before its completion write.
 * When a caller names a job by id it has decided that job should run, so both
 * labels are accepted; the unnamed path (process whatever is due) keeps the
 * conservative 'idle' filter.
 */

export const JOB_STATUS_IDLE = 'idle';
export const JOB_STATUS_RUNNING = 'running';

/** Statuses scrape-events will pick a job up in, given how it was asked. */
export function acceptedJobStatuses(jobId: string | null | undefined): string[] {
  return jobId ? [JOB_STATUS_IDLE, JOB_STATUS_RUNNING] : [JOB_STATUS_IDLE];
}
