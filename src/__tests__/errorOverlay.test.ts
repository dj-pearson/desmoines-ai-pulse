import { describe, it, expect, beforeEach } from 'vitest';

/**
 * WEB-QA-028. The overlay's two contracts, extracted from main.tsx's behaviour
 * so they can be asserted without booting the app.
 *
 * The defect was not the overlay existing - it was WHERE it existed and how it
 * accumulated. Gated on `isCapacitor`, it was suppressed in the production web
 * build and active in every shipped iOS and Android build. And it appended, so
 * WEB-QA-027 produced five stacked panels from one search and buried the first
 * and most useful error under its own repeats.
 */

/** The gate, transcribed from main.tsx. */
function overlayEnabled(env: { DEV: boolean; VITE_DEBUG_ERROR_OVERLAY?: string }) {
  return env.DEV || env.VITE_DEBUG_ERROR_OVERLAY === 'true';
}

/** The bounded, newest-first list the overlay renders. */
const MAX = 5;
function record(list: Array<{ message: string }>, message: string) {
  list.unshift({ message });
  list.length = Math.min(list.length, MAX);
  return list;
}

describe('where the overlay is allowed to appear', () => {
  it('is on in development with no flag', () => {
    expect(overlayEnabled({ DEV: true })).toBe(true);
  });

  it('is OFF in a production build that sets no flag - web or native', () => {
    // This is the whole fix: a store build sets nothing, so it gets nothing.
    // The old condition was `!isCapacitor && PROD`, which made native the one
    // place it always showed.
    expect(overlayEnabled({ DEV: false })).toBe(false);
  });

  it('is on in production only when the build opts in explicitly', () => {
    expect(overlayEnabled({ DEV: false, VITE_DEBUG_ERROR_OVERLAY: 'true' })).toBe(true);
  });

  it('treats any other value as off, including "1" and "TRUE"', () => {
    // A flag that half-matches is worse than no flag: it ships the panel to a
    // lane whose author thought they had turned it off.
    for (const value of ['1', 'TRUE', 'yes', '', 'false']) {
      expect(overlayEnabled({ DEV: false, VITE_DEBUG_ERROR_OVERLAY: value })).toBe(false);
    }
  });
});

describe('what it shows when several errors arrive', () => {
  let list: Array<{ message: string }>;
  beforeEach(() => { list = []; });

  it('keeps the most recent error first', () => {
    record(list, 'first');
    record(list, 'second');
    expect(list[0].message).toBe('second');
  });

  it('is bounded, so a render loop cannot grow it without limit', () => {
    for (let i = 0; i < 50; i++) record(list, `error ${i}`);
    expect(list.length).toBe(MAX);
    expect(list[0].message).toBe('error 49');
  });
});
