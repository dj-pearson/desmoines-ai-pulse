/**
 * Turn per-source outcomes into the HTTP status and body (WEB-BE-041 AC3).
 *
 * WHY THIS IS ITS OWN MODULE. The handler returned `success: true` and HTTP 200
 * unconditionally - the errors array was populated, serialised into the body,
 * and ignored by everything that read the response. So a run in which the model
 * call 404'd on every source, and nothing was written, reported exactly what a
 * clean run reports. pg_cron's job_run_details records the POST as succeeded
 * either way (see WEB-OPS-007), so there was no surface anywhere that could
 * tell the two apart.
 *
 * The decision is pure and lives here so a test can assert it without a
 * network, a database, or Deno.serve.
 */

export interface SourceOutcome {
  name: string;
  url: string;
  /** True when the source was scraped AND the model returned parseable JSON. */
  ok: boolean;
  /** Rows the model extracted from this source. Zero is a legitimate answer. */
  found: number;
  inserted: number;
  updated: number;
  /** Why it failed, when it did. Absent on success. */
  error?: string;
}

export interface RunSummary {
  status: number;
  body: {
    success: boolean;
    totalFound: number;
    inserted: number;
    updated: number;
    sourcesAttempted: number;
    sourcesSucceeded: number;
    perSource: SourceOutcome[];
    errors?: string[];
  };
}

/**
 * 502 when EVERY source failed, 200 otherwise.
 *
 * Three boundaries worth stating, because each was a plausible alternative:
 *
 *   Zero sources attempted is a FAILURE, not a vacuous success. An empty
 *   source list means the job was misconfigured, and "nothing to do" is the
 *   answer a broken config gives.
 *
 *   A source that succeeded and found nothing is a SUCCESS. Restaurants do not
 *   open every day, and treating a quiet day as an outage would make the alert
 *   meaningless within a week.
 *
 *   A partial failure is still 200. Some sources will rot; failing the whole
 *   run on one dead URL turns the job red permanently and teaches everyone to
 *   ignore it - the failure mode WEB-CI-020 and WEB-CI-021 already cost this
 *   repo twice. The per-source counts are in the body, and the ledger row
 *   records itemsFailed, so a partial failure is visible without being fatal.
 *
 * 502 rather than 500: the failure is upstream (the sources, or the model
 * API), not a bug in this handler, and the distinction is what a reader of
 * automation_job_runs needs.
 */
export function summarizeRun(perSource: SourceOutcome[]): RunSummary {
  const succeeded = perSource.filter((s) => s.ok);
  const errors = perSource.filter((s) => !s.ok && s.error).map((s) => `${s.name}: ${s.error}`);
  const allFailed = succeeded.length === 0;

  return {
    status: allFailed ? 502 : 200,
    body: {
      success: !allFailed,
      totalFound: perSource.reduce((n, s) => n + s.found, 0),
      inserted: perSource.reduce((n, s) => n + s.inserted, 0),
      updated: perSource.reduce((n, s) => n + s.updated, 0),
      sourcesAttempted: perSource.length,
      sourcesSucceeded: succeeded.length,
      perSource,
      ...(errors.length > 0 ? { errors } : {}),
    },
  };
}
