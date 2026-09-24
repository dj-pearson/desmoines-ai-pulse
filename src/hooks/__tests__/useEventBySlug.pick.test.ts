/**
 * Slug resolution rules for event detail (events plan WP8 item 2): UUIDs and
 * stale slugs land on the event, ambiguity stays a 404.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { isEventIdSlug, pickSlugCandidate, parseSlugDate } from "../useEventBySlug";

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

  it("returns null for a dateless slug with no exact match", () => {
    expect(pickSlugCandidate("jazz-night", [JAZZ])).toBeNull();
  });
});
