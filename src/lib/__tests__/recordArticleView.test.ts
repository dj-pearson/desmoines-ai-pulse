import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { isAutomatedClient } from "@/lib/recordArticleView";

/**
 * WEB-BE-056 AC2. The article view counter.
 *
 * It was a client read-modify-write: SELECT the row, UPDATE view_count + 1.
 * RLS on articles grants anon SELECT only, so that write was rejected for
 * every reader who has ever opened an article - caught, logged, and invisible.
 * view_count has never moved, which is why the "popular" sort orders by a
 * column of zeros and every detail page says "0 views".
 *
 * Two independent problems, and the test covers both: the write has to happen
 * in the database (increment_article_view, SECURITY DEFINER, atomic - a
 * read-modify-write loses counts when two readers arrive together), and the
 * automated clients have to be excluded, because prerender.mjs drives a
 * headless browser over the site on every build and would otherwise be the
 * most engaged reader we have.
 */
const nav = (webdriver: boolean, userAgent: string) =>
  ({ webdriver, userAgent }) as Pick<Navigator, "webdriver" | "userAgent">;

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

describe("isAutomatedClient", () => {
  it("counts an ordinary browser as a reader", () => {
    expect(isAutomatedClient(nav(false, CHROME))).toBe(false);
  });

  it("excludes anything WebDriver is steering", () => {
    expect(isAutomatedClient(nav(true, CHROME))).toBe(true);
  });

  it("excludes the headless build tooling by user agent", () => {
    for (const ua of [
      "Mozilla/5.0 HeadlessChrome/140.0",
      "Prerender (+https://example.com)",
      "playwright/1.40",
      "Mozilla/5.0 puppeteer",
    ]) {
      expect(isAutomatedClient(nav(false, ua)), ua).toBe(true);
    }
  });

  it("does not choke on a missing user agent", () => {
    expect(isAutomatedClient(nav(false, ""))).toBe(false);
  });
});

describe("the counter is a database function, not a client write", () => {
  const HOOK = readFileSync("src/hooks/useArticles.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");

  it("no longer updates view_count from the browser", () => {
    expect(HOOK).not.toMatch(/update\(\s*\{\s*view_count/);
  });

  it("calls the recorder on a detail fetch", () => {
    expect(HOOK).toContain("recordArticleView(slug)");
  });

  it("the RPC exists in a migration, since the call alone counts nothing", () => {
    const sql = readFileSync(
      "supabase/migrations/20260919000010_article_views_and_word_count.sql",
      "utf8",
    );
    expect(sql).toContain("FUNCTION public.increment_article_view(p_slug text)");
    expect(sql).toContain("SECURITY DEFINER");
    // Anonymous readers are the ones counting; without the grant the function
    // exists and refuses everybody who actually reads an article.
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.increment_article_view\(text\) TO anon/);
  });
});
