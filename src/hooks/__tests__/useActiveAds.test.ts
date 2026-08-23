import { describe, it, expect } from 'vitest';
import { isRenderable, type ActiveAd } from '@/hooks/useActiveAds';

/**
 * XPLAT-005 AC2 - the three surfaces have to agree on what counts as an ad.
 *
 * Android has filtered on CampaignAd.isRenderable since it shipped; web took
 * data[0] unconditionally and iOS required only non-nil ids, so a creative with
 * no title and no image drew an empty slot on two surfaces and was correctly
 * skipped on the third. An empty slot is worse than no slot: it takes layout
 * space, it logs an impression, and the advertiser is billed for it.
 *
 * These pin the shared rule. The equivalent Swift lives on
 * CampaignAdService.CampaignCreative.isRenderable and the Kotlin on
 * CampaignAd.isRenderable - if one of the three moves, this is where it shows.
 */
describe('isRenderable', () => {
  const base: ActiveAd = { campaign_id: 'c1', creative_id: 'cr1' };

  it('accepts a creative with a title and no image', () => {
    expect(isRenderable({ ...base, title: 'Half off at Noce' })).toBe(true);
  });

  it('accepts a creative with an image and no title', () => {
    expect(isRenderable({ ...base, image_url: 'https://example.com/a.png' })).toBe(true);
  });

  it('rejects a creative with neither', () => {
    // The case the other two surfaces used to render as an empty box.
    expect(isRenderable(base)).toBe(false);
  });

  it('treats whitespace as absent', () => {
    expect(isRenderable({ ...base, title: '   ', image_url: '  ' })).toBe(false);
  });

  it('rejects a row missing its campaign id', () => {
    // Nothing can be attributed or billed without it, so it must not render.
    expect(isRenderable({ ...base, campaign_id: '', title: 'Half off' })).toBe(false);
  });

  it('rejects a row missing its creative id', () => {
    expect(isRenderable({ ...base, creative_id: '', title: 'Half off' })).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isRenderable(null)).toBe(false);
    expect(isRenderable(undefined)).toBe(false);
  });

  it('picks the first renderable row rather than the first row', () => {
    // What the hook does with the RPC result. An unrenderable row ahead of a
    // good one used to mean no ad at all on web.
    const rows: ActiveAd[] = [
      { campaign_id: 'c1', creative_id: 'cr1' },
      { campaign_id: 'c2', creative_id: 'cr2', title: 'Live jazz tonight' },
    ];
    expect(rows.find(isRenderable)?.creative_id).toBe('cr2');
  });
});
