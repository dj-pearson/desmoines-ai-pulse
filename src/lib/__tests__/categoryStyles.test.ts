import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORY_STYLE,
  STATUS_BADGE,
  getEventCategoryStyle,
} from "@/lib/categoryStyles";

/**
 * WEB-UX-030 ratchet.
 *
 * Colour contrast was fixed once already, per-component, and drifted straight
 * back: an axe sweep on 2026-08-11 found 126 color-contrast nodes across
 * / /events /restaurants /pricing, of which the largest single block was the
 * music category badge (50 nodes of white on violet-500 at 4.23:1).
 *
 * The fix only holds if adding a category is what fails, not shipping it. So
 * this computes the real WCAG ratio for every value the map can return rather
 * than pinning the class strings — a future `bg-teal-500` fails here without
 * anyone having to remember the rule.
 */

/** Tailwind v3 palette, only the shades this map is allowed to reach for. */
const PALETTE: Record<string, string> = {
  "violet-400": "#a78bfa", "violet-500": "#8b5cf6", "violet-600": "#7c3aed", "violet-700": "#6d28d9",
  "orange-400": "#fb923c", "orange-500": "#f97316", "orange-600": "#ea580c", "orange-700": "#c2410c",
  "emerald-400": "#34d399", "emerald-500": "#10b981", "emerald-600": "#059669", "emerald-700": "#047857",
  "pink-400": "#f472b6", "pink-500": "#ec4899", "pink-600": "#db2777", "pink-700": "#be185d",
  "sky-400": "#38bdf8", "sky-500": "#0ea5e9", "sky-600": "#0284c7", "sky-700": "#0369a1",
  "green-400": "#4ade80", "green-500": "#22c55e", "green-600": "#16a34a", "green-700": "#15803d",
  "slate-300": "#cbd5e1", "slate-600": "#475569", "slate-700": "#334155",
  "blue-900": "#1e3a8a",
  "amber-500": "#f59e0b", "amber-600": "#d97706", "amber-700": "#b45309",
};

const WHITE = "#ffffff";
/** The dark card surface, --card in src/index.css: hsl(225 50% 8%). */
const DARK_CARD = "#0a0f1e";

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** "bg-violet-700" / "text-violet-700" / "dark:text-violet-400" -> hex. */
function resolve(utilityClass: string): string {
  const shade = utilityClass.replace(/^dark:/, "").replace(/^(bg|text)-/, "");
  const hex = PALETTE[shade];
  if (!hex) throw new Error(`${utilityClass} is not in the test palette — add it with its hex before using it`);
  return hex;
}

const AA = 4.5;

// One representative string per keyword group in EVENT_CATEGORY_STYLES, plus
// an unmatched one so the default is covered too.
const CATEGORIES = [
  "Music",
  "Food & Drink",
  "Sports",
  "Arts & Culture",
  "Family",
  "Outdoors",
  "Business",
  "Something With No Rule",
];

describe("event category styles meet WCAG AA", () => {
  it.each(CATEGORIES)("%s: white on the solid badge clears 4.5:1", (category) => {
    const { bg } = getEventCategoryStyle(category);
    // No exemption for the default. It used to be `bg-primary`, whose lightness
    // FLIPS between themes while the paired text stays literal white — which is
    // how 8 dark-mode nodes shipped at 3.23:1 (WEB-UX-030).
    expect(contrastRatio(WHITE, resolve(bg))).toBeGreaterThanOrEqual(AA);
  });

  it.each(CATEGORIES)("%s: the light text accent clears 4.5:1 on a white card", (category) => {
    const { text } = getEventCategoryStyle(category);
    const light = text.split(" ").find((c) => !c.startsWith("dark:"));
    if (!light || light === DEFAULT_CATEGORY_STYLE.text) return;
    expect(contrastRatio(resolve(light), WHITE)).toBeGreaterThanOrEqual(AA);
  });

  it.each(CATEGORIES)("%s: the dark text accent clears 4.5:1 on the dark card", (category) => {
    const { text } = getEventCategoryStyle(category);
    const dark = text.split(" ").find((c) => c.startsWith("dark:"));
    if (!dark) return;
    expect(contrastRatio(resolve(dark), DARK_CARD)).toBeGreaterThanOrEqual(AA);
  });
});

describe("status badges meet WCAG AA", () => {
  it.each(Object.entries(STATUS_BADGE))("%s: white on the badge clears 4.5:1", (_name, classes) => {
    const bg = classes.split(" ").find((c) => c.startsWith("bg-"))!;
    expect(contrastRatio(WHITE, resolve(bg))).toBeGreaterThanOrEqual(AA);
  });

  it("pairs every status badge with white text", () => {
    for (const classes of Object.values(STATUS_BADGE)) {
      expect(classes).toContain("text-white");
    }
  });
});
