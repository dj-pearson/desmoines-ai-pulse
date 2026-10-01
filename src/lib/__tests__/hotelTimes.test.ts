import { describe, it, expect } from "vitest";
import { parseHotelTime } from "@/lib/hotelTimes";

describe("parseHotelTime", () => {
  it("reads twelve-hour times", () => {
    expect(parseHotelTime("3:00 PM")).toBe("15:00");
    expect(parseHotelTime("11:00 AM")).toBe("11:00");
    expect(parseHotelTime("3 pm")).toBe("15:00");
    expect(parseHotelTime("4:30p.m.")).toBe("16:30");
    expect(parseHotelTime("12:00 PM")).toBe("12:00");
    expect(parseHotelTime("12:00 AM")).toBe("00:00");
  });

  it("reads twenty-four-hour times", () => {
    expect(parseHotelTime("15:00")).toBe("15:00");
    expect(parseHotelTime("9:05")).toBe("09:05");
    expect(parseHotelTime("15:00:00")).toBe("15:00");
    expect(parseHotelTime(" 11:00 ")).toBe("11:00");
  });

  it("returns null for anything it cannot read with certainty", () => {
    expect(parseHotelTime(null)).toBeNull();
    expect(parseHotelTime(undefined)).toBeNull();
    expect(parseHotelTime("")).toBeNull();
    expect(parseHotelTime("after 3")).toBeNull();
    expect(parseHotelTime("Noon")).toBeNull();
    expect(parseHotelTime("25:00")).toBeNull();
    expect(parseHotelTime("13:00 PM")).toBeNull();
    expect(parseHotelTime("0:00 AM")).toBeNull();
    expect(parseHotelTime("3:75 PM")).toBeNull();
    expect(parseHotelTime("3:00 PM - 4:00 PM")).toBeNull();
  });
});
