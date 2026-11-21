import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DATE_NIGHT_FILTER } from "@/hooks/useEventLanding";
import { EVENING_START_HOUR, NIGHT_END_HOUR } from "@/lib/tonightPairings";

/**
 * IOS-AUDIT-008. /events/date-night on the web lists events matching
 * DATE_NIGHT_FILTER over a fixed Central window of WINDOW_DAYS, evening
 * starts only unless ?time=all. iOS opened that page in a web sheet; it now
 * opens Search on Events with the same rule, so the rule is copied into Swift.
 *
 * Swift cannot import TypeScript and there is no compiler in cloud sessions,
 * so this reads the Swift source. It parses only the shapes written today; if
 * either side is rewritten the parse finds nothing and the test fails.
 */

const EVENTS_SERVICE = "ios/DesMoinesInsider/Services/EventsService.swift";
const EVENT_MODEL = "ios/DesMoinesInsider/Models/Event.swift";
const DEEP_LINK = "ios/DesMoinesInsider/Services/DeepLinkHandler.swift";
const SEARCH_VM = "ios/DesMoinesInsider/ViewModels/SearchViewModel.swift";
const WEB_PAGE = "src/pages/DateNightEvents.tsx";

/** `static let dateNightEventsFilter = [ #"..."#, ... ].joined(separator: ",")` */
function iosDateNightFilter(): string {
  const src = readFileSync(EVENTS_SERVICE, "utf8");
  const block = src.match(/static let dateNightEventsFilter = \[([\s\S]*?)\]\.joined\(separator: ","\)/);
  expect(block, `dateNightEventsFilter literal not found in ${EVENTS_SERVICE}`).not.toBeNull();
  const parts = [...block![1].matchAll(/#"(.*)"#,?\s*$/gm)].map((m) => m[1]);
  expect(parts.length, "no raw-string arms parsed from dateNightEventsFilter").toBeGreaterThan(0);
  return parts.join(",");
}

function swiftInt(file: string, name: string): number {
  const m = readFileSync(file, "utf8").match(new RegExp(`static let ${name} = (\\d+)\\b`));
  expect(m, `${name} not found in ${file}`).not.toBeNull();
  return Number(m![1]);
}

describe("iOS /events/date-night matches the web's date night rule (IOS-AUDIT-008)", () => {
  it("EventsService.dateNightEventsFilter is DATE_NIGHT_FILTER byte for byte", () => {
    expect(iosDateNightFilter()).toBe(DATE_NIGHT_FILTER);
  });

  it("the window is the web page's WINDOW_DAYS", () => {
    const web = readFileSync(WEB_PAGE, "utf8").match(/const WINDOW_DAYS = (\d+);/);
    expect(web, `WINDOW_DAYS not found in ${WEB_PAGE}`).not.toBeNull();
    expect(swiftInt(EVENTS_SERVICE, "dateNightWindowDays")).toBe(Number(web![1]));
  });

  it("evening is the web's EVENING_START_HOUR to NIGHT_END_HOUR", () => {
    expect(swiftInt(EVENT_MODEL, "eveningStartHour")).toBe(EVENING_START_HOUR);
    expect(swiftInt(EVENT_MODEL, "nightEndHour")).toBe(NIGHT_END_HOUR);
  });

  it("EventsService sends the filter as an or-group and Search passes it through", () => {
    expect(readFileSync(EVENTS_SERVICE, "utf8")).toMatch(
      /if query\.dateNightOnly \{\s*orGroups\.append\(Self\.dateNightEventsFilter\)\s*\}/,
    );
    const vm = readFileSync(SEARCH_VM, "utf8");
    expect(vm).toMatch(/dateNightOnly: f\.dateNight != nil,/);
    expect(vm).toMatch(/events\.filter\(\\\.startsInTheEvening\)/);
  });

  it("/events/date-night opens Search with the date night filter, not the web page", () => {
    const src = readFileSync(DEEP_LINK, "utf8");
    expect(src).toMatch(/case "date-night": return dateNightDestination\(url: url\)/);
    expect(src).not.toMatch(/case "date-night": return \.web\(url\)/);
    const fn = src.slice(src.indexOf("static func dateNightDestination(url: URL) -> Destination {"));
    const body = fn.slice(0, fn.indexOf("\n    }\n"));
    expect(body).toMatch(/filters\.dateNight = time == "all" \? DateNightTimes\.anyTime : DateNightTimes\.evening/);
    expect(body).toMatch(/return \.eventSearch\(query: "", filters: filters\)/);
  });
});
