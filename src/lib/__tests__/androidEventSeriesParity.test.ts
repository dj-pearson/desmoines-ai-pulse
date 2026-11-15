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
});
