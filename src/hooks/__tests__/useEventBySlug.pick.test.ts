/**
 * Slug resolution rules for event detail (events plan WP8 item 2): UUIDs and
 * stale slugs land on the event, ambiguity stays a 404. Dateless slugs and
 * merged or archived rows are events-pass2 WP4 items 1 and 11.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { classifyUnlisted, isEventIdSlug, pickSlugCandidate, parseSlugDate } from "../useEventBySlug";

// 19:00 CDT on Thu Sep 24 2026, which is Sep 25 in UTC.
const JAZZ = {
  id: "a1",
  title: "Jazz Night at the Hall",
  date: "2026-09-25T00:00:00Z",
  event_start_utc: "2026-09-25T00:00:00Z",
};
const TRIVIA = {
  id: "b2",
  title: "Trivia Tuesday",
  date: "2026-09-24T01:00:00Z",
  event_start_utc: "2026-09-24T01:00:00Z",
};

describe("isEventIdSlug", () => {
  it("accepts a UUID and nothing slug-shaped", () => {
    expect(isEventIdSlug("3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c")).toBe(true);
    expect(isEventIdSlug("jazz-night-at-the-hall-2026-09-24")).toBe(false);
    expect(parseSlugDate("3f2b8c1e-9a4d-4c7e-8b21-0d5e6f7a8b9c")).toBeNull();
  });
});

describe("pickSlugCandidate", () => {
  it("prefers the exact slug, using the Central date", () => {
    expect(pickSlugCandidate("jazz-night-at-the-hall-2026-09-24", [TRIVIA, JAZZ])?.id).toBe("a1");
  });

  it("rescues an event that moved a day", () => {
    expect(pickSlugCandidate("jazz-night-at-the-hall-2026-09-25", [TRIVIA, JAZZ])?.id).toBe("a1");
  });

  it("rescues a retitled event when it is the only one that day and shares a word", () => {
    expect(pickSlugCandidate("jazz-night-2026-09-24", [JAZZ])?.id).toBe("a1");
  });

  it("does not guess between two same-day candidates", () => {
    const other = { ...JAZZ, id: "c3", title: "Jazz Brunch" };
    expect(pickSlugCandidate("jazz-night-2026-09-24", [JAZZ, other])).toBeNull();
  });

  it("does not land an unrelated slug on the day's only event", () => {
    expect(pickSlugCandidate("pottery-class-2026-09-24", [JAZZ])).toBeNull();
  });

  // Reminder and digest emails build dateless slugs; these used to 404.
  it("resolves a dateless slug to the row whose title slugs to it", () => {
    expect(pickSlugCandidate("jazz-night-at-the-hall", [TRIVIA, JAZZ])?.id).toBe("a1");
  });

  it("does not resolve a dateless slug to a longer title that merely contains it", () => {
    expect(pickSlugCandidate("jazz-night", [JAZZ])).toBeNull();
  });

  it("two same-title rows pick the soonest", () => {
    const later = { ...JAZZ, id: "later", date: "2026-10-09T00:00:00Z", event_start_utc: "2026-10-09T00:00:00Z" };
    const sooner = { ...JAZZ, id: "sooner", date: "2026-10-02T00:00:00Z", event_start_utc: "2026-10-02T00:00:00Z" };
    expect(pickSlugCandidate("jazz-night-at-the-hall", [later, sooner])?.id).toBe("sooner");
    expect(pickSlugCandidate("jazz-night-at-the-hall", [sooner, later])?.id).toBe("sooner");
  });
});

describe("classifyUnlisted (merged, archived, hidden)", () => {
  it("sends a merged duplicate to its survivor", () => {
    expect(classifyUnlisted({ id: "dup", is_merged: true, merged_into: "keep" })).toEqual({
      kind: "merged",
      survivorId: "keep",
    });
  });

  it("renders an archived row as a past event", () => {
    expect(classifyUnlisted({ id: "old", archived_at: "2026-09-01T00:00:00Z" })).toEqual({
      kind: "archived",
      id: "old",
    });
  });

  it("keeps a hidden row a 404, even when it is also merged or archived", () => {
    expect(classifyUnlisted({ id: "h", is_hidden: true })).toEqual({ kind: "gone" });
    expect(classifyUnlisted({ id: "h", is_hidden: true, is_merged: true, merged_into: "keep" })).toEqual({
      kind: "gone",
    });
    expect(classifyUnlisted({ id: "h", is_hidden: true, archived_at: "2026-09-01T00:00:00Z" })).toEqual({
      kind: "gone",
    });
  });

  it("is a 404 for a merge with no survivor recorded, or none at all", () => {
    expect(classifyUnlisted({ id: "dup", is_merged: true, merged_into: null })).toEqual({ kind: "gone" });
    expect(classifyUnlisted({ id: "dup", is_merged: true, merged_into: "dup" })).toEqual({ kind: "gone" });
    expect(classifyUnlisted(null)).toEqual({ kind: "gone" });
  });
});
