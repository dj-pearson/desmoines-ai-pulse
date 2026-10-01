/**
 * The admin-side reading of the articles_publishable_body_guard refusal
 * (migration 20261016000001, SEO-058). The trigger raises
 *   article_body_not_publishable: <problem>
 * and PostgREST hands that back as the error message. Shown raw, an editor
 * sees a database error; this turns it into what to fix.
 *
 * supabase/functions/_shared/articlePublishGuard.ts is the edge-function twin
 * (Deno cannot import from src/).
 */

const MARKER = 'article_body_not_publishable';

/** The guard's reason, or null when the error is something else. */
export function articlePublishGuardProblem(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { message?: unknown; details?: unknown };
  const text = `${typeof e.message === 'string' ? e.message : ''} ${typeof e.details === 'string' ? e.details : ''}`;
  const at = text.indexOf(MARKER);
  if (at === -1) return null;
  const rest = text.slice(at + MARKER.length).replace(/^\s*:\s*/, '').trim();
  return rest.length > 0 ? rest : 'body is not publishable';
}

/** Editor-facing text for a refused publish, or null when it is another error. */
export function articlePublishGuardMessage(error: unknown): string | null {
  const problem = articlePublishGuardProblem(error);
  if (!problem) return null;
  return `This article can't be published yet: ${problem}. Store the body as clean markdown (no JSON, raw HTML or [placeholder] text) and publish again.`;
}
