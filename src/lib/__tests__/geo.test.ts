import { describe, it, expect } from 'vitest';
import { haversineDistance, isWithinRadius, sortByDistance, distanceScore, DES_MOINES_CENTER } from '../geo';

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    const point = { latitude: 41.5868, longitude: -93.625 };
    expect(haversineDistance(point, point)).toBeCloseTo(0, 5);
  });

  it('calculates distance between Des Moines and Ames (~30 miles)', () => {
    const desMoines = { latitude: 41.5868, longitude: -93.625 };
    const ames = { latitude: 42.0308, longitude: -93.6319 };
    const distance = haversineDistance(desMoines, ames);
    // Ames is approximately 30 miles north of Des Moines
    expect(distance).toBeGreaterThan(28);
    expect(distance).toBeLessThan(35);
  });

  it('calculates distance in kilometers', () => {
    const desMoines = { latitude: 41.5868, longitude: -93.625 };
    const ames = { latitude: 42.0308, longitude: -93.6319 };
    const distMiles = haversineDistance(desMoines, ames, 'miles');
    const distKm = haversineDistance(desMoines, ames, 'km');
    // 1 mile ~ 1.609 km
    expect(distKm / distMiles).toBeCloseTo(1.609, 1);
  });

  it('calculates a known long distance (Des Moines to Chicago ~300 miles)', () => {
    const desMoines = { latitude: 41.5868, longitude: -93.625 };
    const chicago = { latitude: 41.8781, longitude: -87.6298 };
    const distance = haversineDistance(desMoines, chicago);
    expect(distance).toBeGreaterThan(290);
    expect(distance).toBeLessThan(340);
  });
});

describe('isWithinRadius', () => {
  it('returns true for a point within the radius', () => {
    const center = { latitude: 41.5868, longitude: -93.625 };
    const nearby = { latitude: 41.59, longitude: -93.63 };
    expect(isWithinRadius(center, nearby, 5)).toBe(true);
  });

  it('returns false for a point outside the radius', () => {
    const center = { latitude: 41.5868, longitude: -93.625 };
    const farAway = { latitude: 42.0308, longitude: -93.6319 }; // Ames
    expect(isWithinRadius(center, farAway, 5)).toBe(false);
  });
});

describe('sortByDistance', () => {
  it('sorts items by distance from a reference point', () => {
    const items = [
      { name: 'Ames', latitude: 42.0308, longitude: -93.6319 },
      { name: 'Downtown', latitude: 41.587, longitude: -93.626 },
      { name: 'Ankeny', latitude: 41.7296, longitude: -93.6053 },
    ];
    const sorted = sortByDistance(items, DES_MOINES_CENTER);
    expect(sorted[0]!.name).toBe('Downtown');
    expect(sorted[1]!.name).toBe('Ankeny');
    expect(sorted[2]!.name).toBe('Ames');
  });

  it('places items without coordinates at the end', () => {
    const items = [
      { name: 'NoCoords', latitude: null, longitude: null },
      { name: 'Downtown', latitude: 41.587, longitude: -93.626 },
    ];
    const sorted = sortByDistance(items, DES_MOINES_CENTER);
    expect(sorted[0]!.name).toBe('Downtown');
    expect(sorted[1]!.name).toBe('NoCoords');
  });
});

describe('distanceScore', () => {
  it('returns max score for distance 0', () => {
    expect(distanceScore(0)).toBeCloseTo(30, 0);
  });

  it('returns 0 for distance at or beyond max', () => {
    expect(distanceScore(25)).toBe(0);
    expect(distanceScore(30)).toBe(0);
  });

  it('returns higher scores for closer distances', () => {
    const score1 = distanceScore(1);
    const score5 = distanceScore(5);
    const score10 = distanceScore(10);
    expect(score1).toBeGreaterThan(score5);
    expect(score5).toBeGreaterThan(score10);
  });

  it('respects custom max distance and score', () => {
    const score = distanceScore(0, 50, 100);
    expect(score).toBeCloseTo(100, 0);
  });
});
