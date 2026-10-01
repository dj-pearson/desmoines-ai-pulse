import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatMetricNumber, hasReportableSample, MIN_DATA_DAYS } from "@/components/advertising/PlatformMetrics";

/**
 * WEB-ADS-012 AC4. Two things are being pinned, and the second matters more.
 *
 * The formatter, because K/M rounding is where a reach figure quietly gains a
 * digit.
 *
 * And the absence of invented numbers. This block used to fall back to
 * hardcoded impressions, clicks and a CTR whenever the Search Console sync had
 * produced nothing - which is always, since it has never run - and marked them
 * with an asterisk reading "sync pending". They were shown under "Platform
 * Reach" and "Real audience data" to people deciding what to spend. A test
 * that only checked the formatter would have passed throughout.
 */
describe("formatMetricNumber", () => {
  it("leaves small numbers alone", () => {
    expect(formatMetricNumber(0)).toBe("0");
    expect(formatMetricNumber(42)).toBe("42");
    expect(formatMetricNumber(999)).toBe("999");
  });

  it("switches to K at a thousand and M at a million", () => {
    expect(formatMetricNumber(1_000)).toBe("1.0K");
    expect(formatMetricNumber(12_400)).toBe("12.4K");
    expect(formatMetricNumber(999_999)).toBe("1000.0K");
    expect(formatMetricNumber(1_000_000)).toBe("1.0M");
    expect(formatMetricNumber(2_450_000)).toBe("2.5M");
  });

  it("never rounds a reach figure upward past its true value", () => {
    // toFixed works on the binary double, and 1.45 is stored a hair BELOW
    // 1.45, so 1450 formats as "1.4K" rather than "1.5K". I expected 1.5 and
    // the test caught me, not the code. Understating is the right direction
    // for a number an advertiser is sizing a spend against, so this pins the
    // behaviour as it is rather than "correcting" it.
    expect(formatMetricNumber(1_449)).toBe("1.4K");
    expect(formatMetricNumber(1_450)).toBe("1.4K");
    expect(formatMetricNumber(1_451)).toBe("1.5K");
    expect(Number(formatMetricNumber(12_449).replace("K", "")) * 1000).toBeLessThanOrEqual(12_449);
  });

  it("groups thousands below the K threshold", () => {
    expect(formatMetricNumber(999)).toBe("999");
  });
});

describe("hasReportableSample", () => {
  it("is false with no data at all", () => {
    expect(hasReportableSample(null)).toBe(false);
  });

  it("is false below the minimum window, however large the numbers", () => {
    expect(
      hasReportableSample({ monthly_impressions: 90_000, monthly_clicks: 8_000, avg_ctr: 9, data_days: MIN_DATA_DAYS - 1 }),
    ).toBe(false);
  });

  it("is false when the window is long but nothing was measured in it", () => {
    expect(
      hasReportableSample({ monthly_impressions: 0, monthly_clicks: 0, avg_ctr: 0, data_days: 30 }),
    ).toBe(false);
  });

  it("is true once there is a real sample", () => {
    expect(
      hasReportableSample({ monthly_impressions: 4_200, monthly_clicks: 310, avg_ctr: 7.4, data_days: MIN_DATA_DAYS }),
    ).toBe(true);
  });
});

describe("no invented numbers reach an advertiser", () => {
  const SOURCE = readFileSync("src/components/advertising/PlatformMetrics.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");

  it("has no hardcoded fallback metrics", () => {
    // The three that shipped, and the shape of any replacement for them.
    expect(SOURCE).not.toMatch(/:\s*12400\b/);
    expect(SOURCE).not.toMatch(/:\s*980\b/);
    expect(SOURCE).not.toMatch(/:\s*7\.9\b/);
    expect(SOURCE).not.toMatch(/\?\?\s*[1-9]\d{2,}/);
  });

  it("does not present search data as audience reach", () => {
    expect(SOURCE).not.toContain("Platform Reach");
    expect(SOURCE).not.toContain("Real audience data");
    expect(SOURCE).toContain("Search Impressions");
  });
});
