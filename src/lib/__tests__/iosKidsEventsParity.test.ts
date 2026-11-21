import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KIDS_EVENTS_FILTER } from "@/hooks/useEventLanding";

/**
 * IOS-AUDIT-005. /events/kids on the web lists events matching
 * KIDS_EVENTS_FILTER (word matches on title, category and
 * enhanced_description). iOS used to open Search for the text "kids events",
 * which full-text search reads as the keyword "kids", so a family storytime
 * or a children's show with no "kids" in its text was missing.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const EVENTS_SERVICE = "ios/DesMoinesInsider/Services/EventsService.swift";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";
const SEARCH_VM = "ios/DesMoinesInsider/ViewModels/SearchViewModel.swift";

/** `static let kidsEventsFilter = [ #"..."#, ... ].joined(separator: ",")` */
function iosKidsFilter(): string {
  const src = readFileSync(EVENTS_SERVICE, "utf8");
  const block = src.match(/static let kidsEventsFilter = \[([\s\S]*?)\]\.joined\(separator: ","\)/);
  expect(block, `kidsEventsFilter literal not found in ${EVENTS_SERVICE}`).not.toBeNull();
  const parts = [...block![1].matchAll(/#"(.*)"#,?\s*$/gm)].map((m) => m[1]);
  expect(parts.length, "no raw-string arms parsed from kidsEventsFilter").toBeGreaterThan(0);
  return parts.join(",");
}

describe("iOS /events/kids matches the web's kids rule (IOS-AUDIT-005)", () => {
  it("EventsService.kidsEventsFilter is KIDS_EVENTS_FILTER byte for byte", () => {
    expect(iosKidsFilter()).toBe(KIDS_EVENTS_FILTER);
  });

  it("EventsService sends the filter as an or-group when kidsOnly is set", () => {
    const src = readFileSync(EVENTS_SERVICE, "utf8");
    expect(src).toMatch(/if query\.kidsOnly \{\s*orGroups\.append\(Self\.kidsEventsFilter\)\s*\}/);
  });

  it("Search passes the kids filter through to the events query", () => {
    expect(readFileSync(SEARCH_VM, "utf8")).toMatch(/kidsOnly: f\.kidsOnly,/);
  });

  it("/events/kids opens Search with kidsOnly, not the text \"kids events\"", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toMatch(/case "kids": return kidsDestination\b/);
    expect(src).not.toMatch(/\.search\(query: "kids events"\)/);
    const fn = src.slice(src.indexOf("static var kidsDestination: Destination {"));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(/filters\.kidsOnly = true/);
    expect(body).toMatch(/return \.eventSearch\(query: "", filters: filters\)/);
  });
});
