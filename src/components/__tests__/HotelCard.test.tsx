import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HotelCard from "@/components/HotelCard";
import type { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

/**
 * check-prerender-content failed /stay with "8 link(s) with no accessible
 * name": a hotel with no image_url rendered an image link holding only a
 * role="img" placeholder. The link names itself now, image or not.
 */
const hotel = { id: "h1", name: "Hotel Fort Des Moines", slug: "hotel-fort-des-moines", image_url: null } as unknown as Hotel;

const renderCard = (h: Hotel) =>
  render(
    <MemoryRouter>
      <HotelCard hotel={h} />
    </MemoryRouter>,
  );

describe("HotelCard", () => {
  it("names the image link when there is no image", () => {
    renderCard(hotel);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/stay/hotel-fort-des-moines");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      const named = (a.getAttribute("aria-label") || a.textContent || "").trim();
      expect(named).not.toBe("");
    }
  });

  it("keeps the name when there is an image", () => {
    renderCard({ ...hotel, image_url: "https://example.test/h.jpg" } as Hotel);
    expect(screen.getAllByRole("link", { name: "Hotel Fort Des Moines" }).length).toBeGreaterThan(0);
  });
});
