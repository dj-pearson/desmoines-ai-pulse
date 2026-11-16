import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HotelCard from "@/components/HotelCard";
import type { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

/**
 * check-prerender-content failed /stay with "8 link(s) with no accessible
 * name": a hotel with no photo renders a role="img" placeholder, and the label
 * on that div does not name the <a> around it. This applies the same rule the
 * prerender check uses (scripts/check-prerender-content.mjs unnamedLinks) to
 * a card with and without a photo.
 */
function unnamedLinks(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) => {
    if (a.closest('[aria-hidden="true"]')) return false;
    if ((a.getAttribute("aria-label") || a.getAttribute("aria-labelledby") || a.getAttribute("title") || "").trim()) {
      return false;
    }
    if ((a.textContent || "").trim()) return false;
    return !a.querySelector('img[alt]:not([alt=""])');
  });
}

const base = { id: "h1", name: "Test Hotel", slug: "test-hotel" };

afterEach(cleanup);

function renderCard(hotel: Hotel) {
  const { container } = render(
    <MemoryRouter>
      <HotelCard hotel={hotel} showBookButton={false} />
    </MemoryRouter>,
  );
  return container;
}

describe("HotelCard links have accessible names", () => {
  it("names the image link when the hotel has no photo", () => {
    const container = renderCard({ ...base, image_url: null } as unknown as Hotel);
    expect(unnamedLinks(container)).toEqual([]);
  });

  it("names the image link when the hotel has a photo", () => {
    const container = renderCard({
      ...base,
      image_url: "https://abc.supabase.co/storage/v1/object/public/images/hotel.jpg",
    } as unknown as Hotel);
    expect(unnamedLinks(container)).toEqual([]);
  });
});
