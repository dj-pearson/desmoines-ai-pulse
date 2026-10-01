/**
 * Recognising the articles_publishable_body_guard refusal (SEO-058/SEO-059).
 *
 * Migration 20261016000001 added a BEFORE trigger that raises
 *   article_body_not_publishable: <problem>   (SQLSTATE 23514)
 * when a row becomes published/scheduled with a JSON dump, raw HTML or a
 * placeholder as its body. supabase-js does not throw on that: it returns
 * { error } and the caller has to look. ai-article-pipeline did not, so a
 * blocked publish was recorded as "published" in its run metadata while the
 * row stayed a draft nobody was told about.
 *
 * Pure, so the Deno suite can test it without a database.
 */

export interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** The marker the trigger puts at the start of its message. */
export const PUBLISH_GUARD_MARKER = "article_body_not_publishable";

/** check_violation: the code the trigger raises with. */
export const PUBLISH_GUARD_CODE = "23514";

/**
 * The guard's reason ("body is raw HTML, not markdown"), or null when the
 * error is anything else. Matches on the marker, not the code alone: 23514 is
 * every CHECK constraint, and a different one failing is a different bug.
 */
export function publishGuardProblem(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as PostgrestLikeError;
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  const at = text.indexOf(PUBLISH_GUARD_MARKER);
  if (at === -1) return null;
  const rest = text.slice(at + PUBLISH_GUARD_MARKER.length).replace(/^\s*:\s*/, "").trim();
  return rest.length > 0 ? rest : "body is not publishable";
}

/** The line recorded in pipeline_reasons when the guard blocks a publish. */
export function publishBlockedReason(problem: string): string {
  return `publish blocked by articles_publishable_body_guard: ${problem}`;
}
