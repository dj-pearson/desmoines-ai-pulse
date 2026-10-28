import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { getThemeLabel, orderThemes } from '@/hooks/useItineraries';

describe('itinerary themes', () => {
  it('puts known themes in THEME_ORDER and keeps unknown ones after them', () => {
    expect(orderThemes(['family', 'brewery-crawl', 'general', 'night-life'])).toEqual([
      'general',
      'family',
      'brewery-crawl',
      'night-life',
    ]);
  });

  it('labels an unknown theme as words', () => {
    expect(getThemeLabel('brewery-crawl')).toBe('Brewery Crawl');
    expect(getThemeLabel('food-drink')).not.toBe('food-drink');
  });
});
