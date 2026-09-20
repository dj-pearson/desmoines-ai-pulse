/**
 * WEB-FEAT-017 — recognising the plan-limit refusal the database now raises.
 *
 * The triggers added in 20260918000001_enforce_plan_limits.sql raise with
 * SQLSTATE PT402 and HINT 'upgrade_required'. PostgREST turns PT4xx into that
 * HTTP status and passes code/details/hint through, so supabase-js hands the
 * whole shape to onError.
 *
 * Both signals are checked because they fail differently: the hint is ours and
 * survives anything a proxy does to the status, while the code survives a
 * reworded message. A client that matched on the message string would break the
 * first time someone edited the SQL.
 */

/** Which limit was hit, when the error carries one. */
export type PlanLimitKind = "favorites" | "saved_searches" | "alerts";

interface PostgrestLike {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
}

function asPostgrest(error: unknown): PostgrestLike | null {
  if (!error || typeof error !== "object") return null;
  return error as PostgrestLike;
}

/** True when the write was refused because the user's plan does not allow it. */
export function isPlanLimitError(error: unknown): boolean {
  const e = asPostgrest(error);
  if (!e) return false;
  return e.hint === "upgrade_required" || e.code === "PT402";
}

/** The limits key the trigger reported, or null if the error is not one of ours. */
export function planLimitKind(error: unknown): PlanLimitKind | null {
  if (!isPlanLimitError(error)) return null;
  const detail = asPostgrest(error)?.details;
  if (detail === "favorites" || detail === "saved_searches" || detail === "alerts") {
    return detail;
  }
  return null;
}

/**
 * The message to show. The database already writes a user-facing sentence
 * ("Your plan allows 3 saved favorites."), so prefer it over a second copy of
 * the same wording maintained here.
 */
export function planLimitMessage(error: unknown, fallback: string): string {
  const message = asPostgrest(error)?.message;
  return isPlanLimitError(error) && message ? message : fallback;
}
