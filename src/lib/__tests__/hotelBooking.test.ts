import { describe, it, expect } from "vitest";
import { bookingProviderName, hotelRateLabel, resolveBooking, safeWebUrl } from "@/lib/hotelBooking";

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
      label: "Book via Expedia",
      rel: "sponsored noopener noreferrer",
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

  it("labels an affiliate link with no provider generically", () => {
    expect(resolveBooking({ affiliate_url: "https://partner.example.com/x" })?.label).toBe("Book via our partner");
  });
});

describe("bookingProviderName", () => {
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
