import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KIDS_EVENTS_FILTER } from "@/hooks/useEventLanding";

/**
 * AND-AUDIT-041. /events/kids on the web lists events matching
 * KIDS_EVENTS_FILTER. Android used to open Search for the text "kids events",
 * which full-text search reads as the word "kids". It now sends the same
 * or-group through supabase-kt's `or { imatch(column, pattern) }`, which
 * renders `column.imatch.pattern` joined by commas.
 *
 * Kotlin cannot import TypeScript and there is no Gradle in cloud sessions,
 * so this reads the Kotlin source. It parses only the shape written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const FILTER = "android/app/src/main/java/com/desmoines/aipulse/util/KidsEventsFilter.kt";
const DATA_SOURCE = "android/app/src/main/java/com/desmoines/aipulse/data/remote/EventsRemoteDataSource.kt";
const DEEP_LINK = "android/app/src/main/java/com/desmoines/aipulse/util/DeepLinkHandler.kt";
const SEARCH_VM = "android/app/src/main/java/com/desmoines/aipulse/ui/screens/search/SearchViewModel.kt";

/** `Arm("title", wordPattern("kids?|..."))` -> `title.imatch."[[:<:]](kids?|...)[[:>:]]"` */
function androidKidsFilter(): string {
  const src = readFileSync(FILTER, "utf8");
  expect(src, "wordPattern no longer builds the web's wordRe shape").toContain(
    'fun wordPattern(alternatives: String): String = "\\"[[:<:]]($alternatives)[[:>:]]\\""',
  );
  const arms = [...src.matchAll(/^\s*Arm\("([a-z_]+)", wordPattern\("([^"]+)"\)\),\s*$/gm)];
  expect(arms.length, `no Arm(...) lines parsed from ${FILTER}`).toBeGreaterThan(0);
  return arms.map(([, column, alternatives]) => `${column}.imatch."[[:<:]](${alternatives})[[:>:]]"`).join(",");
}

describe("Android /events/kids matches the web's kids rule (AND-AUDIT-041)", () => {
  it("KidsEventsFilter.ARMS is KIDS_EVENTS_FILTER byte for byte", () => {
    expect(androidKidsFilter()).toBe(KIDS_EVENTS_FILTER);
  });

  it("EventsRemoteDataSource sends every arm as one or-group when kidsOnly is set", () => {
    expect(readFileSync(DATA_SOURCE, "utf8")).toMatch(
      /if \(query\.kidsOnly\) \{\s*or \{\s*KidsEventsFilter\.ARMS\.forEach \{ imatch\(it\.column, it\.pattern\) \}\s*\}\s*\}/,
    );
  });

  it("Search passes the kids filter through to the events query", () => {
    expect(readFileSync(SEARCH_VM, "utf8")).toMatch(/kidsOnly = kidsOnly,/);
  });

  it('/events/kids opens the kids filter, not the text "kids events"', () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toMatch(/"kids" -> return Destination\.KidsEvents\b/);
    expect(src).not.toMatch(/Destination\.Search\("kids events"\)/);
  });
});
