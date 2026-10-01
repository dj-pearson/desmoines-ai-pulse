import { describe, it, expect } from "vitest";
import {
  affiliateDestination,
  bookingHost,
  bookingProviderName,
  hotelClassStars,
  hotelRateLabel,
  resolveBooking,
  safeWebUrl,
} from "@/lib/hotelBooking";

describe("resolveBooking", () => {
  it("prefers a safe affiliate URL and marks it sponsored", () => {
    const b = resolveBooking({
      affiliate_url: "https://www.expedia.com/h123",
      affiliate_provider: "expedia",
      website: "https://hotel.example.com",
    });
    expect(b).toEqual({
      href: "https://www.expedia.com/h123",
      isAffiliate: true,
      label: "Book on expedia.com",
      rel: "sponsored noopener noreferrer",
      host: "expedia.com",
    });
  });

  it("falls back to the website with no sponsored rel", () => {
    const b = resolveBooking({ affiliate_url: null, website: "hotel.example.com" });
    expect(b?.href).toBe("https://hotel.example.com/");
    expect(b?.isAffiliate).toBe(false);
    expect(b?.label).toBe("Hotel website");
    expect(b?.rel).not.toContain("sponsored");
  });

  it("refuses a javascript: affiliate URL and uses the website instead", () => {
    const b = resolveBooking({ affiliate_url: "javascript:alert(1)", website: "https://ok.example.com" });
    expect(b?.href).toBe("https://ok.example.com/");
    expect(b?.isAffiliate).toBe(false);
  });

  it("returns null when neither URL is http(s)", () => {
    expect(resolveBooking({ affiliate_url: "javascript:alert(1)", website: "data:text/html,x" })).toBeNull();
    expect(resolveBooking({ affiliate_url: "", website: "   " })).toBeNull();
    expect(resolveBooking(null)).toBeNull();
  });

  it("treats an empty affiliate_url as absent", () => {
    expect(resolveBooking({ affiliate_url: "", website: "https://h.example.com" })?.label).toBe("Hotel website");
  });

  it("names the partner host when the affiliate URL is not a network redirect", () => {
    expect(resolveBooking({ affiliate_url: "https://partner.example.com/x" })?.label).toBe("Book on partner.example.com");
  });
});

const HILTON = "https://www.hilton.com/en/hotels/dsmdtqq-hilton-des-moines-downtown/";
const AWIN = `https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&clickref=desmoines-insider&ued=${encodeURIComponent(HILTON)}`;
const CJ = `https://www.anrdoezrs.net/click-1-2?sid=desmoines-insider&url=${encodeURIComponent("https://www.ihg.com/holidayinn/hotels/us/en/des-moines/dsmia/hoteldetail")}`;
const PARTNERIZE = "https://prf.hn/click/camref:abc/pubref:desmoines-insider/destination:https://www.marriott.com/en-us/hotels/dsmmc-des-moines-marriott-downtown/overview/";

describe("resolveBooking names the host, not the network (pass 2 item 2)", () => {
  it("decodes an Awin ued", () => {
    expect(affiliateDestination(AWIN)).toBe(HILTON);
    const b = resolveBooking({ affiliate_url: AWIN, affiliate_provider: "Awin", website: "https://example.com" });
    expect(b?.label).toBe("Book on hilton.com");
    expect(b?.rel).toContain("sponsored");
    expect(b?.href).toBe(AWIN);
  });

  it("decodes a CJ url", () => {
    const b = resolveBooking({ affiliate_url: CJ, affiliate_provider: "Commission Junction" });
    expect(b?.label).toBe("Book on ihg.com");
  });

  it("decodes a raw Partnerize destination", () => {
    const b = resolveBooking({ affiliate_url: PARTNERIZE, affiliate_provider: "Partnerize" });
    expect(b?.label).toBe("Book on marriott.com");
  });

  it("decodes an encoded Partnerize destination", () => {
    const url = `https://prf.hn/click/camref:abc/destination:${encodeURIComponent("https://www.marriott.com/x?y=1")}`;
    expect(bookingHost(affiliateDestination(url))).toBe("marriott.com");
  });

  it("falls back to the website host when the redirect has no destination", () => {
    const b = resolveBooking({
      affiliate_url: "https://www.awin1.com/cread.php?awinmid=1&awinaffid=2",
      affiliate_provider: "Awin",
      website: "https://www.hyatt.com/en-US/hotel/iowa/x",
    });
    expect(b?.label).toBe("Book on hyatt.com");
  });

  it("never names a network, even with nothing to fall back to", () => {
    const b = resolveBooking({ affiliate_url: "https://www.awin1.com/cread.php?awinmid=1", affiliate_provider: "Awin" });
    expect(b?.label).toBe("Book with our partner");
    expect(b?.label).not.toMatch(/Awin|Commission Junction|Partnerize/);
  });

  it("refuses a javascript: destination inside a redirect", () => {
    const url = `https://www.awin1.com/cread.php?ued=${encodeURIComponent("javascript:alert(1)")}`;
    expect(affiliateDestination(url)).toBeNull();
    expect(resolveBooking({ affiliate_url: url })?.label).toBe("Book with our partner");
  });
});

describe("hotelClassStars", () => {
  it("prints only a curated class", () => {
    expect(hotelClassStars({ star_rating: 4, google_place_id: null })).toBe(4);
    expect(hotelClassStars({ star_rating: 4.5, google_place_id: "ChIJ123" })).toBeNull();
    expect(hotelClassStars({ star_rating: 0, google_place_id: null })).toBeNull();
    expect(hotelClassStars({ star_rating: null })).toBeNull();
  });
});

describe("bookingProviderName", () => {
  it("maps affiliate networks to null", () => {
    expect(bookingProviderName("Awin")).toBeNull();
    expect(bookingProviderName("Commission Junction")).toBeNull();
    expect(bookingProviderName("Partnerize")).toBeNull();
  });

  it("maps known providers and passes unknown ones through", () => {
    expect(bookingProviderName("booking.com")).toBe("Booking.com");
    expect(bookingProviderName("  Hotels.com ")).toBe("Hotels.com");
    expect(bookingProviderName("LocalRooms")).toBe("LocalRooms");
    expect(bookingProviderName("")).toBeNull();
    expect(bookingProviderName("x".repeat(80))).toBeNull();
  });
});

describe("hotelRateLabel", () => {
  it("words the stored rate as a typical figure", () => {
    expect(hotelRateLabel(129)).toBe("Typically about $129/night; rates change by date");
    expect(hotelRateLabel(129.6)).toBe("Typically about $130/night; rates change by date");
    expect(hotelRateLabel("1450")).toBe("Typically about $1,450/night; rates change by date");
  });

  it("never says From $", () => {
    expect(hotelRateLabel(99)).not.toMatch(/From \$/);
  });

  it("returns null for missing or nonsense rates", () => {
    expect(hotelRateLabel(null)).toBeNull();
    expect(hotelRateLabel(undefined)).toBeNull();
    expect(hotelRateLabel(0)).toBeNull();
    expect(hotelRateLabel(-5)).toBeNull();
    expect(hotelRateLabel("abc")).toBeNull();
  });
});

describe("safeWebUrl re-export", () => {
  it("is the reservations helper", () => {
    expect(safeWebUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebUrl("https://a.example.com")).toBe("https://a.example.com/");
  });
});
