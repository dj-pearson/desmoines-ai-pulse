import { describe, it, expect } from 'vitest';
import { buildEventOffers } from '../eventOffers';

describe('buildEventOffers', () => {
  describe('unknown prices are omitted, never zeroed', () => {
    // The 25-of-30 case measured on the live /events page.
    it.each(['Varies', 'See website', 'Tickets at door', 'TBD', 'Call venue'])(
      'omits both keys for %s',
      (price) => {
        expect(buildEventOffers(price)).toEqual({});
      },
    );

    it('omits both keys for null, undefined and whitespace', () => {
      expect(buildEventOffers(null)).toEqual({});
      expect(buildEventOffers(undefined)).toEqual({});
      expect(buildEventOffers('   ')).toEqual({});
    });

    it('never emits isAccessibleForFree:false beside a zero price', () => {
      // The self-contradicting node this module was written to stop.
      for (const price of ['Varies', 'See website', '$0', 'Free', '$25']) {
        const { offers, isAccessibleForFree } = buildEventOffers(price);
        const p = offers && (offers as Record<string, unknown>).price;
        if (p === '0') expect(isAccessibleForFree).toBe(true);
      }
    });
  });

  describe('a real zero survives as a zero', () => {
    // Counter-assertion: swapping a false zero for a false gap is the same bug
    // facing the other way.
    it.each(['Free', 'free', 'FREE', 'Free admission', 'No charge'])(
      'reports %s as a priced-zero free event',
      (price) => {
        const r = buildEventOffers(price);
        expect(r.isAccessibleForFree).toBe(true);
        expect(r.offers).toMatchObject({ '@type': 'Offer', price: '0' });
      },
    );

    it('treats an explicit $0 as free', () => {
      const r = buildEventOffers('$0');
      expect(r.isAccessibleForFree).toBe(true);
      expect(r.offers).toMatchObject({ price: '0' });
    });
  });

  describe('ranges become AggregateOffer, not a mashed number', () => {
    it('does not concatenate the two halves of a range', () => {
      // $54.40-$89.40 shipped live as price "54.4089.40".
      const r = buildEventOffers('$54.40-$89.40');
      expect(JSON.stringify(r)).not.toContain('54.4089.40');
      expect(r.offers).toMatchObject({
        '@type': 'AggregateOffer',
        lowPrice: '54.40',
        highPrice: '89.40',
      });
      expect(r.isAccessibleForFree).toBe(false);
    });

    it.each([
      ['$44.40-$104.40', '44.40', '104.40'],
      ['$31.40 - $81.40', '31.40', '81.40'],
      ['$15 to $40', '15', '40'],
      ['$1,200-$2,400', '1200', '2400'],
    ])('parses %s', (price, low, high) => {
      expect(buildEventOffers(price).offers).toMatchObject({
        '@type': 'AggregateOffer',
        lowPrice: low,
        highPrice: high,
      });
    });

    it('reports a free tier alongside a paid one', () => {
      const r = buildEventOffers('Free - $20');
      expect(r.offers).toMatchObject({ lowPrice: '0', highPrice: '20' });
      expect(r.isAccessibleForFree).toBe(true);
    });

    it('collapses a range whose ends match into a single Offer', () => {
      expect(buildEventOffers('$25-$25').offers).toMatchObject({
        '@type': 'Offer',
        price: '25',
      });
    });
  });

  describe('single prices', () => {
    it.each([
      ['$25', '25'],
      ['25', '25'],
      ['$12.50', '12.50'],
      ['Admission $8', '8'],
    ])('parses %s to %s', (price, expected) => {
      const r = buildEventOffers(price);
      expect(r.offers).toMatchObject({ '@type': 'Offer', price: expected });
      expect(r.isAccessibleForFree).toBe(false);
    });
  });

  describe('optional offer metadata', () => {
    it('omits url, validFrom and seller when not supplied', () => {
      const offers = buildEventOffers('$25').offers as Record<string, unknown>;
      expect(offers).not.toHaveProperty('url');
      expect(offers).not.toHaveProperty('validFrom');
      expect(offers).not.toHaveProperty('seller');
    });

    it('carries them through when supplied', () => {
      const offers = buildEventOffers('$25', {
        url: 'https://example.com/tickets',
        validFrom: '2026-08-01T00:00:00Z',
        sellerName: 'Val Air Ballroom',
      }).offers as Record<string, unknown>;
      expect(offers.url).toBe('https://example.com/tickets');
      expect(offers.validFrom).toBe('2026-08-01T00:00:00Z');
      expect(offers.seller).toEqual({
        '@type': 'Organization',
        name: 'Val Air Ballroom',
      });
    });

    it('does not attach metadata to an omitted offer', () => {
      expect(buildEventOffers('Varies', { url: 'https://example.com' })).toEqual({});
    });
  });

  it('always emits a plain decimal string, never a symbol or comma', () => {
    // Assert on the price VALUES. Serialising the whole object and scanning it
    // matches JSON's own commas, which is a check that can never pass.
    for (const price of ['$1,200', '$54.40-$89.40', 'Free', '$8', '$12.50']) {
      const offers = (buildEventOffers(price).offers ?? {}) as Record<string, unknown>;
      const values = [offers.price, offers.lowPrice, offers.highPrice].filter(
        (v): v is string => typeof v === 'string',
      );
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect(v).toMatch(/^\d+(\.\d{2})?$/);
    }
  });
});
