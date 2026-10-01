/**
 * The restaurant FAQ ships as FAQPage JSON-LD, so every answer has to be a
 * fact from the row (eat-drink pass 2, WP3.1).
 */
import { describe, it, expect } from "vitest";
import { buildRestaurantFaqs, describeWeek } from "@/lib/restaurantFaqs";

const CLAIMS = /editor|highest|most affordable|popular|upscale|fine dining|\$\d/i;

const ROW = {
  name: "Fixture Supper Club",
  cuisine: "American",
  location: "400 Locust St, Des Moines, IA 50309",
  phone: "515-555-0100",
  price_range: "$",
  rating: 4.7,
  opening: "Mon-Sat 11am-10pm; Sun closed",
  latitude: 41.58,
  longitude: -93.62,
  // The flag the old FAQ read as "an editor's pick". Not a field the builder
  // takes at all now; here to show it changes nothing.
  is_featured: true,
};

const CTX = { lifecycle: null, locality: "Des Moines" } as const;

describe("buildRestaurantFaqs", () => {
  it("makes no editorial, rank or dollar-band claim", () => {
    for (const price of ["$", "$$", "$$$", "$$$$"]) {
      for (const rating of [3.2, 4.1, 4.9]) {
        const { faqs } = buildRestaurantFaqs({ ...ROW, price_range: price, rating }, CTX);
        for (const f of faqs) expect(f.answer).not.toMatch(CLAIMS);
      }
    }
  });

  it("reads the rating as a Google rating", () => {
    const { faqs } = buildRestaurantFaqs(ROW, CTX);
    expect(faqs.find((f) => /rating/.test(f.question))?.answer).toBe("Google rating 4.7 of 5.");
  });

  it("answers hours from the parsed week", () => {
    const { faqs } = buildRestaurantFaqs(ROW, CTX);
    const hours = faqs.find((f) => /hours/.test(f.question))?.answer ?? "";
    expect(hours).toContain("Monday to Saturday 11 AM to 10 PM; Sunday closed.");
    expect(hours).not.toContain("Mon-Sat");
  });

  it("leaves the hours answer out when the text doesn't parse", () => {
    const { faqs } = buildRestaurantFaqs({ ...ROW, opening: "Call for hours, varies by season" }, CTX);
    expect(faqs.some((f) => /hours/.test(f.question))).toBe(false);
  });

  it("says a closed place is closed and gives no phone", () => {
    const { faqs } = buildRestaurantFaqs(ROW, { ...CTX, lifecycle: "closed" });
    expect(faqs.find((f) => /hours/.test(f.question))?.answer).toBe("Fixture Supper Club has closed permanently.");
    expect(faqs.some((f) => /phone/.test(f.question))).toBe(false);
  });

  it("keeps geo_faq out of the schema list and drops repeats", () => {
    const { faqs, aiFaqs } = buildRestaurantFaqs(
      {
        ...ROW,
        geo_faq: [
          { question: "Is there parking?", answer: "It's one of the most popular spots downtown." },
          { question: "What is the rating for Fixture Supper Club?", answer: "Great." },
        ],
      },
      CTX,
    );
    expect(aiFaqs).toEqual([{ question: "Is there parking?", answer: "It's one of the most popular spots downtown." }]);
    expect(faqs.some((f) => f.question === "Is there parking?")).toBe(false);
  });

  it("skips price for a value that isn't a tier", () => {
    const { faqs } = buildRestaurantFaqs({ ...ROW, price_range: "$10-20" }, CTX);
    expect(faqs.some((f) => /cost/.test(f.question))).toBe(false);
  });
});

describe("describeWeek", () => {
  it("names days the text doesn't cover instead of calling them closed", () => {
    expect(describeWeek(null, "Mon-Fri 11am-9pm")).toBe(
      "Monday to Friday 11 AM to 9 PM. Saturday and Sunday aren't listed.",
    );
  });

  it("returns null with nothing readable", () => {
    expect(describeWeek(null, null)).toBeNull();
    expect(describeWeek(null, "by appointment")).toBeNull();
  });

  it("prefers structured hours", () => {
    const json = {
      periods: [
        { open: { day: 5, hour: 17, minute: 0 }, close: { day: 5, hour: 22, minute: 0 } },
        { open: { day: 6, hour: 17, minute: 0 }, close: { day: 6, hour: 22, minute: 0 } },
      ],
    };
    expect(describeWeek(json, "Daily 9am-5pm")).toBe(
      "Monday to Thursday closed; Friday and Saturday 5 PM to 10 PM; Sunday closed.",
    );
  });
});
