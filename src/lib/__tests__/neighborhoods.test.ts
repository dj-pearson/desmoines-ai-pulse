import { describe, it, expect } from 'vitest';
import {
  NEIGHBORHOODS,
  NEIGHBORHOOD_ROUTES,
  NEIGHBORHOOD_MIN_ITEMS,
  findNeighborhood,
} from '@/lib/neighborhoods';

/**
 * WEB-SEO-036. scripts/check-neighborhood-inventory.mjs holds the inventory in
 * step with the prerender routes and the sitemap. These cover what that script
 * cannot see: that each entry is actually usable by the page and the query.
 */
describe('neighborhood inventory', () => {
  it('has unique slugs', () => {
    const slugs = NEIGHBORHOODS.map((n) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses URL-safe slugs', () => {
    for (const n of NEIGHBORHOODS) {
      expect(n.slug, n.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('gives every entry the editorial copy the page renders', () => {
    // The defect this story is about: three slugs were prerendered and
    // sitemapped with NO entry at all, so `currentNeighborhood` was undefined
    // and every field fell through to a generic sentence. An entry that exists
    // but is half-empty is the same page with extra steps.
    for (const n of NEIGHBORHOODS) {
      expect(n.name, n.slug).toBeTruthy();
      expect(n.description.length, n.slug).toBeGreaterThan(20);
      expect(n.detailedDescription.length, n.slug).toBeGreaterThan(100);
      expect(n.bestFor, n.slug).toBeTruthy();
      expect(n.highlights.length, n.slug).toBeGreaterThanOrEqual(2);
      expect(n.zipCodes.length, n.slug).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every entry at least one term to match content on', () => {
    // matchTerms drives the only query on the page. An empty list is a
    // permanently thin page that noindexes itself and nobody notices.
    for (const n of NEIGHBORHOODS) {
      expect(n.matchTerms.length, n.slug).toBeGreaterThanOrEqual(1);
      for (const term of n.matchTerms) expect(term.trim(), n.slug).toBeTruthy();
    }
  });

  it('carries no unsourced demographic figures', () => {
    // Every entry used to end with "Population 68,723 | Median household income
    // $82,492 | 23% families with children under 18" and no source exists for
    // any of it. Same class as WEB-BE-053.
    const blob = JSON.stringify(NEIGHBORHOODS);
    expect(blob).not.toMatch(/Median household income/i);
    expect(blob).not.toMatch(/Population [\d,]+/);
  });

  it('exposes the prerendered routes in /neighborhoods/<slug> form', () => {
    expect(NEIGHBORHOOD_ROUTES.length).toBeGreaterThan(0);
    for (const route of NEIGHBORHOOD_ROUTES) {
      expect(route).toMatch(/^\/neighborhoods\/[a-z0-9-]+$/);
      expect(findNeighborhood(route.split('/').pop())).toBeDefined();
    }
  });

  it('resolves a known slug and refuses everything else', () => {
    expect(findNeighborhood('east-village')?.name).toBe('East Village');
    // The three that were sitemapped with no content. They must NOT resolve -
    // the page answers them with noindex and a link to the hub.
    expect(findNeighborhood('downtown')).toBeUndefined();
    expect(findNeighborhood('beaverdale')).toBeUndefined();
    expect(findNeighborhood('highland-park')).toBeUndefined();
    expect(findNeighborhood(undefined)).toBeUndefined();
    expect(findNeighborhood('')).toBeUndefined();
  });

  it('sets a thin-content threshold above zero', () => {
    // A threshold of 0 would make the gate inert while still looking present -
    // the green-check-that-measures-nothing shape.
    expect(NEIGHBORHOOD_MIN_ITEMS).toBeGreaterThan(0);
  });
});
