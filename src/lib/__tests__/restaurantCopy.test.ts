import { describe, expect, it } from "vitest";
import { aiCopyIsFresh, aiGeneratedLine, descriptionSourceLabel } from "@/lib/restaurantCopy";

const NOW = new Date("2026-11-21T18:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("restaurantCopy (WEB-BE-077)", () => {
  it("labels each known description source and nothing for unknown", () => {
    expect(descriptionSourceLabel("google")).toBe("From Google");
    expect(descriptionSourceLabel("restaurant")).toBe("From the restaurant");
    expect(descriptionSourceLabel("ai")).toBe("AI-assisted");
    expect(descriptionSourceLabel(null)).toBeNull();
    expect(descriptionSourceLabel("scraped")).toBeNull();
  });

  it("hides dated AI copy older than a year, keeps newer and undated", () => {
    expect(aiCopyIsFresh(daysAgo(364), NOW)).toBe(true);
    expect(aiCopyIsFresh(daysAgo(366), NOW)).toBe(false);
    expect(aiCopyIsFresh(null, NOW)).toBe(true);
  });

  it("says when AI copy was generated, or that it was not recorded", () => {
    expect(aiGeneratedLine("2026-11-21T18:00:00Z")).toBe("Generated Nov 21, 2026");
    expect(aiGeneratedLine(null)).toBe("Generation date not recorded");
  });
});
