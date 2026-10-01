/**
 * SEO-057. The Deno writers (firecrawl-scraper, ai-crawler, ingest-events,
 * enhance-content, bulk-enhance-events) strip model labels with this copy;
 * the web app, the Pages middleware and the RSS script use src/lib/aiText.ts.
 * The two must be the same file, or a label one side removes is shipped by
 * the other. The behaviour itself is covered in src/lib/__tests__/aiText.test.ts.
 *
 * Run: deno test --allow-read supabase/functions/_shared/aiText.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { stripAiLabels } from "./aiText.ts";

Deno.test("_shared/aiText.ts is byte-identical to src/lib/aiText.ts", async () => {
  const norm = (s: string) => s.replace(/\r\n/g, "\n");
  const web = await Deno.readTextFile(new URL("../../../src/lib/aiText.ts", import.meta.url));
  const deno = await Deno.readTextFile(new URL("./aiText.ts", import.meta.url));
  assertEquals(norm(deno), norm(web));
});

Deno.test("the writers' label strip: the stored Schedule row", () => {
  const stored =
    "**Enhanced Event Description:**\n\n**Iowa Cubs Baseball at Principal Park**\n\nExperience the thrill.\n\n**Location:**";
  assertEquals(stripAiLabels(stored), "**Iowa Cubs Baseball at Principal Park**\n\nExperience the thrill.");
});

Deno.test("the writers' label strip leaves source text and empties alone", () => {
  assertEquals(stripAiLabels("Professional baseball game featuring the Iowa Cubs."), "Professional baseball game featuring the Iowa Cubs.");
  assertEquals(stripAiLabels(undefined), "");
  assertEquals(stripAiLabels(""), "");
});
