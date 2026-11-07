import { describe, it, expect } from "vitest";
import { buildSlides, MAX_EVENT_SLIDES, slideFileName, wrapText } from "../slideshow";

const NOW = new Date("2026-11-08T00:30:00Z"); // 6:30 PM Central, Sat Nov 7
// One unit per character: easy to reason about widths.
const measure = (s: string) => s.length;

const ev = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `e${i}`,
  title: `Event ${i}`,
  date: "2026-11-08T01:00:00+00:00",
  event_start_utc: "2026-11-08T01:00:00+00:00",
  venue: "Hoyt Sherman Place",
  price: "$25",
  ...extra,
});

describe("buildSlides", () => {
  it("is cover, events, closing slide", () => {
    const slides = buildSlides([ev(1), ev(2)], NOW);
    expect(slides.map((s) => s.kind)).toEqual(["cover", "event", "event", "outro"]);
  });

  it("dates the cover in Central time", () => {
    const cover = buildSlides([ev(1)], NOW)[0];
    expect(cover.kind === "cover" && cover.dateLine).toBe("Saturday, November 7");
    expect(cover.kind === "cover" && cover.countLine).toBe("1 pick for tonight");
  });

  it("caps at eight slides", () => {
    const slides = buildSlides(Array.from({ length: 10 }, (_, i) => ev(i)), NOW);
    expect(slides).toHaveLength(MAX_EVENT_SLIDES + 2);
  });

  it("uses the page's time and price wording", () => {
    const [, timed, untimed] = buildSlides([ev(1), ev(2, { time_tbd: true, price: "Free" })], NOW);
    expect(timed.kind === "event" && timed.timeLine).toBe("7:00 PM CT");
    expect(untimed.kind === "event" && untimed.timeLine).toBe("Time not listed");
    expect(untimed.kind === "event" && untimed.free).toBe(true);
  });

  it("leaves out a price nobody listed instead of guessing", () => {
    const [, e] = buildSlides([ev(1, { price: null })], NOW);
    expect(e.kind === "event" && e.priceLine).toBeNull();
  });

  it("falls back to location when there is no venue", () => {
    const [, e] = buildSlides([ev(1, { venue: null, location: "Downtown" })], NOW);
    expect(e.kind === "event" && e.placeLine).toBe("Downtown");
  });
});

describe("wrapText", () => {
  it("wraps on words", () => {
    expect(wrapText("one two three four", 9, 3, measure)).toEqual(["one two", "three", "four"]);
  });

  it("adds an ellipsis when it has to cut", () => {
    expect(wrapText("one two three four five six", 9, 2, measure)).toEqual(["one two", "three..."]);
  });

  it("cuts a word too long for any line", () => {
    const lines = wrapText("Supercalifragilistic", 8, 3, measure);
    expect(lines.every((l) => l.length <= 8)).toBe(true);
    expect(lines.join("").replace(/\.\.\./, "")).toContain("Supercal");
  });

  it("returns nothing for empty text", () => {
    expect(wrapText("   ", 10, 2, measure)).toEqual([]);
  });
});

it("names files by Central date and position", () => {
  expect(slideFileName(NOW, 0)).toBe("tonight-dsm-2026-11-07-01.png");
});
