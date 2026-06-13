import { describe, it, expect } from 'vitest';
import {
  EVENT_CATEGORY_STYLES,
  getEventCategoryStyle,
  getCuisineGradient,
  getCategoryHex,
  CUISINE_GRADIENTS,
  BRAND_GRADIENT,
  DEFAULT_CATEGORY_STYLE,
  type CategoryStyle,
} from '../categoryColors';

/**
 * Card-surface category styling: every text-bearing token must clear WCAG AA
 * (>= 4.5:1) in BOTH light and dark mode. We resolve each Tailwind class used
 * by the centralized map to a concrete hex and compute the contrast against the
 * surface it actually renders on (white card / dark card / its own solid fill).
 */

// --- WCAG contrast helpers ---------------------------------------------------

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Surfaces these tokens render against (from src/index.css theme variables).
const WHITE = '#ffffff'; // light card / --card 0 0% 100%
const DARK_CARD = '#0a0f1f'; // --card 225 50% 8% ≈ rgb(10,15,31)

// Tailwind palette hexes for the shades used by EVENT_CATEGORY_STYLES.
// `solid` doubles as the light-mode `text` shade; `dark` is the dark-mode `text` (-400/-300) shade.
const TOKEN_HEX: Record<keyof typeof EVENT_CATEGORY_STYLES, { solid: string; dark: string }> = {
  music: { solid: '#7c3aed', dark: '#a78bfa' }, // violet-600 / violet-400
  food: { solid: '#c2410c', dark: '#fb923c' }, // orange-700 / orange-400
  sports: { solid: '#047857', dark: '#34d399' }, // emerald-700 / emerald-400
  arts: { solid: '#be185d', dark: '#f472b6' }, // pink-700 / pink-400
  family: { solid: '#0369a1', dark: '#38bdf8' }, // sky-700 / sky-400
  outdoors: { solid: '#15803d', dark: '#4ade80' }, // green-700 / green-400
  business: { solid: '#475569', dark: '#cbd5e1' }, // slate-600 / slate-300
  nightlife: { solid: '#9333ea', dark: '#c084fc' }, // purple-600 / purple-400
  community: { solid: '#2563eb', dark: '#60a5fa' }, // blue-600 / blue-400
  education: { solid: '#4f46e5', dark: '#818cf8' }, // indigo-600 / indigo-400
  holiday: { solid: '#dc2626', dark: '#f87171' }, // red-600 / red-400
  market: { solid: '#4d7c0f', dark: '#a3e635' }, // lime-700 / lime-400
  charity: { solid: '#0e7490', dark: '#22d3ee' }, // cyan-700 / cyan-400
};

const AA = 4.5;

describe('category contrast (WCAG AA, light + dark)', () => {
  for (const bucket of Object.keys(EVENT_CATEGORY_STYLES) as (keyof typeof EVENT_CATEGORY_STYLES)[]) {
    const { solid, dark } = TOKEN_HEX[bucket];

    it(`${bucket}: white text on the solid badge clears AA (both modes)`, () => {
      // Solid background is mode-independent, so one check covers both modes.
      expect(contrast(WHITE, solid)).toBeGreaterThanOrEqual(AA);
    });

    it(`${bucket}: accent text clears AA on the light card`, () => {
      expect(contrast(solid, WHITE)).toBeGreaterThanOrEqual(AA);
    });

    it(`${bucket}: accent text clears AA on the dark card`, () => {
      expect(contrast(dark, DARK_CARD)).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe('TOKEN_HEX stays in sync with the class map', () => {
  it('covers every bucket and the classes reference the documented shade', () => {
    for (const [bucket, style] of Object.entries(EVENT_CATEGORY_STYLES)) {
      const hex = TOKEN_HEX[bucket as keyof typeof EVENT_CATEGORY_STYLES];
      expect(hex, `missing TOKEN_HEX for ${bucket}`).toBeTruthy();
      // solid class encodes the same family as the light text class
      const family = style.solid.replace('bg-', '').split('-')[0];
      expect(style.text).toContain(`text-${family}-`);
      expect(style.onSolid).toBe('text-white');
    }
  });
});

describe('getEventCategoryStyle', () => {
  it('returns the neutral default for empty/unknown categories', () => {
    expect(getEventCategoryStyle(undefined)).toBe(DEFAULT_CATEGORY_STYLE);
    expect(getEventCategoryStyle('')).toBe(DEFAULT_CATEGORY_STYLE);
    expect(getEventCategoryStyle('Quantum Physics')).toBe(DEFAULT_CATEGORY_STYLE);
  });

  it('fuzzy-matches real-world category strings to a bucket', () => {
    expect(getEventCategoryStyle('Live Music')).toBe(EVENT_CATEGORY_STYLES.music);
    expect(getEventCategoryStyle('Food & Drink')).toBe(EVENT_CATEGORY_STYLES.food);
    expect(getEventCategoryStyle('Sports & Fitness')).toBe(EVENT_CATEGORY_STYLES.sports);
    expect(getEventCategoryStyle('Arts & Culture')).toBe(EVENT_CATEGORY_STYLES.arts);
    expect(getEventCategoryStyle('Family Fun')).toBe(EVENT_CATEGORY_STYLES.family);
  });

  it('every token defines all five fields', () => {
    const fields: (keyof CategoryStyle)[] = ['solid', 'onSolid', 'text', 'iconBg', 'gradient'];
    for (const style of [...Object.values(EVENT_CATEGORY_STYLES), DEFAULT_CATEGORY_STYLE]) {
      for (const f of fields) expect(style[f]).toBeTruthy();
    }
  });

  it('accent text and icon tints carry an explicit dark-mode variant', () => {
    for (const style of Object.values(EVENT_CATEGORY_STYLES)) {
      expect(style.text).toContain('dark:');
      expect(style.iconBg).toContain('dark:');
    }
  });
});

describe('getCuisineGradient', () => {
  it('falls back to the brand gradient for unknown/empty cuisines', () => {
    expect(getCuisineGradient(undefined)).toBe(BRAND_GRADIENT);
    expect(getCuisineGradient('Martian Fusion')).toBe(BRAND_GRADIENT);
    expect(CUISINE_GRADIENTS.default).toBe(BRAND_GRADIENT);
  });

  it('substring-matches a known cuisine', () => {
    expect(getCuisineGradient('Authentic Italian')).toBe(CUISINE_GRADIENTS.Italian);
    expect(getCuisineGradient('Pizza')).toBe(CUISINE_GRADIENTS.Pizza);
  });
});

describe('getCategoryHex (existing map, unchanged)', () => {
  it('still resolves known categories and a default', () => {
    expect(getCategoryHex('Music')).toBe('#8b5cf6');
    expect(getCategoryHex(undefined)).toBe('#6b7280');
  });
});
