import { describe, expect, it } from "vitest";
import { buildContentEditPayload, PROTECTED_COLUMNS } from "@/lib/contentEditPayload";

const restaurantFields = [
  { key: "name", type: "text" },
  { key: "location", type: "text" },
  { key: "phone", type: "text" },
  { key: "website", type: "url" },
  { key: "rating", type: "number" },
  { key: "opening_date", type: "date" },
  { key: "status", type: "select" },
  { key: "is_featured", type: "boolean" },
];

// A row shaped like the admin list projection: configured fields plus the
// columns the form never shows.
const listRow = {
  id: "r1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  name: "Fong's Pizza",
  location: "223 4th St, Des Moines",
  phone: "515-555-0100",
  website: null,
  rating: 4.5,
  opening_date: "2024-05-10",
  status: "open",
  is_featured: false,
  is_sponsored: false,
  sponsored_until: null,
  hours_json: { mon: "11-22" },
  business_status: "OPERATIONAL",
  hours_checked_at: "2026-10-01T00:00:00Z",
  popularity_score: 87,
  is_merged: false,
  merged_into: null,
  enhanced: true,
  slug: "fongs-pizza",
};

// The dialog turns date fields into Date objects and gives every configured
// field a key; mirror that so the test sees the form state it really holds.
function formStateFrom(row: Record<string, unknown>) {
  return { ...row, opening_date: new Date(row.opening_date as string) };
}

describe("buildContentEditPayload (WEB-BE-067)", () => {
  it("sends exactly the one field that changed on a restaurant edit", () => {
    const current = { ...formStateFrom(listRow), phone: "515-555-0199" };
    const payload = buildContentEditPayload({
      fields: restaurantFields,
      original: listRow,
      current,
      isNew: false,
    });
    expect(payload).toEqual({ phone: "515-555-0199" });
    expect(Object.keys(payload)).toHaveLength(1);
  });

  it("sends nothing when nothing changed, including untouched dates and nulls", () => {
    const payload = buildContentEditPayload({
      fields: restaurantFields,
      original: listRow,
      current: formStateFrom(listRow),
      isNew: false,
    });
    expect(payload).toEqual({});
  });

  it("treats an untouched null text field shown as an empty input as unchanged", () => {
    const payload = buildContentEditPayload({
      fields: restaurantFields,
      original: listRow,
      current: { ...formStateFrom(listRow), website: "" },
      isNew: false,
    });
    expect(payload).toEqual({});
  });

  it("never sends a protected column, even if the form state changed it", () => {
    const current: Record<string, unknown> = { ...formStateFrom(listRow), name: "Fong's" };
    for (const column of PROTECTED_COLUMNS) current[column] = "tampered";
    const payload = buildContentEditPayload({
      fields: [...restaurantFields, { key: "is_sponsored", type: "boolean" }, { key: "slug", type: "text" }],
      original: listRow,
      current,
      isNew: false,
      extraKeys: ["hours_json", "business_status"],
    });
    expect(payload).toEqual({ name: "Fong's" });
  });

  it("writes a changed date in the column's format", () => {
    const payload = buildContentEditPayload({
      fields: restaurantFields,
      original: listRow,
      current: { ...formStateFrom(listRow), opening_date: new Date(2025, 2, 14) },
      isNew: false,
    });
    expect(payload).toEqual({ opening_date: "2025-03-14" });
  });

  it("compares datetime fields by instant, not by string spelling", () => {
    const event = { id: "e1", title: "Jazz", date: "2026-12-01T19:00:00+00:00", latitude: null, longitude: null };
    const fields = [{ key: "title", type: "text" }, { key: "date", type: "datetime" }];
    const unchanged = buildContentEditPayload({
      fields,
      original: event,
      current: { ...event, date: new Date(event.date) },
      isNew: false,
      extraKeys: ["latitude", "longitude"],
    });
    expect(unchanged).toEqual({});

    const autofilled = buildContentEditPayload({
      fields,
      original: event,
      current: { ...event, date: new Date(event.date), latitude: 41.58, longitude: -93.62 },
      isNew: false,
      extraKeys: ["latitude", "longitude"],
    });
    expect(autofilled).toEqual({ latitude: 41.58, longitude: -93.62 });
  });

  it("lets hotels edit slug, which they configure as a field", () => {
    const hotel = { id: "h1", name: "Surety", slug: "surety" };
    const fields = [{ key: "name", type: "text" }, { key: "slug", type: "text" }];
    const payload = buildContentEditPayload({
      fields,
      original: hotel,
      current: { ...hotel, slug: "surety-hotel" },
      isNew: false,
      allowedProtected: ["slug"],
    });
    expect(payload).toEqual({ slug: "surety-hotel" });
  });

  it("keeps the whole form on create, minus readonly and protected keys", () => {
    const current = {
      isNew: true,
      title: "Concert",
      date: new Date("2026-12-01T19:00:00Z"),
      category: "Music",
      price: "$15-30",
      is_featured: false,
      is_sponsored: true,
    };
    const payload = buildContentEditPayload({
      fields: [{ key: "title", type: "text" }, { key: "date", type: "datetime" }],
      original: current,
      current,
      isNew: true,
    });
    expect(payload).toEqual({
      title: "Concert",
      date: "2026-12-01T19:00:00.000Z",
      category: "Music",
      price: "$15-30",
      is_featured: false,
    });
  });
});
