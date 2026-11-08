import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EVENT_SERIES, normaliseEventTitle } from "../eventSeries";

/**
 * IOS-AUDIT-FEAT-046. iOS carries its own copy of EVENT_SERIES so it can open
 * /events/series/<slug> natively, and its own port of normaliseEventTitle,
 * which decides which rows are editions of a series. Both are copies of an
 * editorial list and a regex pipeline, the two things that drift quietly.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either file is rewritten into another shape the parse finds nothing and the
 * test fails rather than passing on nothing.
 */

const SERIES = "ios/DesMoinesInsider/Models/EventSeries.swift";
const TESTS = "ios/DesMoinesInsiderTests/EventSeriesTests.swift";

/** Swift string literal body to its value: \" \\ and \u{hex} only. */
function unescapeSwift(body: string): string {
  return body.replace(/\\u\{([0-9a-fA-F]+)\}|\\(["\\])/g, (_m, hex: string | undefined, ch: string | undefined) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : (ch as string),
  );
}

const STRING = /"((?:[^"\\]|\\.)*)"/g;

function stringsIn(text: string): string[] {
  return [...text.matchAll(STRING)].map((m) => unescapeSwift(m[1]));
}

interface ParsedDef {
  slug: string;
  name: string;
  aliases: string[];
  venueIncludes?: string[];
  officialHost?: string;
  about: string;
}

function iosSeries(): ParsedDef[] {
  const src = readFileSync(SERIES, "utf8");
  const block = src.match(/static let all: \[EventSeriesDef\] = \[([\s\S]*?)\n {4}\]/);
  expect(block, `EventSeries.all literal not found in ${SERIES}`).not.toBeNull();
  const entries = block![1].split("EventSeriesDef(").slice(1);
  return entries.map((entry) => {
    const one = (label: string) => {
      const m = entry.match(new RegExp(`\\b${label}: "((?:[^"\\\\]|\\\\.)*)"`));
      return m ? unescapeSwift(m[1]) : undefined;
    };
    const list = (label: string) => {
      const m = entry.match(new RegExp(`\\b${label}: \\[([^\\]]*)\\]`));
      return m ? stringsIn(m[1]) : undefined;
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

/** `("title", "normalised"),` per line inside `static let normaliseCases`. */
function iosNormaliseCases(): [string, string][] {
  const src = readFileSync(TESTS, "utf8");
  const block = src.match(/static let normaliseCases: \[\(String, String\)\] = \[([\s\S]*?)\n {4}\]/);
  expect(block, `normaliseCases literal not found in ${TESTS}`).not.toBeNull();
  const pairs = [...block![1].matchAll(/\(\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\s*\)/g)].map(
    (m) => [unescapeSwift(m[1]), unescapeSwift(m[2])] as [string, string],
  );
  expect(pairs.length, "no normalise cases parsed").toBeGreaterThan(5);
  return pairs;
}

describe("iOS annual event series match the web (IOS-AUDIT-FEAT-046)", () => {
  it("EventSeries.all is EVENT_SERIES, field for field and in order", () => {
    const expected = EVENT_SERIES.map((d) => {
      const def: ParsedDef = { slug: d.slug, name: d.name, aliases: [...d.aliases], about: d.about };
      if (d.venueIncludes) def.venueIncludes = [...d.venueIncludes];
      if (d.officialHost) def.officialHost = d.officialHost;
      return def;
    });
    expect(iosSeries()).toEqual(expected);
  });

  it("every normalise case in EventSeriesTests is the web's answer", () => {
    for (const [title, normalised] of iosNormaliseCases()) {
      expect(normaliseEventTitle(title), title).toBe(normalised);
    }
  });
});
