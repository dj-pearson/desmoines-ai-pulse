/** WEB-BE-071: the one age rule the menu section and MenuSchema share. */
import { describe, it, expect } from "vitest";
import { isMenuStale, menuAgeDays, MENU_STALE_AFTER_DAYS } from "@/lib/menuAge";

const NOW = new Date("2026-11-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("menuAge", () => {
  it("is 180 days", () => {
    expect(MENU_STALE_AFTER_DAYS).toBe(180);
  });

  it("keeps a menu at exactly 180 days and retires it the day after", () => {
    expect(menuAgeDays(daysAgo(180), NOW)).toBe(180);
    expect(isMenuStale(daysAgo(180), NOW)).toBe(false);
    expect(isMenuStale(daysAgo(181), NOW)).toBe(true);
  });

  it("treats a recent menu as current", () => {
    expect(isMenuStale(daysAgo(3), NOW)).toBe(false);
  });

  it("treats a missing or unreadable date as stale", () => {
    expect(menuAgeDays(null, NOW)).toBeNull();
    expect(isMenuStale(undefined, NOW)).toBe(true);
    expect(isMenuStale("not a date", NOW)).toBe(true);
  });
});
