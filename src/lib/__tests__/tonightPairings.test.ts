import { describe, expect, it } from "vitest";
import { WEATHER_UNAVAILABLE, type WeatherSnapshot } from "@/hooks/useWeather";
import {
  PAIR_MAX_MILES,
  buildTonightPairings,
  centralDayWindow,
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
    expect(isOpenForDinner(restaurant("a", { opening: "Daily 5pm-10pm" }), dinner, NOW)).toBe(true);
    // 18:00 CDT is 23:00 UTC; a UTC reading would call this open.
    expect(isOpenForDinner(restaurant("b", { opening: "Daily 10pm-11:59pm" }), dinner, NOW)).toBe(false);
  });

  it("refuses closing-soon, unknown hours, non-string hours and closed statuses", () => {
    expect(isOpenForDinner(restaurant("a", { opening: "Daily 11am-6:30pm" }), dinner, NOW)).toBe(false);
    expect(isOpenForDinner(restaurant("b", { opening: null }), dinner, NOW)).toBe(false);
    expect(isOpenForDinner(restaurant("c", { opening: false }), dinner, NOW)).toBe(false);
    expect(isOpenForDinner(restaurant("d", { status: "opening_soon" }), dinner, NOW)).toBe(false);
    expect(isOpenForDinner(restaurant("e", { opening_date: "2026-12-01" }), dinner, NOW)).toBe(false);
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

  it("prefers a restaurant not already used, and puts paired cards first", () => {
    const events = [
      event("one", "2026-09-25T00:30:00Z"),
      event("waukee", "2026-09-25T00:45:00Z", WAUKEE),
      event("two", "2026-09-25T01:00:00Z"),
    ];
    const rows = [restaurant("a"), restaurant("b", { latitude: 41.589, longitude: -93.622 })];
    const pairs = buildTonightPairings(events, rows, NOW);
    expect(pairs.map((p) => p.event.id)).toEqual(["one", "two", "waukee"]);
    expect(pairs[0].dinner?.restaurant.id).toBe("a");
    expect(pairs[1].dinner?.restaurant.id).toBe("b");
    expect(pairs[2].dinner).toBeNull();
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
