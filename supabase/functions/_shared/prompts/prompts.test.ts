/**
 * DMI-007 — the shared prompt data, and the refusals that keep an empty prompt
 * from looking like an empty page.
 *
 * The equivalence proof (that these render byte-identically to the templates
 * that lived in firecrawl-scraper/index.ts before the move) was taken once, at
 * the move, against `git show HEAD` — all three categories matched to the
 * character. It is not repeated here because it can only ever be run against a
 * commit that no longer exists in the working tree; what IS worth guarding
 * forever is that a template cannot go missing, go empty, or ship with a
 * placeholder still in it.
 *
 * Run: `deno test --allow-read supabase/functions/_shared/prompts/prompts.test.ts`
 */
import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import {
  contentWindowFor,
  promptCategories,
  renderExtractionPrompt,
} from "./index.ts";

Deno.test("every declared category renders with no placeholder left behind", () => {
  const vars = {
    URL: "https://example.com/events",
    CONTENT: "PAGE CONTENT",
    CURRENT_DATE: "August 28, 2026",
    CURRENT_YEAR: "2026",
    TEAM_NAME: "Iowa Cubs",
    VENUE: "Principal Park",
    DEFAULT_TICKET_BASE: "https://example.com/tickets",
  };
  const categories = promptCategories();
  assert(categories.length >= 3, `expected the three shipped categories, got ${categories.length}`);
  for (const c of categories) {
    // deno-lint-ignore no-explicit-any
    const out = renderExtractionPrompt(c as any, vars);
    assert(out.length > 500, `${c} rendered suspiciously short (${out.length} chars)`);
    assertEquals(out.match(/\{\{[A-Z_]+\}\}/g), null, `${c} still contains a placeholder`);
    assertStringIncludes(out, "https://example.com/events");
    assertStringIncludes(out, "PAGE CONTENT");
  }
});

Deno.test("the content window is per category, and sports reads more", () => {
  assertEquals(contentWindowFor("events"), 15000);
  assertEquals(contentWindowFor("restaurants"), 15000);
  assertEquals(contentWindowFor("events-sports"), 25000);
  // The difference used to be an inline .substring() at two call sites, where
  // it was invisible to anyone not reading both lines.
  assert(contentWindowFor("events-sports") > contentWindowFor("events"));
});

Deno.test("an unfilled REQUIRED placeholder is refused, not sent", () => {
  // The recorded failure this guards: a hardcoded date made the model stamp bare
  // month/day values with a past year, and the future filter then dropped them
  // silently. A literal {{CURRENT_DATE}} in the prompt is that bug, louder.
  const err = assertThrows(
    () => renderExtractionPrompt("events", { URL: "https://x.test", CONTENT: "c", CURRENT_YEAR: "2026" }),
    Error,
  );
  assertStringIncludes(err.message, "PROMPT_PLACEHOLDER_UNFILLED");
  assertStringIncludes(err.message, "{{CURRENT_DATE}}");
});

Deno.test("an unknown category is a named refusal that lists what exists", () => {
  const err = assertThrows(
    // deno-lint-ignore no-explicit-any
    () => renderExtractionPrompt("concerts" as any, { URL: "u", CONTENT: "c" }),
    Error,
  );
  assertStringIncludes(err.message, "PROMPT_CATEGORY_MISSING");
  assertStringIncludes(err.message, "concerts");
  // Naming the declared set is the difference between a fixable error and a
  // guess about spelling.
  assertStringIncludes(err.message, "events");
});

Deno.test("counter-assertion: the refusals are not firing on everything", () => {
  // Without this, every check above would pass on a module that threw
  // unconditionally.
  const ok = renderExtractionPrompt("restaurants", {
    URL: "https://example.com/food",
    CONTENT: "listing",
  });
  assert(ok.length > 500);
  assertStringIncludes(ok, "https://example.com/food");
});
