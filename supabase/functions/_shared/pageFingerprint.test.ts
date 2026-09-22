/**
 * When an unchanged page may skip the model, and - the half that matters -
 * when it may not.
 *
 * Run: `deno test supabase/functions/_shared/pageFingerprint.test.ts`
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  decideExtraction,
  hashExtractionWindow,
  REEXTRACT_AFTER_HOURS,
  type PageFingerprint,
} from "./pageFingerprint.ts";

const NOW = new Date("2026-09-22T18:00:00Z");

function previous(overrides: Partial<PageFingerprint> = {}): PageFingerprint {
  return {
    url: "https://venue.example/events/",
    content_hash: "abc",
    items_found: 12,
    content_changed_at: "2026-09-20T00:00:00Z",
    last_extracted_at: "2026-09-22T12:00:00Z",
    consecutive_skips: 0,
    ...overrides,
  };
}

Deno.test("an unchanged page with events, extracted recently, skips", () => {
  assertEquals(decideExtraction(previous(), "abc", NOW), { extract: false, reason: "unchanged" });
});

Deno.test("a page never seen is extracted", () => {
  assertEquals(decideExtraction(null, "abc", NOW).reason, "first_seen");
});

Deno.test("a changed page is extracted", () => {
  assertEquals(decideExtraction(previous(), "def", NOW).reason, "changed");
});

Deno.test("an unchanged page that last yielded nothing is extracted, not trusted", () => {
  // "No events on this page" and "extraction broken on this page" hash the same.
  assertEquals(decideExtraction(previous({ items_found: 0 }), "abc", NOW).reason, "previous_run_found_nothing");
});

Deno.test("an unchanged page is re-extracted once the last extraction is a day old", () => {
  const dayOld = new Date(NOW.getTime() - REEXTRACT_AFTER_HOURS * 3_600_000).toISOString();
  assertEquals(decideExtraction(previous({ last_extracted_at: dayOld }), "abc", NOW).reason, "stale");
  const justUnder = new Date(NOW.getTime() - (REEXTRACT_AFTER_HOURS * 3_600_000 - 60_000)).toISOString();
  assertEquals(decideExtraction(previous({ last_extracted_at: justUnder }), "abc", NOW).extract, false);
});

Deno.test("an unreadable last_extracted_at is stale, not fresh", () => {
  assertEquals(decideExtraction(previous({ last_extracted_at: "garbage" }), "abc", NOW).reason, "stale");
});

Deno.test("force wins over everything", () => {
  assertEquals(decideExtraction(previous(), "abc", NOW, { force: true }).reason, "force");
});

Deno.test("the hash ignores whitespace churn and nothing else", async () => {
  const a = await hashExtractionWindow("<li>Hamilton  Oct 2</li>\n\n<li>Wicked Oct 9</li>");
  const b = await hashExtractionWindow("  <li>Hamilton Oct 2</li> <li>Wicked Oct 9</li>\t");
  const c = await hashExtractionWindow("<li>Hamilton Oct 3</li> <li>Wicked Oct 9</li>");
  assertEquals(a, b);
  assertNotEquals(a, c);
  assertEquals(a.length, 64);
});
