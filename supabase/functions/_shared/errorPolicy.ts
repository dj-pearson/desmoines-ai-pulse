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

/** Same shape log-error has always accepted for userId. */
const USER_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * The stored `user_id` for an error row (WEB-SEC-063).
 *
 * log-error is a public sink, so body.userId is the caller's word. It used to
 * be stored as given: anyone holding the anon key could pin an error row on
 * any user id they knew.
 *
 * - `verifiedUserId` is what auth.getUser returned for the caller's bearer.
 *   When there is one it wins and body.userId is ignored, even if it differs.
 * - A machine caller (service role or the edge API key) already holds the
 *   whole database, so it may report on behalf of a user it names.
 * - Anyone else gets null. The row is still stored; only the attribution goes.
 */
export function resolveErrorUserId(
  bodyUserId: unknown,
  caller: { internal: boolean; verifiedUserId: string | null },
): string | null {
  if (caller.verifiedUserId && USER_ID_RE.test(caller.verifiedUserId)) return caller.verifiedUserId;
  if (caller.internal && typeof bodyUserId === "string" && USER_ID_RE.test(bodyUserId)) return bodyUserId;
  return null;
}

/**
 * Whether a bearer is worth asking auth.getUser about. An absent token and the
 * anon key (iOS sends it as the bearer) cannot name a user, so log-error skips
 * the auth round trip for them.
 */
export function shouldVerifyBearer(
  bearer: string | null | undefined,
  anonKey: string | null | undefined,
): boolean {
  if (!bearer) return false;
  if (anonKey && bearer === anonKey) return false;
  return true;
}
