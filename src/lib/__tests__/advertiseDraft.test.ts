import { describe, it, expect, beforeEach } from "vitest";
import {
  ADVERTISE_DRAFT_KEY,
  clearAdvertiseDraft,
  parseAdvertiseDraft,
  readAdvertiseDraft,
  saveAdvertiseDraft,
} from "@/lib/advertiseDraft";
import type { AdvertiseDraft } from "@/lib/advertiseDraft";
import { safeStorage } from "@/lib/safeStorage";

/**
 * Business plan WP1 item 8. The /advertise builder keeps its choices across a
 * sign-in, and what comes back out of storage is validated, not trusted.
 */

const LISTING_ID = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";

const DRAFT: AdvertiseDraft = {
  name: "Autumn Patio Push",
  startDate: "2026-10-01",
  endDate: "2026-10-30",
  placements: ["top_banner", "sponsored_listing"],
  listing: { type: "restaurant", id: LISTING_ID },
};

beforeEach(() => {
  clearAdvertiseDraft();
});

describe("parseAdvertiseDraft", () => {
  it("accepts a well-formed draft as is", () => {
    expect(parseAdvertiseDraft(DRAFT)).toEqual(DRAFT);
  });

  it("fills missing optional fields with empties", () => {
    expect(parseAdvertiseDraft({})).toEqual({
      name: "",
      startDate: null,
      endDate: null,
      placements: [],
      listing: null,
    });
  });

  it("drops the whole value when any field is the wrong shape", () => {
    expect(parseAdvertiseDraft(null)).toBeNull();
    expect(parseAdvertiseDraft("draft")).toBeNull();
    expect(parseAdvertiseDraft([DRAFT])).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, name: 42 })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, startDate: "2026-02-30" })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, endDate: "October 30" })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, placements: ["sidebar"] })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, placements: "top_banner" })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, listing: { type: "attraction", id: LISTING_ID } })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, listing: { type: "event", id: "not-a-uuid" } })).toBeNull();
    expect(parseAdvertiseDraft({ ...DRAFT, name: "x".repeat(201) })).toBeNull();
  });

  it("stores no price, and ignores one if an older value had it", () => {
    const parsed = parseAdvertiseDraft({ ...DRAFT, total: 66.5 });
    expect(parsed).not.toHaveProperty("total");
  });

  it("removes duplicate placements", () => {
    expect(parseAdvertiseDraft({ ...DRAFT, placements: ["top_banner", "top_banner"] })?.placements).toEqual([
      "top_banner",
    ]);
  });
});

describe("read and save", () => {
  it("round-trips through storage under the versioned key", () => {
    saveAdvertiseDraft(DRAFT);
    expect(safeStorage.getItem(ADVERTISE_DRAFT_KEY)).not.toBeNull();
    expect(readAdvertiseDraft()).toEqual(DRAFT);
  });

  it("removes a malformed value on read", () => {
    safeStorage.setItem(ADVERTISE_DRAFT_KEY, JSON.stringify({ ...DRAFT, placements: ["sidebar"] }));
    expect(readAdvertiseDraft()).toBeNull();
    expect(safeStorage.getItem(ADVERTISE_DRAFT_KEY)).toBeNull();
  });

  it("removes a value that isn't JSON", () => {
    safeStorage.setItem(ADVERTISE_DRAFT_KEY, "{not json");
    expect(readAdvertiseDraft()).toBeNull();
    expect(safeStorage.getItem(ADVERTISE_DRAFT_KEY)).toBeNull();
  });

  it("doesn't keep an empty draft around", () => {
    saveAdvertiseDraft(DRAFT);
    saveAdvertiseDraft({ name: " ", startDate: null, endDate: null, placements: [], listing: null });
    expect(safeStorage.getItem(ADVERTISE_DRAFT_KEY)).toBeNull();
  });
});
