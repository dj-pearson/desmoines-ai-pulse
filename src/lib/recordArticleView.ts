import { supabase } from "@/integrations/supabase/client";

/**
 * Record one view of an article (WEB-BE-056 AC2).
 *
 * WHAT THIS REPLACES: useArticles read the row and then wrote
 * view_count + 1 straight to the table. RLS on articles grants anon SELECT
 * only, so that UPDATE was rejected for every reader who has ever opened an
 * article - the failure caught and logged, view_count never moving, the
 * "popular" sort ordering by a column of zeros, and every detail render
 * issuing a doomed write. Even with the grant it loses counts: two readers on
 * one article at the same moment record one view between them.
 *
 * increment_article_view is SECURITY DEFINER and does the arithmetic in the
 * database, so it is both allowed and atomic.
 */

/**
 * True for a client that should not be counted as a reader.
 *
 * Playwright and every other WebDriver-controlled browser sets
 * navigator.webdriver, and scripts/prerender.mjs drives a headless Chromium
 * over every hub route on each build - so without this the prerenderer would
 * have been the site's most engaged reader.
 */
export function isAutomatedClient(nav: Pick<Navigator, "webdriver" | "userAgent"> = navigator): boolean {
  if (nav.webdriver) return true;
  return /HeadlessChrome|Prerender|Playwright|puppeteer/i.test(nav.userAgent || "");
}

/** Fire-and-forget: a failed count must never affect the page. */
export function recordArticleView(slug: string): void {
  if (typeof window === "undefined" || !slug) return;
  if (isAutomatedClient()) return;

  // The function name is not in the generated types until migration
  // 20260919000010 is applied and the types are regenerated, so the call is
  // made through a narrowed signature rather than the typed overload set.
  // scripts/check-schema-usage.mjs carries it in PENDING_MIGRATIONS, which is
  // what keeps this from becoming a permanent untyped call.
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: unknown }>;

  // .then(), not `void`: a PostgrestBuilder sends nothing until something
  // subscribes to it (WEB-PERF-039). rpc() is the same shape.
  void rpc("increment_article_view", { p_slug: slug }).then(undefined, () => {
    // Counting is best-effort. Before that migration is applied this is
    // PGRST202, which is the same no-op as the write it replaces.
  });
}
