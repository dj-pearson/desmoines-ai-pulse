/**
 * SEO-036: the event hubs' heading, first sentence and top picks
 * (src/lib/eventHubSummary.ts).
 */
import { describe, expect, it } from "vitest";
import {
  eventCountPhrase,
  formatCentralDay,
  freePhrase,
  hubSummary,
  hubTopPicks,
  todayHeadline,
  weekendHeadline,
  HUB_PICK_COUNT,
} from "@/lib/eventHubSummary";
import { formatDateRange, formatWeekendRange, pickTopEvents, weekendWindow, type WeekendEventRow } from "@/lib/weekendArticle";

let n = 0;
function row(over: Partial<WeekendEventRow>): WeekendEventRow {
  n += 1;
  return {
    id: `id-${n}`,
    title: `Event ${n}`,
    date: "2026-10-03T00:30:00+00:00",
    event_start_utc: "2026-10-03T00:30:00+00:00",
    venue: `Venue ${n}`,
    category: "Music",
    price: "See website",
    is_featured: false,
    popularity_score: 0,
    ...over,
  };
}

describe("counts", () => {
  it("pluralises and marks the fetch cap", () => {
    expect(eventCountPhrase(1)).toBe("1 event");
    expect(eventCountPhrase(42)).toBe("42 events");
    expect(eventCountPhrase(1059)).toBe("1,059 events");
    expect(eventCountPhrase(499, 500)).toBe("499 events");
    expect(eventCountPhrase(500, 500)).toBe("500+ events");
  });

  it("never prints 0 free as if it were a finding about prices", () => {
    expect(freePhrase(0)).toBe("none listed as free");
    expect(freePhrase(3)).toBe("3 free");
  });
});

describe("weekendHeadline", () => {
  const window = { startDay: "2026-10-02", endDay: "2026-10-04" };

  it("states the dates and the counts", () => {
    expect(weekendHeadline(window, { total: 42, free: 3 })).toEqual({
      heading: "This weekend in Des Moines: October 2-4, 2026",
      summary: "42 events on our calendar from Friday through Sunday, 3 free.",
    });
  });

  it("prints the weekend exactly as the weekly article's title does", () => {
    const w = weekendWindow(new Date("2026-10-01T15:00:00Z"));
    expect(weekendHeadline({ startDay: w.friday, endDay: w.sunday }, { total: 1, free: 0 }).heading).toBe(
      `This weekend in Des Moines: ${formatWeekendRange(w)}`
    );
  });

  it("spans months and years", () => {
    expect(weekendHeadline({ startDay: "2026-10-30", endDay: "2026-11-01" }, { total: 2, free: 0 }).heading).toBe(
      "This weekend in Des Moines: October 30 - November 1, 2026"
    );
    expect(formatDateRange("2027-12-31", "2028-01-02")).toBe("December 31, 2027 - January 2, 2028");
    expect(formatDateRange("2026-10-02", "2026-10-02")).toBe("October 2, 2026");
  });

  it("caps and empties honestly", () => {
    expect(weekendHeadline(window, { total: 500, free: 0, cap: 500 }).summary).toBe(
      "500+ events on our calendar from Friday through Sunday, none listed as free."
    );
    expect(weekendHeadline(window, { total: 0, free: 0 }).summary).toBe(
      "No events on our calendar from Friday through Sunday yet."
    );
  });
});

describe("todayHeadline", () => {
  it("names the date rather than saying today", () => {
    const h = todayHeadline("2026-10-01", { total: 26, free: 0 });
    expect(h.heading).toBe("Events in Des Moines: Thursday, October 1, 2026");
    expect(h.summary).toBe("26 events on our calendar for October 1, none listed as free.");
    expect(`${h.heading} ${h.summary}`).not.toMatch(/\btoday\b/i);
  });

  it("is the Central date whatever zone runs it", () => {
    expect(formatCentralDay("2026-12-31")).toBe("Thursday, December 31, 2026");
    expect(formatCentralDay("2026-03-08")).toBe("Sunday, March 8, 2026");
  });

  it("handles one event and none", () => {
    expect(todayHeadline("2026-10-01", { total: 1, free: 1 }).summary).toBe(
      "1 event on our calendar for October 1, 1 free."
    );
    expect(todayHeadline("2026-10-01", { total: 0, free: 0 }).summary).toBe(
      "No events on our calendar for October 1 yet."
    );
  });
});

describe("hubSummary", () => {
  it("gives the range from the first to the last upcoming date", () => {
    expect(hubSummary("2026-10-01", "2027-03-14", { total: 318, free: 12 })).toBe(
      "318 upcoming events from October 1, 2026 to March 14, 2027, 12 free."
    );
  });

  it("drops the end of the range when it is unknown or the same day", () => {
    expect(hubSummary("2026-10-01", null, { total: 1, free: 0 })).toBe(
      "1 upcoming event from October 1, 2026, none listed as free."
    );
    expect(hubSummary("2026-10-01", "2026-10-01", { total: 2, free: 0 })).toBe(
      "2 upcoming events from October 1, 2026, none listed as free."
    );
  });

  it("says so when there is nothing", () => {
    expect(hubSummary("2026-10-01", null, { total: 0, free: 0 })).toBe(
      "No upcoming events on our calendar from October 1, 2026."
    );
  });
});

describe("hubTopPicks", () => {
  const today = "2026-10-02";

  it("uses the weekly article's rule and order", () => {
    const rows = [
      row({ title: "Bar trivia night", is_featured: true }),
      row({ title: "Small gig" }),
      row({ title: "Arena show", venue: "Wells Fargo Arena" }),
      row({ title: "Featured fair", is_featured: true }),
      row({ title: "Pumpkin day", category: "Family" }),
    ];
    const picks = hubTopPicks(rows, today);
    expect(picks.map((p) => p.title)).toEqual(["Featured fair", "Arena show", "Pumpkin day", "Small gig"]);
    expect(picks).toEqual(pickTopEvents(rows, { count: HUB_PICK_COUNT }));
  });

  it("stops at the count", () => {
    // Distinct categories: the rule allows three per category.
    const rows = Array.from({ length: 12 }, (_, i) => row({ category: `Category ${i}` }));
    expect(hubTopPicks(rows, today)).toHaveLength(HUB_PICK_COUNT);
    expect(hubTopPicks(rows, today, 2)).toHaveLength(2);
  });

  it("leaves out what is over, but keeps a run that is still on", () => {
    const over = row({ title: "Yesterday", is_featured: true, date: "2026-10-01T23:00:00Z", event_start_utc: "2026-10-01T23:00:00Z" });
    const run = row({
      title: "Long run",
      is_featured: true,
      date: "2026-09-25T15:00:00Z",
      event_start_utc: "2026-09-25T15:00:00Z",
      end_date: "2026-10-04T23:00:00Z",
    });
    const titles = hubTopPicks([over, run], today).map((p) => p.title);
    expect(titles).toEqual(["Long run"]);
  });

  it("lists one show once", () => {
    const a = row({ title: "Clint Black", venue: "Hoyt Sherman Place" });
    const b = row({ title: "Clint Black: Back On The Blacktop Tour", venue: "Hoyt Sherman Place" });
    expect(hubTopPicks([a, b], today)).toHaveLength(1);
  });

  it("is empty for no rows", () => {
    expect(hubTopPicks([], today)).toEqual([]);
  });
});
