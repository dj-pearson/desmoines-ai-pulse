/**
 * SEO-035: the weekend window and the selection rule behind the weekly
 * "This Weekend in Des Moines" article (src/lib/weekendArticle.ts).
 */
import { describe, expect, it } from "vitest";
import {
  buildWeekendArticle,
  dedupeEvents,
  eventLocalDate,
  eventSlug,
  formatWeekendRange,
  hasRealStartTime,
  isFree,
  isPublicEvent,
  pickTier,
  pickTopEvents,
  selectWeekendEvents,
  titleKey,
  weekendArticleSlug,
  weekendWindow,
  WEEKEND_ARTICLE_SLUG_PREFIX,
  type WeekendEventRow,
} from "@/lib/weekendArticle";
import { createEventSlugWithCentralTime } from "@/lib/timezone";

let n = 0;
function row(over: Partial<WeekendEventRow>): WeekendEventRow {
  n += 1;
  return {
    id: `id-${n}`,
    title: `Event ${n}`,
    date: "2026-10-03T00:30:00+00:00",
    event_start_utc: "2026-10-03T00:30:00+00:00",
    venue: "Somewhere",
    category: "Music",
    price: "See website",
    is_featured: false,
    is_hidden: false,
    is_merged: false,
    archived_at: null,
    popularity_score: 0,
    ...over,
  };
}

describe("weekendWindow", () => {
  it("on a Thursday, is the coming Friday-Sunday in Central time", () => {
    // Thursday Oct 1 2026, 6 am CDT - when the Action runs.
    const w = weekendWindow(new Date("2026-10-01T11:00:00Z"));
    expect([w.friday, w.saturday, w.sunday]).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(w.startUtc).toBe("2026-10-02T05:00:00.000Z"); // Fri 00:00 CDT
    expect(w.endUtc).toBe("2026-10-05T05:00:00.000Z"); // Mon 00:00 CDT, exclusive
  });

  it("uses the Central date, not the UTC date, late on a Thursday evening", () => {
    // 2026-10-02T03:00Z is still Thursday 10 pm in Des Moines.
    expect(weekendWindow(new Date("2026-10-02T03:00:00Z")).friday).toBe("2026-10-02");
  });

  it("on Saturday and Sunday, is the weekend in progress (matches the hub)", () => {
    expect(weekendWindow(new Date("2026-10-03T17:00:00Z")).friday).toBe("2026-10-02");
    expect(weekendWindow(new Date("2026-10-04T17:00:00Z")).friday).toBe("2026-10-02");
  });

  it("on Monday, moves to the next weekend", () => {
    expect(weekendWindow(new Date("2026-10-05T17:00:00Z")).friday).toBe("2026-10-09");
  });

  it("gets Monday midnight right across the November DST change", () => {
    // DST ends Sunday Nov 1 2026: Friday is CDT (-5), Monday is CST (-6).
    const w = weekendWindow(new Date("2026-10-29T17:00:00Z"));
    expect(w.friday).toBe("2026-10-30");
    expect(w.startUtc).toBe("2026-10-30T05:00:00.000Z");
    expect(w.endUtc).toBe("2026-11-02T06:00:00.000Z");
  });
});

describe("dates, slugs and titles", () => {
  it("files a 00:00 UTC row under its Central day, where it is 7 pm (SEO-055)", () => {
    const e = row({ title: "Trivia", date: "2026-10-03T00:00:00+00:00", event_start_utc: "2026-10-03T00:00:00+00:00" });
    expect(eventLocalDate(e)).toBe("2026-10-02");
    // 7 pm CDT is a real start time for most shows (SeatGeek's own URLs say so);
    // only time_tbd or the 19:31:58 marker means "no time".
    expect(hasRealStartTime(e)).toBe(true);
    expect(hasRealStartTime({ ...e, time_tbd: true })).toBe(false);
    expect(hasRealStartTime(row({ event_start_utc: "2026-10-03T00:31:58+00:00" }))).toBe(false);
  });

  it("builds the same event slug as the detail page resolves", () => {
    const samples = [
      row({ title: "Clint Black: Back On The Blacktop Tour", event_start_utc: "2026-10-03T00:30:00+00:00" }),
      row({ title: "Come From Away", event_start_utc: "2026-10-04T00:00:00+00:00" }),
      row({ title: "UIC Flames at Drake", event_start_utc: "2026-10-04T18:00:00+00:00" }),
    ];
    for (const e of samples) expect(eventSlug(e)).toBe(createEventSlugWithCentralTime(e.title, e));
  });

  it("formats the range and slug for one month, two months and two years", () => {
    const oct = weekendWindow(new Date("2026-10-01T17:00:00Z"));
    expect(formatWeekendRange(oct)).toBe("October 2-4, 2026");
    expect(weekendArticleSlug(oct)).toBe("this-weekend-in-des-moines-october-2-4-2026");
    expect(weekendArticleSlug(oct).startsWith(WEEKEND_ARTICLE_SLUG_PREFIX)).toBe(true);

    expect(formatWeekendRange(weekendWindow(new Date("2026-10-29T17:00:00Z")))).toBe("October 30 - November 1, 2026");
    expect(formatWeekendRange(weekendWindow(new Date("2027-12-30T17:00:00Z")))).toBe(
      "December 31, 2027 - January 2, 2028",
    );
  });

  it("treats a headliner and its tour name as one event", () => {
    expect(titleKey("Clint Black")).toBe(titleKey("Clint Black: Back On The Blacktop Tour"));
    expect(titleKey("Lauren Alaina")).toBe(titleKey("Lauren Alaina with Shane Profitt"));
    expect(titleKey("Reefer Madness")).toBe(titleKey("Reefer Madness - Des Moines"));
    expect(titleKey("Ringling Bros. and Barnum & Bailey presents X")).toBe(
      titleKey("Ringling Bros. and Barnum & Bailey Present Y"),
    );
    expect(titleKey("Come From Away")).not.toBe(titleKey("Come Back Home"));
  });
});

describe("visibility", () => {
  it("drops hidden, merged and unpublished (archived) rows", () => {
    expect(isPublicEvent(row({}))).toBe(true);
    expect(isPublicEvent(row({ is_hidden: true }))).toBe(false);
    expect(isPublicEvent(row({ is_merged: true }))).toBe(false);
    expect(isPublicEvent(row({ archived_at: "2026-09-30T00:00:00Z" }))).toBe(false);
  });

  it("keeps only rows whose Central date is Friday-Sunday", () => {
    const w = weekendWindow(new Date("2026-10-01T17:00:00Z"));
    const thursdayEvening = row({ title: "Thu", event_start_utc: "2026-10-02T00:00:00+00:00" }); // Oct 1, 7 pm CDT
    const fri = row({ title: "Fri", event_start_utc: "2026-10-03T00:30:00+00:00" });
    const sunNight = row({ title: "Sun", event_start_utc: "2026-10-05T00:30:00+00:00" }); // Oct 4, 7:30 pm CDT
    const monday = row({ title: "Mon", event_start_utc: "2026-10-05T17:00:00+00:00" });
    const hidden = row({ title: "Hidden", is_hidden: true });
    const got = selectWeekendEvents([thursdayEvening, fri, sunNight, monday, hidden], w).map((e) => e.title);
    expect(got.sort()).toEqual(["Fri", "Sun"]);
  });

  it("keeps a run that started before Friday and is still on (SEO-055: Ringling Bros., Pumpkin Fest)", () => {
    const w = weekendWindow(new Date("2026-10-01T17:00:00Z"));
    const ringling = row({
      title: "Ringling",
      event_start_utc: "2026-10-02T00:00:00+00:00", // Thu Oct 1, 7 pm CDT
      end_date: "2026-10-04T22:00:00+00:00", // Sun Oct 4, 5 pm CDT
    });
    const pumpkinFest = row({
      title: "Pumpkin Fest",
      event_start_utc: "2026-10-01T14:00:00+00:00",
      end_date: "2026-11-06T23:00:00+00:00",
    });
    const endedThursday = row({
      title: "Ended",
      event_start_utc: "2026-09-25T14:00:00+00:00",
      end_date: "2026-10-01T23:00:00+00:00", // Oct 1 Central
    });
    const startsMonday = row({
      title: "Later",
      event_start_utc: "2026-10-05T14:00:00+00:00",
      end_date: "2026-10-09T23:00:00+00:00",
    });
    const got = selectWeekendEvents([ringling, pumpkinFest, endedThursday, startsMonday], w).map((e) => e.title);
    expect(got.sort()).toEqual(["Pumpkin Fest", "Ringling"]);
  });
});

describe("selection rule", () => {
  it("ranks featured, then major venue, then festival/family, then the rest", () => {
    expect(pickTier(row({ is_featured: true, venue: "A bar" }))).toBe(0);
    expect(pickTier(row({ venue: "Hoyt Sherman Place" }))).toBe(1);
    expect(pickTier(row({ venue: "Wells Fargo Arena" }))).toBe(1);
    expect(pickTier(row({ category: "Family", venue: "A park" }))).toBe(2);
    expect(pickTier(row({ category: "Festival", venue: "A park" }))).toBe(2);
    expect(pickTier(row({ category: "Music", venue: "A bar" }))).toBe(3);
  });

  it("orders picks by tier, then popularity; skips regulars and online events; one per venue, three per category", () => {
    const featured = row({ title: "Featured Thing", is_featured: true, venue: "Small Bar" });
    const arenaA = row({ title: "Arena Show A", venue: "Wells Fargo Arena", popularity_score: 1 });
    const arenaB = row({ title: "Arena Show B", venue: "Wells Fargo Arena", popularity_score: 9 });
    const hoyt = row({ title: "Hoyt Show", venue: "Hoyt Sherman Place", popularity_score: 5 });
    const fest = row({ title: "Fall Fest", category: "Festival", venue: "A Park" });
    const trivia = row({ title: "Trivia Night", venue: "Civic Center" });
    const online = row({ title: "Webinar", venue: "Virtual via Zoom", is_featured: true });
    const plain = row({ title: "Plain", venue: "Another Bar", category: "Comedy" });
    const fourthMusic = row({ title: "Fourth Music", venue: "Third Bar", popularity_score: 99 });
    const picks = pickTopEvents([fourthMusic, plain, trivia, fest, hoyt, arenaA, arenaB, online, featured], { count: 5 });
    expect(picks.map((p) => p.title)).toEqual(["Featured Thing", "Arena Show B", "Hoyt Show", "Fall Fest", "Plain"]);
  });

  it("keeps one listing per show and prefers the one with a start time", () => {
    const dateOnly = row({
      title: "Reefer Madness",
      venue: "Stoner Theater",
      event_start_utc: "2026-10-03T00:00:00+00:00",
      time_tbd: true,
    });
    const timed = row({
      title: "Reefer Madness - Des Moines",
      venue: "Stoner Theater at Des Moines Performing Arts",
      event_start_utc: "2026-10-03T00:30:00+00:00",
    });
    const kept = dedupeEvents([dateOnly, timed]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Reefer Madness - Des Moines");
  });

  it("calls an event free only when its price says free", () => {
    expect(isFree(row({ price: "Free" }))).toBe(true);
    expect(isFree(row({ price: "$0" }))).toBe(true);
    expect(isFree(row({ price: "Free for kids" }))).toBe(false);
    expect(isFree(row({ price: "See website" }))).toBe(false);
    expect(isFree(row({ price: "$5" }))).toBe(false);
  });
});

describe("buildWeekendArticle", () => {
  const w = weekendWindow(new Date("2026-10-01T17:00:00Z"));
  const rows = [
    row({ title: "Big Concert", venue: "Hoyt Sherman Place", price: "$45", popularity_score: 3 }),
    row({ title: "Free Park Day", venue: "Gray's Lake", price: "Free", event_start_utc: "2026-10-03T15:00:00+00:00" }),
    row({ title: "Trivia Thursday", venue: "A Pub" }),
    row({ title: "Secret Hidden Thing", venue: "Hoyt Sherman Place", is_hidden: true }),
    row({
      title: "Pumpkin Fest",
      venue: "Center Grove Orchard",
      event_start_utc: "2026-10-02T00:00:00+00:00",
      end_date: "2026-11-06T23:00:00+00:00",
      time_tbd: true,
    }),
    row({ title: "Gate Night", venue: "A Barn", event_start_utc: "2026-10-03T00:31:58+00:00" }),
  ];
  const a = buildWeekendArticle(rows, w, "2026-10-01");

  it("is titled and slugged by the weekend's dates", () => {
    expect(a.title).toBe("This Weekend in Des Moines: October 2-4, 2026");
    expect(a.slug).toBe("this-weekend-in-des-moines-october-2-4-2026");
  });

  it("links every event to its page and links the hub", () => {
    expect(a.content).toContain("[Big Concert](/events/big-concert-2026-10-02)");
    expect(a.content).toContain("](/events/this-weekend)");
    expect(a.content).toContain("](/events/october-2026)");
  });

  it("prints only row fields: venue, price, real times; never a hidden event", () => {
    expect(a.content).toContain("Hoyt Sherman Place - $45");
    expect(a.content).toContain("[Free Park Day](/events/free-park-day-2026-10-03) - Saturday, October 3, 10 am - Gray's Lake - Free");
    expect(a.content).not.toContain("Secret Hidden Thing");
    expect(a.content).not.toContain("See website - ");
  });

  it("counts the regular separately instead of listing it", () => {
    expect(a.counts).toMatchObject({ total: 5, listed: 4, regulars: 1, free: 1, runs: 1 });
    expect(a.content).not.toContain("[Trivia Thursday]");
    expect(a.content).toContain("Plus 1 weekly regular");
  });

  it("lists a run once, with its dates and no time, under its own heading", () => {
    expect(a.content).toContain("## Running this weekend");
    expect(a.content).toContain(
      "- [Pumpkin Fest](/events/pumpkin-fest-2026-10-01) - October 1 - November 6 - Center Grove Orchard",
    );
    expect(a.counts.byDay["2026-10-02"]).toBe(2); // Big Concert + Gate Night, not the run
  });

  it("prints the date only for a row stamped with the no-time marker", () => {
    expect(a.content).toMatch(/- \[Gate Night\]\(\/events\/gate-night-2026-10-02\) - A Barn( \(top pick\))?\n/);
  });

  it("states the pick rule in the article", () => {
    expect(a.content).toContain("## How we picked");
  });
});
