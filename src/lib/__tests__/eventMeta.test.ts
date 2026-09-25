// The prerender runs in UTC on the build host, and that is where the showtime
// bug lived. Node re-reads TZ when it changes, so setting it before any Date
// work puts this file in the prerender's zone. The first test proves it took.
process.env.TZ = "UTC";

import { describe, it, expect } from "vitest";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  eventImageAlt,
  eventKeywords,
  isStaleEvent,
  eventMetaDescription,
  eventPageTitle,
  eventSummary,
  EVENT_DESCRIPTION_BUDGET,
  EVENT_TITLE_BUDGET,
} from "@/lib/eventMeta";
import type { Event } from "@/lib/types";

/** A 7:00 PM CDT show on Sunday 2026-09-27, stored the way the table stores it. */
const base: Event = {
  id: "e1",
  title: "Jazz in the Gardens",
  date: "2026-09-28T00:00:00+00:00",
  event_start_utc: "2026-09-28T00:00:00+00:00",
  // TIMESTAMP WITHOUT TIME ZONE: PostgREST returns it with no offset.
  event_start_local: "2026-09-27T19:00:00",
  location: "909 Robert D. Ray Dr",
  venue: "Greater Des Moines Botanical Garden",
  city: "Des Moines",
  category: "Music",
  price: "$15",
  enhanced_description:
    "An evening of live jazz among the gardens, with food trucks and a cash bar on the lawn. Bring a blanket or a lawn chair.",
};

const ev = (over: Partial<Event> = {}): Event => ({ ...base, ...over });
const BEFORE = new Date("2026-09-20T12:00:00Z");
const AFTER = new Date("2026-10-01T12:00:00Z");

describe("the showtime is Central in a UTC runtime", () => {
  it("runs in UTC, so the old behaviour would reproduce here", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
    // The control: formatting the offset-less local column, which the old
    // title did, gives 2:00 PM for a 7:00 PM show in this runtime.
    const old = formatInTimeZone(parseISO(base.event_start_local!), "America/Chicago", "h:mm a");
    expect(old).toBe("2:00 PM");
  });

  it("puts 7:00 PM in the description and summary, not 2:00 PM", () => {
    expect(eventMetaDescription(ev())).toContain("7:00 PM");
    expect(eventMetaDescription(ev())).not.toContain("2:00 PM");
    expect(eventSummary(ev(), BEFORE)).toContain("at 7:00 PM Central");
  });

  it("dates it Sunday the 27th, the Central day, not the UTC day", () => {
    expect(eventPageTitle(ev())).toContain("Sun, Sep 27");
    expect(eventSummary(ev(), BEFORE)).toContain("Sunday, September 27, 2026");
  });

  it("drops the time rather than printing a placeholder when none was announced", () => {
    const tbd = ev({ time_tbd: true });
    expect(eventSummary(tbd, BEFORE)).not.toMatch(/\d:\d\d [AP]M/);
    expect(eventMetaDescription(tbd)).not.toMatch(/\d:\d\d [AP]M/);
  });
});

describe("eventPageTitle", () => {
  it("leads with the name and date and keeps venue and city when they fit", () => {
    const t = eventPageTitle(ev({ title: "Trivia Night", venue: "Mickey's Irish Pub", city: "Waukee" }));
    expect(t).toBe("Trivia Night - Sun, Sep 27 | Mickey's Irish Pub, Waukee");
    expect(t.length).toBeLessThanOrEqual(EVENT_TITLE_BUDGET);
  });

  it("drops the city before the venue, and the venue before the date", () => {
    expect(eventPageTitle(ev())).toBe("Jazz in the Gardens - Sun, Sep 27 | Des Moines");
    const long = ev({ title: "An Evening With a Long Touring Show Name" });
    expect(eventPageTitle(long)).toBe("An Evening With a Long Touring Show Name - Sun, Sep 27");
  });

  it("clips an overlong name but keeps the date", () => {
    const t = eventPageTitle(ev({ title: "The Annual Greater Des Moines Metro Fall Harvest Festival and Craft Fair Weekend" }));
    expect(t.length).toBeLessThanOrEqual(EVENT_TITLE_BUDGET);
    expect(t.endsWith("... - Sun, Sep 27")).toBe(true);
  });

  it("does not repeat a city the venue name already carries", () => {
    const t = eventPageTitle(ev({ title: "Brunch", venue: "Des Moines Social Club", city: "Des Moines" }));
    expect(t).toBe("Brunch - Sun, Sep 27 | Des Moines Social Club");
  });

  it("carries no brand suffix", () => {
    expect(eventPageTitle(ev())).not.toMatch(/Insider|Events$/);
  });
});

describe("eventMetaDescription", () => {
  it("names the row's city, never the brand city", () => {
    const d = eventMetaDescription(ev({ venue: "Mickey's Irish Pub", city: "Waukee" }));
    expect(d).toContain("in Waukee, Iowa");
    expect(d).not.toContain("Des Moines, Iowa");
  });

  it("says 'the Des Moines area' when the row has no city, rather than inventing one", () => {
    expect(eventMetaDescription(ev({ city: null }))).toContain("in the Des Moines area");
  });

  it("does not call an unreadable price free", () => {
    const d = eventMetaDescription(ev({ price: "See website" }));
    expect(d).not.toMatch(/free/i);
    expect(d).not.toContain("Tickets");
  });

  it("states a readable price, a range and a free event correctly", () => {
    expect(eventMetaDescription(ev({ price: "$15" }))).toContain("Tickets $15.");
    expect(eventMetaDescription(ev({ price: "$54.40-$89.40" }))).toContain("Tickets $54.40-$89.40.");
    expect(eventMetaDescription(ev({ price: "Free" }))).toContain("Free admission.");
  });

  it("stays inside the budget and cuts the description on a word", () => {
    const d = eventMetaDescription(ev());
    expect(d.length).toBeLessThanOrEqual(EVENT_DESCRIPTION_BUDGET);
    expect(d.startsWith("Sunday, September 27, 2026 at 7:00 PM, at Greater Des Moines Botanical Garden in Des Moines, Iowa. Tickets $15.")).toBe(true);
    expect(d).toMatch(/\w\.\.\.$|\.$/);
  });
});

describe("eventSummary", () => {
  it("answers what, when, where and price in two sentences", () => {
    expect(eventSummary(ev(), BEFORE)).toBe(
      "Jazz in the Gardens takes place on Sunday, September 27, 2026 at 7:00 PM Central at Greater Des Moines Botanical Garden in Des Moines, Iowa. Tickets are $15.",
    );
  });

  it("switches to the past tense and drops the price once the event is over", () => {
    const s = eventSummary(ev(), AFTER);
    expect(s).toContain("took place");
    expect(s).not.toContain("Tickets");
  });

  it("points at the official page when the price is unreadable, and says nothing when there is none", () => {
    expect(eventSummary(ev({ price: "Varies", source_url: "https://example.com/e" }), BEFORE)).toContain(
      "Ticket prices are listed on the official event page.",
    );
    const bare = eventSummary(ev({ price: "Varies", source_url: undefined }), BEFORE);
    expect(bare.endsWith("Des Moines, Iowa.")).toBe(true);
  });

  // events-pass2 WP4 item 4: tense follows the end, not the start.
  it("says 'is on now' while the show is running, and keeps the price", () => {
    // 7:00 PM CDT start, viewed at 8:00 PM CDT: inside the three-hour default.
    const s = eventSummary(ev(), new Date("2026-09-28T01:00:00Z"));
    expect(s).toContain("is on now");
    expect(s).not.toContain("took place");
    expect(s).toContain("Tickets are $15.");
  });

  it("day 2 of a three-day festival is on now, not over", () => {
    const fest = ev({ end_date: "2026-09-30T03:00:00+00:00" });
    const s = eventSummary(fest, new Date("2026-09-28T18:00:00Z"));
    expect(s).toContain("is on now");
    expect(s).toContain("Tickets are $15.");
  });

  it("says 'took place' only once the end has passed", () => {
    const fest = ev({ end_date: "2026-09-30T03:00:00+00:00" });
    expect(eventSummary(fest, new Date("2026-09-30T02:00:00Z"))).toContain("is on now");
    expect(eventSummary(fest, new Date("2026-09-30T04:00:00Z"))).toContain("took place");
  });
});

describe("isStaleEvent measures from the end (events-pass2 WP4 item 12)", () => {
  // A 60-day exhibit: opens Tue Sep 1, closes Fri Oct 30.
  const exhibit = ev({
    date: "2026-09-01T15:00:00+00:00",
    event_start_utc: "2026-09-01T15:00:00+00:00",
    event_start_local: "2026-09-01T10:00:00",
    end_date: "2026-10-30T22:00:00+00:00",
  });

  it("keeps a 60-day exhibit indexable on day 45", () => {
    expect(isStaleEvent(exhibit, new Date("2026-10-16T12:00:00Z"))).toBe(false);
  });

  it("still indexable 29 days after it closes, stale after 31", () => {
    expect(isStaleEvent(exhibit, new Date("2026-11-28T12:00:00Z"))).toBe(false);
    expect(isStaleEvent(exhibit, new Date("2026-12-01T12:00:00Z"))).toBe(true);
  });

  it("with no end_date, counts from start plus the default run", () => {
    expect(isStaleEvent(ev(), new Date("2026-10-27T12:00:00Z"))).toBe(false);
    expect(isStaleEvent(ev(), new Date("2026-10-29T12:00:00Z"))).toBe(true);
  });
});

describe("eventKeywords and eventImageAlt (events-pass2 WP4 item 9)", () => {
  it("carries no relative words", () => {
    const words = eventKeywords(ev()).join(" | ").toLowerCase();
    expect(words).not.toContain("tonight");
    expect(words).not.toContain("this weekend");
  });

  it("does not throw on a null category, and names none", () => {
    const row = ev({ category: null as unknown as string });
    expect(() => eventKeywords(row)).not.toThrow();
    expect(eventKeywords(row).join(" ")).not.toContain("null");
    expect(eventImageAlt(row)).toBe("Jazz in the Gardens - event in Des Moines");
  });

  it("uses the row's city and category when present, and no city when absent", () => {
    expect(eventImageAlt(ev({ city: "Waukee" }))).toBe("Jazz in the Gardens - Music event in Waukee");
    expect(eventImageAlt(ev({ city: null }))).toBe("Jazz in the Gardens - Music event");
  });
});
