import { describe, it, expect, beforeEach } from "vitest";
import {
  toggleGuestFavorite,
  readGuestFavorites,
  clearGuestFavorites,
  GUEST_FAVORITE_LIMIT,
} from "@/hooks/useGuestFavorites";

/** WEB-FEAT-006 — guest-favorites save-wall logic. */
describe("guest favorites", () => {
  beforeEach(() => {
    clearGuestFavorites();
  });

  it("saves up to the limit then reports cap_reached", () => {
    for (let i = 0; i < GUEST_FAVORITE_LIMIT; i++) {
      const r = toggleGuestFavorite({ contentType: "event", contentId: `e${i}` });
      expect(r.status).toBe("added");
      expect(r.count).toBe(i + 1);
    }
    const capped = toggleGuestFavorite({ contentType: "event", contentId: "extra" });
    expect(capped.status).toBe("cap_reached");
    expect(capped.count).toBe(GUEST_FAVORITE_LIMIT);
    expect(readGuestFavorites()).toHaveLength(GUEST_FAVORITE_LIMIT);
  });

  it("toggling an existing favorite removes it", () => {
    toggleGuestFavorite({ contentType: "restaurant", contentId: "r1" });
    expect(readGuestFavorites()).toHaveLength(1);
    const r = toggleGuestFavorite({ contentType: "restaurant", contentId: "r1" });
    expect(r.status).toBe("removed");
    expect(readGuestFavorites()).toHaveLength(0);
  });

  it("removing under cap frees a slot for a new save", () => {
    for (let i = 0; i < GUEST_FAVORITE_LIMIT; i++) {
      toggleGuestFavorite({ contentType: "event", contentId: `e${i}` });
    }
    toggleGuestFavorite({ contentType: "event", contentId: "e0" }); // remove one
    const r = toggleGuestFavorite({ contentType: "attraction", contentId: "a1" });
    expect(r.status).toBe("added");
    expect(readGuestFavorites()).toHaveLength(GUEST_FAVORITE_LIMIT);
  });

  it("persists across a fresh read (survives reload)", () => {
    toggleGuestFavorite({ contentType: "playground", contentId: "p1", name: "Greenwood" });
    const stored = JSON.parse(localStorage.getItem("guest_favorites_v1") || "{}");
    expect(stored.version).toBe(1);
    expect(stored.items?.[0]?.contentId).toBe("p1");
  });
});
