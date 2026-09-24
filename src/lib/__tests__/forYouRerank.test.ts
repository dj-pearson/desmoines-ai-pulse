import { describe, it, expect } from 'vitest';
import { knownPicks, rerankByPicks, togglePick, matchingChips } from '@/lib/forYouRerank';

/** Home plan WP2 item 7: guest chips re-rank the trending rows client-side. */
const row = (title: string, category: string | null = null, venue: string | null = null) => ({
  title,
  category,
  venue,
});

describe('rerankByPicks', () => {
  const rows = [
    row('Trivia Night', 'Nightlife', 'Up-Down'),
    row('Free Family Movie in the Park', 'Family', 'Western Gateway Park'),
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
