import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_SERIES, normaliseEventTitle, seriesTitlePatterns } from "../eventSeries";

/**
 * AND-AUDIT-042, slice 1. Android carries its own copy of EVENT_SERIES so it
 * can open /events/series/<slug> natively, and its own port of
 * normaliseEventTitle, which decides which rows are editions of a series. Both
 * are copies of an editorial list and a regex pipeline, the two things that
 * drift quietly. iosEventSeriesParity.test.ts holds the iOS copy the same way.
 *
 * Kotlin cannot import TypeScript and there is no Gradle in cloud sessions, so
 * this reads the Kotlin source. It parses only the shapes written today; if
 * either file is rewritten into another shape the parse finds nothing and the
 * test fails rather than passing on nothing.
 */

const SERIES = "android/app/src/main/java/com/desmoines/aipulse/util/EventSeries.kt";
const TESTS = "android/app/src/test/java/com/desmoines/aipulse/util/EventSeriesTest.kt";
const SOURCE = "android/app/src/main/java/com/desmoines/aipulse/data/remote/EventsRemoteDataSource.kt";
const WEB_HOOK = "src/hooks/useEventSeriesPage.ts";
const IOS_SERVICE = "ios/DesMoinesInsider/Services/EventsService.swift";
const WEB_DETAIL = "src/pages/EventDetails.tsx";

/** Kotlin string literal body to its value: \" \\ \$ and \uXXXX only. */
function unescapeKotlin(body: string): string {
  return body.replace(/\\u([0-9a-fA-F]{4})|\\(["\\$])/g, (_m, hex: string | undefined, ch: string | undefined) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : (ch as string),
  );
}

const LITERAL = String.raw`"((?:[^"\\]|\\.)*)"`;

interface ParsedDef {
  slug: string;
  name: string;
  aliases: string[];
  venueIncludes?: string[];
  officialHost?: string;
  about: string;
}

function androidSeries(): ParsedDef[] {
  const src = readFileSync(SERIES, "utf8");
  const block = src.match(/val ALL: List<EventSeriesDef> = listOf\(([\s\S]*?)\n {4}\)\n/);
  expect(block, `EventSeries.ALL literal not found in ${SERIES}`).not.toBeNull();
  const entries = block![1].split("EventSeriesDef(").slice(1);
  expect(entries.length, "no EventSeriesDef entries parsed").toBeGreaterThan(0);
  return entries.map((entry) => {
    const one = (label: string) => {
      const m = entry.match(new RegExp(`\\b${label} = ${LITERAL},`));
      return m ? unescapeKotlin(m[1]) : undefined;
    };
    const list = (label: string) => {
      const m = entry.match(new RegExp(`\\b${label} = listOf\\(([^)]*)\\),`));
      return m ? [...m[1].matchAll(new RegExp(LITERAL, "g"))].map((s) => unescapeKotlin(s[1])) : undefined;
    };
    const def: ParsedDef = {
      slug: one("slug") as string,
      name: one("name") as string,
      aliases: list("aliases") as string[],
      about: one("about") as string,
    };
    const venueIncludes = list("venueIncludes");
    if (venueIncludes) def.venueIncludes = venueIncludes;
    const officialHost = one("officialHost");
    if (officialHost) def.officialHost = officialHost;
    return def;
  });
}

/** `"title" to "normalised",` per line inside NORMALISE_CASES. */
function androidNormaliseCases(): [string, string][] {
  const src = readFileSync(TESTS, "utf8");
  const block = src.match(/val NORMALISE_CASES: List<Pair<String, String>> = listOf\(([\s\S]*?)\n {8}\)/);
  expect(block, `NORMALISE_CASES literal not found in ${TESTS}`).not.toBeNull();
  const pairs = [...block![1].matchAll(new RegExp(`^\\s*${LITERAL} to ${LITERAL},\\s*$`, "gm"))].map(
    (m) => [unescapeKotlin(m[1]), unescapeKotlin(m[2])] as [string, string],
  );
  expect(pairs.length, "no normalise cases parsed").toBeGreaterThan(5);
  return pairs;
}

describe("Android annual event series match the web (AND-AUDIT-042)", () => {
  it("EventSeries.ALL is EVENT_SERIES, field for field and in order", () => {
    const expected = EVENT_SERIES.map((d) => {
      const def: ParsedDef = { slug: d.slug, name: d.name, aliases: [...d.aliases], about: d.about };
      if (d.venueIncludes) def.venueIncludes = [...d.venueIncludes];
      if (d.officialHost) def.officialHost = d.officialHost;
      return def;
    });
    expect(androidSeries()).toEqual(expected);
  });

  it("every normalise case in EventSeriesTest is the web's answer", () => {
    for (const [title, normalised] of androidNormaliseCases()) {
      expect(normaliseEventTitle(title), title).toBe(normalised);
    }
  });

  it("the title patterns are built the way the web builds them", () => {
    const src = readFileSync(SERIES, "utf8");
    expect(src).toContain('def.aliases.map { "title.ilike.*${it.split(" ").joinToString("*")}*" }');
    // The Kotlin template above, evaluated here, is the web's output.
    for (const def of EVENT_SERIES) {
      const kotlin = def.aliases.map((a) => `title.ilike.*${a.split(" ").join("*")}*`);
      expect(kotlin).toEqual(seriesTitlePatterns(def));
    }
  });

  it("the series read keeps hidden and archived rows, drops merged ones, and caps like the web", () => {
    // AND-AUDIT-042, slice 3a. A past edition is a row the stale sweep hid.
    // If this read filtered is_hidden or archived_at the way every other list
    // does, the screen would show no past years and EventSeriesSchedule would
    // never see a sweep-hidden row to list without a link.
    const src = readFileSync(SOURCE, "utf8");
    const start = src.indexOf("suspend fun fetchSeriesRows(");
    expect(start, `fetchSeriesRows not found in ${SOURCE}`).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n    }\n", start));
    expect(body).toContain('neq("is_merged", true)');
    expect(body).toContain("EventSeries.titleLikePatterns(def)");
    expect(body).toContain('patterns.forEach { ilike("title", it) }');
    expect(body).toContain("limit(SERIES_ROW_LIMIT)");
    expect(body).toContain("SeriesEventRows.decode(");
    expect(body).not.toMatch(/is_hidden|archived_at/);

    const androidLimit = src.match(/const val SERIES_ROW_LIMIT = (\d+)L/);
    const webLimit = readFileSync(WEB_HOOK, "utf8").match(/const SERIES_ROW_LIMIT = (\d+)/);
    const iosLimit = readFileSync(IOS_SERVICE, "utf8").match(/static let seriesRowLimit = (\d+)/);
    expect(androidLimit, `SERIES_ROW_LIMIT not found in ${SOURCE}`).not.toBeNull();
    expect(webLimit, `SERIES_ROW_LIMIT not found in ${WEB_HOOK}`).not.toBeNull();
    expect(iosLimit, `seriesRowLimit not found in ${IOS_SERVICE}`).not.toBeNull();
    expect(androidLimit![1]).toBe(webLimit![1]);
    expect(iosLimit![1]).toBe(webLimit![1]);
  });

  it("event detail's every-year line says what the web's event page says", () => {
    // AND-AUDIT-043. The web prints the sentence and the link label as
    // JSX text around {series.name}; Android builds them from def.name.
    const web = readFileSync(WEB_DETAIL, "utf8").replace(/\s+/g, " ");
    expect(web).toContain('{series.name} happens every year.{" "}');
    expect(web).toContain("Every year's dates for {series.name}");
    const src = readFileSync(SERIES, "utf8");
    expect(src).toContain('fun everyYearSentence(def: EventSeriesDef): String = "${def.name} happens every year."');
    expect(src).toContain(`fun everyYearLinkLabel(def: EventSeriesDef): String = "Every year's dates for \${def.name}"`);
  });

  it("the like patterns are the web's title patterns in supabase-kt form", () => {
    const src = readFileSync(SERIES, "utf8");
    expect(src).toContain('def.aliases.map { "%${it.split(" ").joinToString("%")}%" }');
    for (const def of EVENT_SERIES) {
      const kotlin = def.aliases.map((a) => `%${a.split(" ").join("%")}%`);
      const web = seriesTitlePatterns(def).map((p) => p.replace(/^title\.ilike\./, "").replace(/\*/g, "%"));
      expect(kotlin).toEqual(web);
    }
  });
});
