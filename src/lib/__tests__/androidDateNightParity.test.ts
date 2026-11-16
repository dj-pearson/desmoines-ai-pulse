import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DATE_NIGHT_FILTER } from "@/hooks/useEventLanding";
import { EVENING_START_HOUR, NIGHT_END_HOUR } from "@/lib/tonightPairings";

/**
 * AND-AUDIT-046. /events/date-night on the web lists events matching
 * DATE_NIGHT_FILTER over a fixed Central window of WINDOW_DAYS, evening
 * starts only unless ?time=all. Android opened that page in a web view; it
 * now opens Search on Events with the same rule, sent through supabase-kt's
 * `or { isIn(...); imatch(...) }`, which renders `category.in.(a,b,c)` and
 * `title.imatch.pattern` joined by a comma.
 *
 * Kotlin cannot import TypeScript and there is no Gradle in cloud sessions,
 * so this reads the Kotlin source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const FILTER = "android/app/src/main/java/com/desmoines/aipulse/util/DateNightFilter.kt";
const KIDS = "android/app/src/main/java/com/desmoines/aipulse/util/KidsEventsFilter.kt";
const DATA_SOURCE = "android/app/src/main/java/com/desmoines/aipulse/data/remote/EventsRemoteDataSource.kt";
const DEEP_LINK = "android/app/src/main/java/com/desmoines/aipulse/util/DeepLinkHandler.kt";
const SEARCH_VM = "android/app/src/main/java/com/desmoines/aipulse/ui/screens/search/SearchViewModel.kt";
const WEB_PAGE = "src/pages/DateNightEvents.tsx";

function kotlinInt(src: string, name: string): number {
  const m = src.match(new RegExp(`const val ${name} = (\\d+)\\b`));
  expect(m, `${name} not found in ${FILTER}`).not.toBeNull();
  return Number(m![1]);
}

/** CATEGORIES and TITLE_PATTERN rebuilt as the or() body supabase-kt sends. */
function androidDateNightFilter(src: string): string {
  expect(readFileSync(KIDS, "utf8"), "wordPattern no longer builds the web's wordRe shape").toContain(
    'fun wordPattern(alternatives: String): String = "\\"[[:<:]]($alternatives)[[:>:]]\\""',
  );
  const categories = src.match(/val CATEGORIES: List<String> = listOf\(([^)]*)\)/);
  expect(categories, `CATEGORIES not found in ${FILTER}`).not.toBeNull();
  const names = [...categories![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const title = src.match(/val TITLE_PATTERN: String = KidsEventsFilter\.wordPattern\("([^"]+)"\)/);
  expect(title, `TITLE_PATTERN not found in ${FILTER}`).not.toBeNull();
  return `category.in.(${names.join(",")}),title.imatch."[[:<:]](${title![1]})[[:>:]]"`;
}

describe("Android /events/date-night matches the web's date night rule (AND-AUDIT-046)", () => {
  const src = readFileSync(FILTER, "utf8");

  it("DateNightFilter is DATE_NIGHT_FILTER byte for byte", () => {
    expect(androidDateNightFilter(src)).toBe(DATE_NIGHT_FILTER);
  });

  it("the window is the web page's WINDOW_DAYS", () => {
    const web = readFileSync(WEB_PAGE, "utf8").match(/const WINDOW_DAYS = (\d+);/);
    expect(web, `WINDOW_DAYS not found in ${WEB_PAGE}`).not.toBeNull();
    expect(kotlinInt(src, "WINDOW_DAYS")).toBe(Number(web![1]));
  });

  it("evening is the web's EVENING_START_HOUR to NIGHT_END_HOUR", () => {
    expect(kotlinInt(src, "EVENING_START_HOUR")).toBe(EVENING_START_HOUR);
    expect(kotlinInt(src, "NIGHT_END_HOUR")).toBe(NIGHT_END_HOUR);
  });

  it("EventsRemoteDataSource sends both arms as one or-group, and Search passes the window", () => {
    expect(readFileSync(DATA_SOURCE, "utf8")).toMatch(
      /if \(query\.dateNightOnly\) \{\s*or \{\s*isIn\("category", DateNightFilter\.CATEGORIES\)\s*imatch\("title", DateNightFilter\.TITLE_PATTERN\)\s*\}\s*\}/,
    );
    const vm = readFileSync(SEARCH_VM, "utf8");
    expect(vm).toMatch(/dateNightOnly = dateNight != null,/);
    expect(vm).toMatch(/dateStart = window\?\.first,\s*dateEnd = window\?\.second,/);
    expect(vm).toMatch(/fetched\.filter\(DateNightFilter::isEveningStart\)/);
  });

  it("/events/date-night opens the date night filter, not the web page", () => {
    const dl = readFileSync(DEEP_LINK, "utf8");
    expect(dl).toMatch(/"date-night" -> return Destination\.DateNight\(DateNightFilter\.timesFor\(url\)\)/);
    expect(dl).not.toMatch(/"date-night" -> return Destination\.Web\(url\)/);
  });
});
