/**
 * Pure decisions for the error pipeline (IOS-DD-PLATFORM-18): log-error's
 * `source` and error-triage's per-run task cap. No imports, so the tests in
 * _tests/error-policy.test.ts run offline.
 */

/**
 * The stored `source`. "edge" marks an error as server-side, which triage
 * treats as not user-facing, so only an internal caller (service role or the
 * edge API key) may claim it. log-error is a public sink: anyone with the
 * anon key could otherwise file their reports as "edge".
 */
export function resolveSource(bodySource: unknown, internal: boolean): "edge" | "client" {
  return bodySource === "edge" && internal ? "edge" : "client";
}

/** New tasks error-triage may open in one run. */
export const MAX_NEW_TASKS_PER_RUN = 25;

export interface ClusterRef {
  key: string;
  frequency: number;
}

/**
 * The dedupe keys to create tasks for: clusters with no open task, most
 * frequent first, at most `cap`. A burst of distinct signatures (a bad
 * deploy, or someone posting junk to the public sink) used to open one task
 * per signature in a single run.
 */
export function pickClustersToCreate(
  clusters: readonly ClusterRef[],
  existingKeys: ReadonlySet<string>,
  cap: number,
): string[] {
  return clusters
    .filter((c) => !existingKeys.has(c.key))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.frequency - a.c.frequency || a.i - b.i)
    .slice(0, Math.max(0, cap))
    .map(({ c }) => c.key);
}
