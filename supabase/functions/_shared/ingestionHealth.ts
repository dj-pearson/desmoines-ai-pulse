/**
 * ingestionHealth (WEB-BE-043) - the rule that decides when an ingestion source
 * has gone dark.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. The watchdog that uses it imports
 * supabase-js from esm.sh, so nothing in that file can be imported by a test.
 * The decision here is the part that can be wrong in a way nobody notices for
 * months - a source stops returning events and every run still reports success -
 * so it lives where a test can reach it.
 *
 * THE COUNTS ARE THE POINT. A run that inserted 0 events is indistinguishable
 * from a quiet Tuesday unless you know what the source used to produce. That is
 * why the rule needs a BASELINE: three zero-insert runs only alert when an older
 * run in the same window inserted something. A source that has never produced
 * anything is somebody else's problem (a misconfigured job, not a dark source)
 * and paging about it every night is how a watchdog gets muted.
 */

/** Per-source counts every ingestion job writes into automation_job_runs.metadata.sources. */
export interface SourceCounts {
  /** Items the source handed us (extracted, before dedup). */
  fetched: number;
  /** Rows actually written. */
  inserted: number;
  /** Items recognised as already present. */
  duplicates: number;
  /** Items that errored during processing. */
  errors: number;
}

export type SourceCountMap = Record<string, SourceCounts>;

/** The subset of an automation_job_runs row this module reads. */
export interface LedgerRun {
  started_at: string;
  status: string;
  metadata: unknown;
}

export type IngestionRule = "zero_inserted_streak" | "error_rate";

export interface IngestionAlert {
  jobName: string;
  source: string;
  rule: IngestionRule;
  message: string;
}

/** Consecutive zero-insert runs required before a source counts as dark. */
export const ZERO_INSERT_STREAK = 3;

/** errors/fetched above this on the newest run is a broken source, not a quiet one. */
export const ERROR_RATE_THRESHOLD = 0.5;

/** How long the hub ingest door may stay silent before it is reported. */
export const HUB_INGEST_MAX_AGE_HOURS = 48;

/**
 * Expected max age (hours) between successful runs, per ingestion job - roughly
 * two cadences, so a job here has missed two consecutive runs.
 *
 * `scrape-events` runs every 30 minutes, so one hour. The GitHub crawler is the
 * daily Actions workflow; it posts its own heartbeat row because nothing inside
 * Supabase can observe an external process, which is the gap that let the
 * Catch Des Moines crawl sit dead for six months (WEB-SEO-017).
 */
export const INGESTION_JOB_MAX_AGE_HOURS: Record<string, number> = {
  "scrape-events": 1,
  "github-event-crawler": 48,
  "firecrawl-scraper": 24 * 7,
  "ai-crawler": 24 * 7,
  "ingest-events": 48,
  "restaurant-opening-scraper": 24 * 14,
  "bulk-update-restaurants": 24 * 7,
  "auto-enrich-restaurants": 48,
};

/** The ledger job name the GitHub Actions crawler posts its heartbeat under. */
export const GITHUB_CRAWLER_JOB = "github-event-crawler";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Pull per-source counts out of a ledger row's metadata.
 *
 * Two shapes are accepted on purpose. `sources` is the canonical one every
 * wrapped job now writes. `perSource` is the array restaurant-opening-scraper
 * wrote first (WEB-BE-041), and rows in that shape are already in the table -
 * silently skipping them would make the very first source this rule was meant
 * to watch invisible to it.
 */
export function readSourceCounts(metadata: unknown): SourceCountMap {
  if (!metadata || typeof metadata !== "object") return {};
  const meta = metadata as Record<string, unknown>;

  const sources = meta.sources;
  if (sources && typeof sources === "object" && !Array.isArray(sources)) {
    const out: SourceCountMap = {};
    for (const [name, raw] of Object.entries(sources as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const c = raw as Record<string, unknown>;
      out[name] = {
        fetched: num(c.fetched),
        inserted: num(c.inserted),
        duplicates: num(c.duplicates),
        errors: num(c.errors),
      };
    }
    return out;
  }

  const perSource = meta.perSource;
  if (Array.isArray(perSource)) {
    const out: SourceCountMap = {};
    for (const raw of perSource) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : null;
      if (!name) continue;
      out[name] = {
        fetched: num(o.found),
        // `updated` is a write too: a source that only refreshes existing rows
        // is alive, and counting it as zero would page about a working source.
        inserted: num(o.inserted) + num(o.updated),
        duplicates: num(o.duplicates),
        errors: o.ok === false || typeof o.error === "string" ? 1 : 0,
      };
    }
    return out;
  }

  return {};
}

/** Runs that finished and did work - a paused ('skipped') or open ('running') run proves nothing. */
export function completedRuns(runs: LedgerRun[]): LedgerRun[] {
  return runs.filter((r) => r.status !== "running" && r.status !== "skipped");
}

export interface EvaluateOptions {
  streak?: number;
  errorRateThreshold?: number;
}

/**
 * Decide which sources of one ingestion job should alert.
 *
 * `runsNewestFirst` is that job's recent automation_job_runs rows, newest first.
 * Pass more than `streak` of them: the runs beyond the streak are what supply
 * the non-zero baseline, and without them nothing can alert.
 */
export function evaluateIngestionHealth(
  jobName: string,
  runsNewestFirst: LedgerRun[],
  opts: EvaluateOptions = {},
): IngestionAlert[] {
  const streak = opts.streak ?? ZERO_INSERT_STREAK;
  const threshold = opts.errorRateThreshold ?? ERROR_RATE_THRESHOLD;

  const done = completedRuns(runsNewestFirst);
  const counts = done.map((r) => readSourceCounts(r.metadata));
  const recent = counts.slice(0, streak);
  const older = counts.slice(streak);
  const alerts: IngestionAlert[] = [];

  // Rule 1: zero inserted for `streak` consecutive runs, after a run that
  // inserted something. Needs a full streak; a job with two runs in the table
  // has not yet earned an opinion.
  if (recent.length >= streak) {
    // Only sources present in EVERY recent run. A source that appeared once
    // and then vanished from the metadata has no streak to measure - that is a
    // configuration change, and the cadence check above catches a job that
    // stopped running altogether.
    const candidates = Object.keys(recent[0]).filter((name) =>
      recent.every((c) => c[name] !== undefined)
    );
    for (const name of candidates) {
      if (!recent.every((c) => c[name].inserted === 0)) continue;
      const baseline = older.some((c) => (c[name]?.inserted ?? 0) > 0);
      if (!baseline) continue;
      alerts.push({
        jobName,
        source: name,
        rule: "zero_inserted_streak",
        message:
          `"${jobName}" source "${name}" has inserted 0 for ${streak} consecutive runs ` +
          `after previously inserting rows. The source has gone dark or its extraction broke.`,
      });
    }
  }

  // Rule 2: the newest completed run's error rate. Evaluated on one run rather
  // than a streak because a source erroring on more than half of what it
  // fetched is already broken; waiting three runs to say so buys nothing.
  const newest = recent[0];
  if (newest) {
    for (const [name, c] of Object.entries(newest)) {
      if (c.fetched <= 0) continue;
      const rate = c.errors / c.fetched;
      if (rate <= threshold) continue;
      alerts.push({
        jobName,
        source: name,
        rule: "error_rate",
        message:
          `"${jobName}" source "${name}" errored on ${c.errors} of ${c.fetched} items ` +
          `(${Math.round(rate * 100)}%) on its latest run, over the ${Math.round(threshold * 100)}% threshold.`,
      });
    }
  }

  return alerts;
}

/**
 * Has the hub ingest door gone quiet? `newestIso` is the created_at of the most
 * recent `events` row carrying provenance (ingest-events is the only writer of
 * produced_by, so any such row came through the hub).
 *
 * A null newestIso reports NOT stale on purpose: no provenanced row has ever
 * been written, which means the hub has not started rather than stopped, and
 * the two need different responses from an operator.
 */
export function hubIngestStale(
  newestIso: string | null,
  nowMs: number,
  maxAgeHours: number = HUB_INGEST_MAX_AGE_HOURS,
): { stale: boolean; ageHours: number | null } {
  if (!newestIso) return { stale: false, ageHours: null };
  const then = new Date(newestIso).getTime();
  if (!Number.isFinite(then)) return { stale: false, ageHours: null };
  const ageHours = (nowMs - then) / 3_600_000;
  return { stale: ageHours > maxAgeHours, ageHours };
}
