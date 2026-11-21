import { describe, expect, it } from "vitest";
import { restaurantCardActions, streetAddress } from "@/lib/restaurantCardActions";

describe("streetAddress (WEB-UX-087)", () => {
  it("drops the city and what follows it", () => {
    expect(streetAddress("123 Grand Ave, Des Moines, IA 50309", "Des Moines")).toBe("123 Grand Ave");
    expect(streetAddress("400 Locust St, Suite 2, Des Moines, IA 50309, USA", "des moines")).toBe(
      "400 Locust St, Suite 2",
    );
  });

  it("is null when the location is only the city", () => {
    expect(streetAddress("Des Moines", "Des Moines")).toBeNull();
    expect(streetAddress("Des Moines, IA", "Des Moines")).toBeNull();
    expect(streetAddress("  ", "Des Moines")).toBeNull();
    expect(streetAddress(null, "Des Moines")).toBeNull();
  });

  it("keeps a location that does not name the city", () => {
    expect(streetAddress("100 Main St, Ankeny, IA", "Des Moines")).toBe("100 Main St, Ankeny, IA");
    expect(streetAddress("100 Main St", null)).toBe("100 Main St");
  });
});

describe("restaurantCardActions (WEB-UX-087)", () => {
  const open = {
    phone: "(515) 555-0100",
    location: "123 Grand Ave, Des Moines, IA 50309",
    city: "Des Moines",
    latitude: 41.58,
    longitude: -93.62,
    status: "active",
    business_status: "OPERATIONAL",
  };

  it("gives an open place both actions, coordinates first", () => {
    expect(restaurantCardActions(open)).toEqual({
      callHref: "tel:(515)555-0100",
      directionsHref: "https://www.google.com/maps/dir/?api=1&destination=41.58,-93.62",
    });
  });

  it("falls back to the street and city when there are no coordinates", () => {
    const { directionsHref } = restaurantCardActions({ ...open, latitude: null, longitude: null });
    expect(directionsHref).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("123 Grand Ave, Des Moines")}`,
    );
  });

  it("shows nothing it has no data for", () => {
    expect(restaurantCardActions({ city: "Des Moines", location: "Des Moines" })).toEqual({
      callHref: null,
      directionsHref: null,
    });
    expect(restaurantCardActions({ ...open, phone: "call us" }).callHref).toBeNull();
  });

  it("a temporarily closed place has Directions but no Call", () => {
    const actions = restaurantCardActions({ ...open, business_status: "CLOSED_TEMPORARILY" });
    expect(actions.callHref).toBeNull();
    expect(actions.directionsHref).not.toBeNull();
  });

  it("a place closed for good has neither", () => {
    for (const row of [
      { ...open, status: "closed" },
      { ...open, status: "permanently_closed" },
      { ...open, business_status: "CLOSED_PERMANENTLY" },
    ]) {
      expect(restaurantCardActions(row)).toEqual({ callHref: null, directionsHref: null });
    }
  });
});
