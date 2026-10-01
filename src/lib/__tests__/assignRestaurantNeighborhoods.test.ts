import { describe, expect, it } from 'vitest';
import { fallbackCoordinates, streetAddress } from '../../../scripts/assign-restaurant-neighborhoods';

const row = (id: string, location: string, latitude = 41.6, longitude = -93.8) => ({
  id,
  name: id,
  location,
  cuisine: null,
  latitude,
  longitude,
});

describe('assign-restaurant-neighborhoods fallback detection (SEO-061)', () => {
  it('reads suites in one building as one street address', () => {
    expect(streetAddress('9250 University Ave Unit 107, West Des Moines, IA 50266, USA')).toBe('9250 university ave');
    expect(streetAddress('9250 University Ave Suite 101, West Des Moines, IA 50266, USA')).toBe('9250 university ave');
    expect(streetAddress('1225 Copper Creek Drive, Pleasant Hill, IA')).toBe('1225 copper creek dr');
  });

  it('does not treat several suites at one building point as a fallback', () => {
    const rows = [
      row('a', '9250 University Ave Unit 107, West Des Moines, IA 50266, USA'),
      row('b', '9250 University Ave Suite 101, West Des Moines, IA 50266, USA'),
      row('c', '9250 University Ave Suite 117, West Des Moines, IA 50266, USA'),
    ];
    expect(fallbackCoordinates(rows).size).toBe(0);
  });

  it('flags a point shared by different streets', () => {
    const rows = [
      row('a', '316 Court Ave, Des Moines, IA 50309, USA'),
      row('b', '340 SW 3rd St, Des Moines, IA 50309, USA'),
      row('c', 'Des Moines, IA'),
    ];
    expect([...fallbackCoordinates(rows)]).toEqual(['41.6000,-93.8000']);
  });

  it('flags a point shared by rows with no street address', () => {
    const rows = [row('a', 'Des Moines, IA'), row('b', 'Des Moines, IA'), row('c', 'Des Moines, IA')];
    expect(fallbackCoordinates(rows).size).toBe(1);
  });

  it('leaves a lone row without a street number alone', () => {
    expect(fallbackCoordinates([row('a', 'Valley Junction, West Des Moines, IA')]).size).toBe(0);
  });
});
