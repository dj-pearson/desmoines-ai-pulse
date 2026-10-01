import { describe, it, expect } from 'vitest';
import {
  displayReason,
  forYouHeading,
  knownPicks,
  matchingChips,
  rerankByPicks,
  togglePick,
  unmatchedLine,
  withoutIds,
} from '@/lib/forYouRerank';

/** Home plan WP2 item 7 and pass-2 WP3 items 1, 6, 8. */
const row = (
  title: string,
  category: string | null = null,
  venue: string | null = null,
  extra: { price?: string | null; location?: string | null; city?: string | null } = {},
) => ({
  title,
  category,
  venue,
  ...extra,
});

describe('rerankByPicks', () => {
  const rows = [
    row('Trivia Night', 'Nightlife', 'Up-Down', { price: '$5' }),
    row('Free Family Movie in the Park', 'Family', 'Western Gateway Park', { price: 'Free' }),
    row('Jazz on the Patio', 'Music', 'Hoyt Sherman Place'),
    row('Beer Tasting', 'Food', 'Court Avenue Brewing'),
  ];

  it('returns the RPC order and no reasons when nothing is picked', () => {
    const out = rerankByPicks(rows, []);
    expect(out.map((r) => r.title)).toEqual(rows.map((r) => r.title));
    expect(out.every((r) => r.pickReason === null)).toBe(true);
  });

  it('moves matching rows up and says why', () => {
    const out = rerankByPicks(rows, ['free']);
    expect(out[0].title).toBe('Free Family Movie in the Park');
    expect(out[0].pickReason).toBe('Because you picked Free');
    expect(out.slice(1).every((r) => r.pickReason === null)).toBe(true);
  });

  it('is stable among ties and ranks multi-match rows first', () => {
    const out = rerankByPicks(rows, ['live-music', 'patio', 'family']);
    // Jazz on the Patio matches two picks; the family movie matches one.
    expect(out.map((r) => r.title).slice(0, 2)).toEqual([
      'Jazz on the Patio',
      'Free Family Movie in the Park',
    ]);
    expect(out.slice(2).map((r) => r.title)).toEqual(['Trivia Night', 'Beer Tasting']);
  });

  it('matches neighbourhood chips on the venue', () => {
    expect(matchingChips(row('Beer Tasting', 'Food', 'Court Avenue Brewing'), ['east-village'])).toHaveLength(1);
    expect(matchingChips(row('Show', null, 'Wells Fargo Arena'), ['downtown'])).toHaveLength(1);
  });

  it('does not guess Free from a missing price', () => {
    expect(matchingChips(row('Trivia Night', 'Nightlife', null), ['free'])).toHaveLength(0);
  });

  it('decides Free from the price, the same test as the Free badge', () => {
    // The title says free, the price says otherwise: the price wins.
    expect(matchingChips(row('Free Beer Friday', null, null, { price: '$15' }), ['free'])).toHaveLength(0);
    // A title that says nothing, a price that says free.
    expect(matchingChips(row('Gallery Night', null, null, { price: 'FREE admission' }), ['free'])).toHaveLength(1);
    expect(matchingChips(row('Gallery Night', null, null, { price: '$0' }), ['free'])).toHaveLength(1);
    // A range that starts at zero is not free.
    expect(matchingChips(row('Gallery Night', null, null, { price: '$0-$25' }), ['free'])).toHaveLength(0);
  });

  it('matches area chips on location and city, not only the venue', () => {
    expect(
      matchingChips(row('Show', null, 'Fixture Hall', { location: '400 Court Avenue' }), ['east-village']),
    ).toHaveLength(1);
    expect(matchingChips(row('Show', null, null, { city: 'Downtown Des Moines' }), ['east-village'])).toHaveLength(1);
    // A title mentioning the area is not a location.
    expect(matchingChips(row('East Village Pub Crawl Recap', null, 'Ankeny Hall'), ['east-village'])).toHaveLength(0);
  });

  it('survives null fields', () => {
    const out = rerankByPicks([{ title: null, category: null, venue: null }], ['free']);
    expect(out[0].pickReason).toBeNull();
  });
});

describe('pick helpers', () => {
  it('ignores stored tags this module does not own', () => {
    expect(knownPicks(['free', 'something-else', 'downtown'])).toEqual(['free', 'downtown']);
  });

  it('toggles a pick and preserves foreign tags', () => {
    expect(togglePick(['other', 'free'], 'free')).toEqual(['other']);
    expect(togglePick(['other'], 'patio')).toEqual(['other', 'patio']);
    expect(togglePick(undefined, 'patio')).toEqual(['patio']);
  });
});

describe('forYouHeading', () => {
  const plain = { pickReason: null };

  it('says "Coming up" when the rows carry no trending scores', () => {
    const out = forYouHeading({ source: 'trending', picks: [], rows: [plain, plain, plain] });
    expect(out).toEqual({ title: 'Coming up', unmatched: [] });
  });

  it('says "Trending" only with at least three scored rows', () => {
    const two = [{ ...plain, trending_score: 5 }, { ...plain, trending_score: 2 }, { ...plain, trending_score: 0 }];
    expect(forYouHeading({ source: 'trending', picks: [], rows: two }).title).toBe('Coming up');
    const three = [...two.slice(0, 2), { ...plain, trending_score: 1 }];
    expect(forYouHeading({ source: 'trending', picks: [], rows: three }).title).toBe('Trending');
  });

  it('says "For you" only when a pick matched a row', () => {
    const matched = forYouHeading({
      source: 'trending',
      picks: ['free'],
      rows: [{ pickReason: 'Because you picked Free' }, plain],
    });
    expect(matched).toEqual({ title: 'For you', unmatched: [] });

    const missed = forYouHeading({ source: 'trending', picks: ['family'], rows: [plain, plain] });
    expect(missed.title).toBe('Coming up');
    expect(missed.unmatched.map((c) => c.id)).toEqual(['family']);
    expect(unmatchedLine(missed.unmatched)).toBe('Nothing coming up matches Family yet');
    expect(missed.unmatched[0].hub).toBe('/events/kids');
  });

  it('keeps "For you" for the personalized source', () => {
    expect(forYouHeading({ source: 'for-you', picks: [], rows: [plain] }).title).toBe('For you');
  });

  it('says nothing about picks on an empty rail', () => {
    expect(forYouHeading({ source: 'trending', picks: ['free'], rows: [] }).unmatched).toEqual([]);
  });
});

describe('displayReason', () => {
  it('prefers the pick reason', () => {
    expect(displayReason({ pickReason: 'Because you picked Free', recommendation_reason: 'x' }, 'For you')).toBe(
      'Because you picked Free',
    );
  });

  it('hides a reason that repeats the heading or describes a paid boost', () => {
    expect(displayReason({ pickReason: null, recommendation_reason: 'Trending now' }, 'Trending')).toBeNull();
    expect(displayReason({ pickReason: null, recommendation_reason: 'For you' }, 'For you')).toBeNull();
    expect(displayReason({ pickReason: null, recommendation_reason: 'Featured this week' }, 'For you')).toBeNull();
    expect(displayReason({ pickReason: null, recommendation_reason: 'Coming up soon' }, 'For you')).toBe(
      'Coming up soon',
    );
  });
});

describe('withoutIds', () => {
  it('drops ids another section shows and keeps order', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(withoutIds(rows, new Set(['b'])).map((r) => r.id)).toEqual(['a', 'c']);
    expect(withoutIds(rows, new Set()).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
