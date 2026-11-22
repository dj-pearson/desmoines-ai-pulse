import { describe, expect, it } from "vitest";
import { adminFilterSteps, adminHoursJson, hoursEditorText, reopenPatch } from "@/lib/restaurantAdmin";
import { resolveOpenStatus } from "@/lib/restaurantHours";

// WEB-FEAT-103: the admin restaurant table's filters and the drawer's hours editor.

describe("adminFilterSteps", () => {
  it("the default list leaves merged and hidden rows out", () => {
    expect(adminFilterSteps("listed")).toEqual([
      ["neq", "is_merged", true],
      ["is", "hidden_at", null],
    ]);
  });

  it("unverified means no place id or never checked, among listed rows", () => {
    expect(adminFilterSteps("unverified")).toContainEqual(["or", "google_place_id.is.null,hours_checked_at.is.null"]);
    expect(adminFilterSteps("unverified")).toContainEqual(["is", "hidden_at", null]);
  });

  it("closed covers our status and Google's, permanent and temporary", () => {
    const [[op, filter]] = adminFilterSteps("closed") as Array<[string, string]>;
    expect(op).toBe("or");
    expect(filter).toContain("status.in.(closed,");
    expect(filter).toContain("CLOSED_PERMANENTLY");
    expect(filter).toContain("CLOSED_TEMPORARILY");
  });

  it("merged and hidden select exactly those rows", () => {
    expect(adminFilterSteps("merged")).toEqual([["eq", "is_merged", true]]);
    expect(adminFilterSteps("hidden")).toEqual([["not", "hidden_at", "is", null]]);
    expect(adminFilterSteps("everything")).toEqual([]);
  });
});

describe("adminHoursJson", () => {
  const lines = [
    "Monday: Closed",
    "Tuesday: 11 AM - 9 PM",
    "Wednesday: 11 AM - 9 PM",
    "Thursday: 11 AM - 9 PM",
    "Friday: 11 AM - 10 PM",
    "Saturday: 10 AM - 10 PM",
    "Sunday: 10 AM - 2 PM",
  ].join("\n");

  it("writes weekday lines and the periods open-now reads, from the same text", () => {
    const r = adminHoursJson(lines);
    expect("error" in r).toBe(false);
    const hours = (r as { hours: { periods: unknown[]; weekdayDescriptions: string[] } }).hours;
    expect(hours.weekdayDescriptions).toHaveLength(7);
    expect(hours.periods).toHaveLength(6);
    // Tuesday 2026-11-24 at 18:00 Central is 2026-11-25T00:00Z: open until 9.
    const tue = resolveOpenStatus(hours as never, null, new Date("2026-11-25T00:00:00Z"));
    expect(tue.status === "open" || tue.status === "closing-soon").toBe(true);
    // Monday 2026-11-23 at 12:00 Central: closed all day.
    const mon = resolveOpenStatus(hours as never, null, new Date("2026-11-23T18:00:00Z"));
    expect(mon.status).toBe("closed");
  });

  it("reads Google's own weekday lines, which the editor starts from", () => {
    // Google writes a narrow no-break space before AM/PM and a thin-spaced en dash.
    const google = [
      "Monday: 11:00 AM – 9:00 PM",
      "Tuesday: 11:00 AM – 9:00 PM",
      "Wednesday: Closed",
    ].join("\n");
    const r = adminHoursJson(google);
    expect("error" in r).toBe(false);
    expect((r as { hours: { periods: unknown[] } }).hours.periods).toHaveLength(2);
  });

  it("refuses text it cannot read whole rather than saving part of it", () => {
    const r = adminHoursJson("Monday: 11 AM - 9 PM\nTuesday: ask the owner");
    expect("error" in r).toBe(true);
  });

  it("empty text clears the hours", () => {
    expect(adminHoursJson("  \n ")).toEqual({ ok: true, hours: null });
  });

  it("round-trips through the editor text", () => {
    const r = adminHoursJson(lines) as { hours: { weekdayDescriptions: string[] } };
    expect(hoursEditorText({ hours_json: r.hours as never })).toBe(lines);
  });
});

describe("reopenPatch", () => {
  it("clears Google's closed answer along with our status, or lists would keep it shut", () => {
    expect(reopenPatch()).toEqual({ status: "open", business_status: null });
  });
});
