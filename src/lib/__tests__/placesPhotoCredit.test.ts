import { describe, expect, it } from "vitest";
import { isPlacesPhotoCopy, placesPhotoCredit } from "@/lib/placesPhotoCredit";

const COPY = "https://x.supabase.co/storage/v1/object/public/media/hotels/0d3c1d2e-1111-4a2b-9c3d-123456789abc/places-photo-1760140800000.jpg";

describe("placesPhotoCredit", () => {
  it("credits the author and Google on a Places copy", () => {
    expect(placesPhotoCredit(COPY, "Jo Smith")).toBe("Photo: Jo Smith, Google Maps");
  });

  it("still credits Google when the query did not carry the author", () => {
    // The guarantee the file-name detection exists for: a surface that
    // selected no attribution column shows the Google line, not nothing.
    expect(placesPhotoCredit(COPY, undefined)).toBe("Photo: Google Maps");
    expect(placesPhotoCredit(COPY, "  ")).toBe("Photo: Google Maps");
  });

  it("does not present the generic Google line as an author", () => {
    expect(placesPhotoCredit(COPY, "Some content provided by Google")).toBe("Photo: Google Maps");
  });

  it("says nothing about an image that is not a Places copy", () => {
    expect(placesPhotoCredit("https://x.supabase.co/storage/v1/object/public/media/hotels/abc/hero.jpg", "Jo Smith")).toBeNull();
    expect(placesPhotoCredit(null, "Jo Smith")).toBeNull();
    expect(placesPhotoCredit("/images/hotel.jpg", null)).toBeNull();
  });

  it("recognises the copy behind a resize query or the /media route", () => {
    expect(isPlacesPhotoCopy(`${COPY}?width=640&quality=75`)).toBe(true);
    expect(isPlacesPhotoCopy("https://desmoinesinsider.com/media/hotels/abc/places-photo-1760140800000.webp")).toBe(true);
    expect(isPlacesPhotoCopy("https://example.com/places-photo-gallery.jpg")).toBe(false);
  });
});
