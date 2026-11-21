import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HotelCard from "@/components/HotelCard";
import type { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

/**
 * WEB-PERF-041 AC3. HotelCard was a raw <img> with no srcset, so every card on
 * /stay downloaded the full-size original whatever the viewport, and the first
 * row (the LCP image) was loading="lazy". These pin the two halves: a storage
 * image gets a transform srcset, and only a card told it is in the first row
 * loads eagerly.
 */
const SRC = "https://abc.supabase.co/storage/v1/object/public/images/hotel.jpg";

// Only the fields HotelCard reads; the rest of the row is irrelevant here.
const hotel = {
  id: "h1",
  name: "Test Hotel",
  slug: "test-hotel",
  image_url: SRC,
} as unknown as Hotel;

afterEach(cleanup);

function renderCard(priority?: boolean) {
  render(
    <MemoryRouter>
      <HotelCard hotel={hotel} showBookButton={false} priority={priority} />
    </MemoryRouter>,
  );
  return screen.getByAltText("Test Hotel");
}

describe("HotelCard image", () => {
  it("asks Supabase for resized renditions instead of the original", () => {
    const img = renderCard();
    const srcset = img.getAttribute("srcset") ?? "";
    expect(srcset).toContain("/storage/v1/render/image/public/images/hotel.jpg?width=320");
    expect(srcset).toContain("640w");
    expect(img.getAttribute("sizes")).toBeTruthy();
  });

  it("is lazy by default", () => {
    const img = renderCard();
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("fetchpriority")).not.toBe("high");
  });

  it("is eager with a high fetch priority in the first row", () => {
    const img = renderCard(true);
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });
});
