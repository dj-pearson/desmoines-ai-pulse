import { describe, expect, it } from "vitest";
import { WEATHER_UNAVAILABLE, type WeatherSnapshot } from "@/hooks/useWeather";
import {
  PAIR_MAX_MILES,
  applyFrozenOrder,
  buildTonightPairings,
  centralDayWindow,
  formatTonightDate,
  isEveningDinner,
  pickDinner,
  tonightQueryBounds,
  tonightWindow,
  truncateName,
  eventIsIndoor,
  eventStartInstant,
  formatMiles,
  isOpenForDinner,
  restaurantBoxes,
  selectTonightEvents,
  type TonightEvent,
  type TonightRestaurant,
} from "@/lib/tonightPairings";

// Thursday 2026-09-24, 15:30 CDT (UTC-5).
const NOW = new Date("2026-09-24T20:30:00Z");

const NICE: WeatherSnapshot = {
  ...WEATHER_UNAVAILABLE,
  available: true,
  outdoorFriendly: true,
};
const NASTY: WeatherSnapshot = { ...NICE, outdoorFriendly: false };

// Downtown Des Moines venues.
const CIVIC = { latitude: 41.5875, longitude: -93.6235 };
const EAST_VILLAGE = { latitude: 41.5905, longitude: -93.6105 };
const WAUKEE = { latitude: 41.6117, longitude: -93.8855 };

function event(id: string, utc: string, extra: Partial<TonightEvent> = {}): TonightEvent {
  return {
    id,
    title: `Event ${id}`,
    date: utc,
    event_start_utc: utc,
    venue: "Somewhere",
    ...CIVIC,
    ...extra,
  };
}

function restaurant(id: string, extra: Partial<TonightRestaurant> = {}): TonightRestaurant {
  return {
    id,
    name: `Restaurant ${id}`,
    slug: `restaurant-${id}`,
    opening: "Daily 11am-10pm",
    status: "active",
    ...CIVIC,
    ...extra,
  };
}

describe("centralDayWindow", () => {
  it("bounds on the Central calendar day, not UTC", () => {
    // 03:00Z on the 25th is still 22:00 CDT on the 24th.
    const w = centralDayWindow(new Date("2026-09-25T03:00:00Z"));
    expect(w.dateKey).toBe("2026-09-24");
    expect(w.startISO).toBe("2026-09-24T05:00:00.000Z");
    expect(w.endISO).toBe("2026-09-25T05:00:00.000Z");
  });
});

describe("eventStartInstant", () => {
  it("returns null for the no-time sentinel and for time_tbd", () => {
    expect(eventStartInstant(event("a", "2026-09-25T00:31:58Z", { event_start_local: "2026-09-24T19:31:58" }))).toBeNull();
    expect(eventStartInstant(event("b", "2026-09-25T00:30:00Z", { time_tbd: true }))).toBeNull();
    expect(eventStartInstant(event("c", "2026-09-25T00:30:00Z"))?.toISOString()).toBe("2026-09-25T00:30:00.000Z");
  });
});

describe("selectTonightEvents", () => {
  it("keeps tonight's events from now on, in start order", () => {
    const rows = [
      event("late", "2026-09-25T02:00:00Z"),
      event("started", "2026-09-24T19:00:00Z"),
      event("early", "2026-09-24T23:30:00Z"),
      event("tomorrow", "2026-09-25T15:00:00Z"),
      event("yesterday", "2026-09-24T03:00:00Z"),
    ];
    const ids = selectTonightEvents(rows, NOW, WEATHER_UNAVAILABLE).map((e) => e.id);
    expect(ids).toEqual(["early", "late"]);
  });

  it("puts no-time events after timed ones", () => {
    const rows = [
      event("notime", "2026-09-25T00:31:58Z", { event_start_local: "2026-09-24T19:31:58" }),
      event("timed", "2026-09-25T01:00:00Z"),
    ];
    expect(selectTonightEvents(rows, NOW, WEATHER_UNAVAILABLE).map((e) => e.id)).toEqual(["timed", "notime"]);
  });

  it("orders outdoor first on a nice evening and indoor first on a bad one", () => {
    const rows = [
      event("theater", "2026-09-24T23:00:00Z", { title: "Hamilton", venue: "Des Moines Civic Center" }),
      event("unknown", "2026-09-24T23:30:00Z", { title: "Something" }),
      event("garden", "2026-09-25T00:00:00Z", { title: "Jazz in the Gardens" }),
    ];
    expect(selectTonightEvents(rows, NOW, NICE).map((e) => e.id)).toEqual(["garden", "unknown", "theater"]);
    expect(selectTonightEvents(rows, NOW, NASTY).map((e) => e.id)).toEqual(["theater", "unknown", "garden"]);
    expect(selectTonightEvents(rows, NOW, WEATHER_UNAVAILABLE).map((e) => e.id)).toEqual(["theater", "unknown", "garden"]);
  });

  it("drops duplicate ids", () => {
    const rows = [event("a", "2026-09-25T00:00:00Z"), event("a", "2026-09-25T00:00:00Z")];
    expect(selectTonightEvents(rows, NOW, WEATHER_UNAVAILABLE)).toHaveLength(1);
  });
});

describe("eventIsIndoor", () => {
  it("reads outdoor over indoor on a tie, and null when the text says nothing", () => {
    expect(eventIsIndoor(event("a", NOW.toISOString(), { title: "Garden party", venue: "Botanical Hall" }))).toBe(false);
    expect(eventIsIndoor(event("b", NOW.toISOString(), { title: "Trivia night", venue: "Pub" }))).toBe(true);
    expect(eventIsIndoor(event("c", NOW.toISOString(), { title: "Meetup", venue: "Room 4", category: null }))).toBeNull();
  });
});

describe("isOpenForDinner", () => {
  // 18:00 CDT Thursday.
  const dinner = new Date("2026-09-24T23:00:00Z");

  it("uses Central wall time for the hours check", () => {
    expect(isOpenForDinner(restaurant("a", { opening: "Daily 5pm-10pm" }), dinner, NOW)).not.toBeNull();
    // 18:00 CDT is 23:00 UTC; a UTC reading would call this open.
    expect(isOpenForDinner(restaurant("b", { opening: "Daily 10pm-11:59pm" }), dinner, NOW)).toBeNull();
  });

  it("returns the open result, so the card can say when it closes", () => {
    const open = isOpenForDinner(restaurant("a", { opening: "Daily 5pm-10pm" }), dinner, NOW);
    expect(open?.status).toBe("open");
    expect(open?.closesAt).toBe("10 PM");
  });

  it("refuses closing-soon, unknown hours, non-string hours and closed statuses", () => {
    expect(isOpenForDinner(restaurant("a", { opening: "Daily 11am-6:30pm" }), dinner, NOW)).toBeNull();
    expect(isOpenForDinner(restaurant("b", { opening: null }), dinner, NOW)).toBeNull();
    expect(isOpenForDinner(restaurant("c", { opening: false }), dinner, NOW)).toBeNull();
    expect(isOpenForDinner(restaurant("d", { status: "opening_soon" }), dinner, NOW)).toBeNull();
    expect(isOpenForDinner(restaurant("e", { opening_date: "2026-12-01" }), dinner, NOW)).toBeNull();
  });
});

describe("buildTonightPairings", () => {
  // 19:30 CDT, so dinner is 18:00 CDT.
  const show = event("show", "2026-09-25T00:30:00Z", { title: "Show" });

  it("picks the nearest restaurant open at event start minus 90 minutes, within 1.5 mi", () => {
    const rows = [
      restaurant("far", WAUKEE),
      restaurant("near-closed", { ...CIVIC, opening: "Daily 11am-3pm" }),
      restaurant("east", EAST_VILLAGE),
      restaurant("next-door", { latitude: 41.588, longitude: -93.624 }),
    ];
    const [pair] = buildTonightPairings([show], rows, NOW);
    expect(pair.dinner?.restaurant.id).toBe("next-door");
    expect(pair.dinner!.distanceMiles).toBeLessThanOrEqual(PAIR_MAX_MILES);
    expect(pair.dinner!.dinnerAt.toISOString()).toBe("2026-09-24T23:00:00.000Z");
  });

  it("shows the event alone when nothing pairs, never an empty rail", () => {
    const pairs = buildTonightPairings([show], [restaurant("far", WAUKEE)], NOW);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].dinner).toBeNull();
  });

  it("does not pair a no-time event with an invented dinner slot", () => {
    const notime = event("n", "2026-09-25T00:31:58Z", { event_start_local: "2026-09-24T19:31:58" });
    const [pair] = buildTonightPairings([notime], [restaurant("r")], NOW);
    expect(pair.dinner).toBeNull();
    expect(pair.startsAt).toBeNull();
  });

  it("prefers a restaurant not already used, and keeps the given order", () => {
    // Weather rank, then start time, is the order; having a dinner does not
    // jump an unpaired card (home pass-2 WP2 item 5).
    const events = [
      event("one", "2026-09-25T00:30:00Z"),
      event("waukee", "2026-09-25T00:45:00Z", WAUKEE),
      event("two", "2026-09-25T01:00:00Z"),
    ];
    const rows = [restaurant("a"), restaurant("b", { latitude: 41.589, longitude: -93.622 })];
    const pairs = buildTonightPairings(events, rows, NOW);
    expect(pairs.map((p) => p.event.id)).toEqual(["one", "waukee", "two"]);
    expect(pairs[0].dinner?.restaurant.id).toBe("a");
    expect(pairs[1].dinner).toBeNull();
    expect(pairs[2].dinner?.restaurant.id).toBe("b");
  });

  it("uses a dinner only to break a tie between cards that start together", () => {
    const events = [
      event("waukee", "2026-09-25T00:30:00Z", WAUKEE),
      event("civic", "2026-09-25T00:30:00Z"),
      event("later", "2026-09-25T01:30:00Z", WAUKEE),
    ];
    const pairs = buildTonightPairings(events, [restaurant("a")], NOW);
    expect(pairs.map((p) => p.event.id)).toEqual(["civic", "waukee", "later"]);
  });

  it("does not follow the weather-then-time order with a paired card from later", () => {
    // A nasty evening put the indoor show first even though it has no dinner.
    const indoorAlone = event("indoor", "2026-09-25T01:30:00Z", { ...WAUKEE, title: "Trivia" });
    const outdoorPaired = event("outdoor", "2026-09-25T00:30:00Z", { title: "Jazz in the Gardens" });
    const ordered = selectTonightEvents([outdoorPaired, indoorAlone], NOW, NASTY);
    const pairs = buildTonightPairings(ordered, [restaurant("a")], NOW);
    expect(pairs.map((p) => p.event.id)).toEqual(["indoor", "outdoor"]);
    expect(pairs[1].dinner?.restaurant.id).toBe("a");
  });

  it("carries the restaurant's closing time on the dinner", () => {
    const [pair] = buildTonightPairings([show], [restaurant("r", { opening: "Daily 5pm-10pm" })], NOW);
    expect(pair.dinner?.closesAt).toBe("10 PM");
  });

  it("caps the rail at five cards", () => {
    const events = Array.from({ length: 8 }, (_, i) => event(`e${i}`, `2026-09-25T0${i}:00:00Z`));
    expect(buildTonightPairings(events, [], NOW)).toHaveLength(5);
  });
});

describe("restaurantBoxes", () => {
  it("builds one box per located venue and skips unlocated ones", () => {
    const boxes = restaurantBoxes([
      event("a", NOW.toISOString()),
      event("b", NOW.toISOString()),
      event("c", NOW.toISOString(), { latitude: null, longitude: null }),
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatch(/^and\(latitude\.gte\.41\.56\d\d,latitude\.lte\.41\.60\d\d,longitude\.gte\.-93\.6\d+,longitude\.lte\.-93\.5\d+\)$/);
  });
});

describe("formatMiles", () => {
  it("never prints 0.0 mi", () => {
    expect(formatMiles(0.02)).toBe("under 0.1 mi");
    expect(formatMiles(0.34)).toBe("0.3 mi");
  });
});

// ---------------------------------------------------------------------------
// Home pass-2 WP2: the evening window. Friday 2026-09-25 is CDT (UTC-5).
// ---------------------------------------------------------------------------

const AT_0900 = new Date("2026-09-25T14:00:00Z"); // 09:00 CT Friday
const AT_1815 = new Date("2026-09-25T23:15:00Z"); // 18:15 CT Friday
const AT_2330 = new Date("2026-09-26T04:30:00Z"); // 23:30 CT Friday
const AT_0030 = new Date("2026-09-26T05:30:00Z"); // 00:30 CT Saturday

describe("tonightWindow", () => {
  it("at 09:00 CT runs from 16:00 CT to 04:00 CT tomorrow", () => {
    const w = tonightWindow(AT_0900);
    expect(w.dateKey).toBe("2026-09-25");
    expect(w.eveningStartISO).toBe("2026-09-25T21:00:00.000Z");
    expect(w.startISO).toBe("2026-09-25T21:00:00.000Z");
    expect(w.endISO).toBe("2026-09-26T09:00:00.000Z");
  });

  it("at 18:15 CT starts now", () => {
    const w = tonightWindow(AT_1815);
    expect(w.dateKey).toBe("2026-09-25");
    expect(w.startISO).toBe(AT_1815.toISOString());
    expect(w.endISO).toBe("2026-09-26T09:00:00.000Z");
  });

  it("at 23:30 CT is still today's evening", () => {
    const w = tonightWindow(AT_2330);
    expect(w.dateKey).toBe("2026-09-25");
    expect(w.startISO).toBe(AT_2330.toISOString());
    expect(w.endISO).toBe("2026-09-26T09:00:00.000Z");
  });

  it("at 00:30 CT is what is left of the previous evening", () => {
    const w = tonightWindow(AT_0030);
    expect(w.dateKey).toBe("2026-09-25");
    expect(w.eveningStartISO).toBe("2026-09-25T21:00:00.000Z");
    expect(w.startISO).toBe(AT_0030.toISOString());
    expect(w.endISO).toBe("2026-09-26T09:00:00.000Z");
  });

  it("at 04:00 CT rolls over to the new day's evening", () => {
    const w = tonightWindow(new Date("2026-09-26T09:00:00Z"));
    expect(w.dateKey).toBe("2026-09-26");
    expect(w.eveningStartISO).toBe("2026-09-26T21:00:00.000Z");
  });
});

describe("tonightQueryBounds", () => {
  it("before the evening, bounds on 16:00 CT so morning rows can't use up the limit", () => {
    expect(tonightQueryBounds(AT_0900)).toEqual({
      dateKey: "2026-09-25",
      fromISO: "2026-09-25T21:00:00.000Z",
      toISO: "2026-09-26T09:00:00.000Z",
    });
  });

  it("during the evening, looks back 15 minutes, floored to the half hour", () => {
    // 18:15 - 15 min = 18:00, already on a half hour.
    expect(tonightQueryBounds(AT_1815).fromISO).toBe("2026-09-25T23:00:00.000Z");
    // 23:30 - 15 = 23:15, floored to 23:00 CT.
    expect(tonightQueryBounds(AT_2330).fromISO).toBe("2026-09-26T04:00:00.000Z");
  });

  it("is the same key for every minute inside a half hour", () => {
    const a = tonightQueryBounds(new Date("2026-09-25T23:16:00Z"));
    const b = tonightQueryBounds(new Date("2026-09-25T23:44:00Z"));
    expect(a).toEqual(b);
  });
});

describe("selectTonightEvents, evening mode", () => {
  const EVENING = { mode: "evening" as const };

  it("at 09:00 CT lists the 19:30 show and not the 10:00 one", () => {
    const rows = [
      event("morning", "2026-09-25T15:00:00Z"), // 10:00 CT
      event("evening", "2026-09-26T00:30:00Z"), // 19:30 CT
    ];
    expect(selectTonightEvents(rows, AT_0900, WEATHER_UNAVAILABLE, EVENING).map((e) => e.id)).toEqual([
      "evening",
    ]);
    // Day mode, for the other callers, is unchanged.
    expect(selectTonightEvents(rows, AT_0900, WEATHER_UNAVAILABLE).map((e) => e.id)).toEqual([
      "morning",
      "evening",
    ]);
  });

  it("at 18:15 CT drops a show that started at 18:00 and keeps a 1:00 AM one", () => {
    const rows = [
      event("started", "2026-09-25T23:00:00Z"), // 18:00 CT
      event("late", "2026-09-26T06:00:00Z"), // 01:00 CT Saturday
      event("breakfast", "2026-09-26T13:00:00Z"), // 08:00 CT Saturday
    ];
    expect(selectTonightEvents(rows, AT_1815, WEATHER_UNAVAILABLE, EVENING).map((e) => e.id)).toEqual([
      "late",
    ]);
  });

  it("at 00:30 CT keeps what is left of Friday night", () => {
    const rows = [
      event("friday-2330", "2026-09-26T04:30:00Z"), // started
      event("friday-0100", "2026-09-26T06:00:00Z"),
      event("saturday-1900", "2026-09-27T00:00:00Z"),
    ];
    expect(selectTonightEvents(rows, AT_0030, WEATHER_UNAVAILABLE, EVENING).map((e) => e.id)).toEqual([
      "friday-0100",
    ]);
  });

  it("includes a festival that started yesterday and runs until tomorrow, after the timed shows", () => {
    const rows = [
      event("festival", "2026-09-24T15:00:00Z", { end_date: "2026-09-27T03:00:00Z", title: "Fall Fest" }),
      event("show", "2026-09-26T00:30:00Z"),
      event("ended", "2026-09-23T15:00:00Z", { end_date: "2026-09-25T12:00:00Z" }),
    ];
    expect(selectTonightEvents(rows, AT_1815, WEATHER_UNAVAILABLE, EVENING).map((e) => e.id)).toEqual([
      "show",
      "festival",
    ]);
  });

  it("uses the caller's indoor classifier ahead of the regex", () => {
    const rows = [
      event("a", "2026-09-25T23:30:00Z", { title: "Something" }),
      event("b", "2026-09-26T00:30:00Z", { title: "Something else" }),
    ];
    const ids = selectTonightEvents(rows, AT_1815, NASTY, {
      mode: "evening",
      isIndoor: (e) => e.id === "b",
    }).map((e) => e.id);
    expect(ids).toEqual(["b", "a"]);
  });
});

describe("buildTonightPairings, Home's evening rule", () => {
  const OPTS = { mode: "evening" as const, eveningOnly: true };
  const early = restaurant("early", { opening: "Daily 7am-11pm" });

  it("at 09:00 CT never offers a dinner before 4 PM", () => {
    // A 17:00 show would put dinner at 15:30 CT.
    const five = event("five", "2026-09-25T22:00:00Z");
    const [home] = buildTonightPairings([five], [early], AT_0900, undefined, OPTS);
    expect(home.dinner).toBeNull();
    // pickDinner's default, which Eat & Drink and Events use, is unchanged.
    const [plain] = buildTonightPairings([five], [early], AT_0900);
    expect(plain.dinner?.restaurant.id).toBe("early");
  });

  it("at 18:15 CT refuses a dinner slot already past, and keeps a later one", () => {
    const soon = event("soon", "2026-09-25T23:30:00Z"); // 18:30, dinner 17:00 (past)
    const later = event("later", "2026-09-26T01:30:00Z"); // 20:30, dinner 19:00
    const pairs = buildTonightPairings([soon, later], [early], AT_1815, undefined, OPTS);
    expect(pairs.find((p) => p.event.id === "soon")?.dinner).toBeNull();
    expect(pairs.find((p) => p.event.id === "later")?.dinner?.dinnerAt.toISOString()).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });

  it("at 23:30 CT pairs a 1:00 AM show with a restaurant open at 23:30", () => {
    const late = event("late", "2026-09-26T06:00:00Z");
    const pairs = buildTonightPairings(
      [late],
      [restaurant("bar", { opening: "Daily 4pm-2am" })],
      new Date("2026-09-26T04:00:00Z"), // 23:00 CT
      undefined,
      OPTS,
    );
    expect(pairs[0].dinner?.restaurant.id).toBe("bar");
  });

  it("at 00:30 CT pairs nothing that would have needed dinner in the past", () => {
    const late = event("late", "2026-09-26T06:00:00Z"); // 01:00 CT, dinner 23:30 CT (past)
    const [pair] = buildTonightPairings([late], [early], AT_0030, undefined, OPTS);
    expect(pair.dinner).toBeNull();
    expect(pair.startsAt?.toISOString()).toBe("2026-09-26T06:00:00.000Z");
  });

  it("gives a running festival no invented start and no dinner", () => {
    const fest = event("fest", "2026-09-24T15:00:00Z", { end_date: "2026-09-27T03:00:00Z" });
    const [pair] = buildTonightPairings([fest], [early], AT_1815, undefined, OPTS);
    expect(pair.startsAt).toBeNull();
    expect(pair.dinner).toBeNull();
    expect(pair.ongoingUntil?.toISOString()).toBe("2026-09-27T03:00:00.000Z");
  });

  it("uses a festival's own time when event_start_local gives one for tonight", () => {
    const fest = event("fest", "2026-09-24T15:00:00Z", {
      end_date: "2026-09-27T03:00:00Z",
      event_start_local: "2026-09-25T20:00:00",
    });
    const [pair] = buildTonightPairings([fest], [early], AT_1815, undefined, OPTS);
    expect(pair.startsAt?.toISOString()).toBe("2026-09-26T01:00:00.000Z");
    expect(pair.dinner?.restaurant.id).toBe("early");
  });
});

describe("isEveningDinner and pickDinner options", () => {
  it("refuses 15:59 CT and accepts 16:00 CT", () => {
    expect(isEveningDinner(new Date("2026-09-25T20:59:00Z"), AT_0900)).toBe(false);
    expect(isEveningDinner(new Date("2026-09-25T21:00:00Z"), AT_0900)).toBe(true);
  });

  it("pickDinner without options still pairs a daytime show", () => {
    const noon = event("noon", "2026-09-25T17:00:00Z");
    const start = new Date("2026-09-25T17:00:00Z");
    const rows = [restaurant("r", { opening: "Daily 7am-11pm" })];
    expect(pickDinner(noon, start, rows, AT_0900)?.restaurant.id).toBe("r");
    expect(pickDinner(noon, start, rows, AT_0900, new Set(), { eveningOnly: true })).toBeNull();
  });
});

describe("applyFrozenOrder", () => {
  const id = (x: { id: string }) => x.id;
  it("holds the first order, drops what left and appends what is new", () => {
    const items = [{ id: "c" }, { id: "a" }, { id: "d" }];
    expect(applyFrozenOrder(items, id, ["a", "b", "c"]).map(id)).toEqual(["a", "c", "d"]);
  });
  it("passes the order through before anything is frozen", () => {
    expect(applyFrozenOrder([{ id: "b" }, { id: "a" }], id, null).map(id)).toEqual(["b", "a"]);
  });
});

describe("card text helpers", () => {
  it("formats the heading date from the Central date key", () => {
    expect(formatTonightDate("2026-09-25")).toBe("Friday, Sep 25");
  });

  it("cuts long names near 40 characters on a word boundary", () => {
    const long = "The Extremely Long Annual Des Moines Metro Area Autumn Harvest Festival and Craft Fair";
    const cut = truncateName(long);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith("...")).toBe(true);
    expect(truncateName("Short name")).toBe("Short name");
  });
});
