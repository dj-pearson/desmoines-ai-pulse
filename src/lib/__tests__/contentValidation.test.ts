import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  isValidPhone,
  formatPhone,
  isValidEmail,
  isValidEventDate,
  isValidImageUrl,
  validateEvent,
  validateRestaurant,
} from '../contentValidation';

describe('isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects empty, null, and non-http protocols', () => {
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl(undefined)).toBe(false);
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts 10 and 11 digit numbers regardless of formatting', () => {
    expect(isValidPhone('(515) 555-1234')).toBe(true);
    expect(isValidPhone('15155551234')).toBe(true);
    expect(isValidPhone('515.555.1234')).toBe(true);
  });

  it('rejects too short / too long / empty', () => {
    expect(isValidPhone('555-1234')).toBe(false);
    expect(isValidPhone('1234567890123')).toBe(false);
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('formatPhone', () => {
  it('formats 10-digit numbers', () => {
    expect(formatPhone('5155551234')).toBe('(515) 555-1234');
  });

  it('formats 11-digit numbers leading with 1', () => {
    expect(formatPhone('15155551234')).toBe('+1 (515) 555-1234');
  });

  it('returns input unchanged when not 10/11 digits', () => {
    expect(formatPhone('12345')).toBe('12345');
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co')).toBe(true);
  });

  it('rejects malformed addresses and empty', () => {
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user example.com')).toBe(false);
    expect(isValidEmail('user@example')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('isValidEventDate', () => {
  it('accepts a near-future date', () => {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 1);
    expect(isValidEventDate(soon)).toBe(true);
  });

  it('accepts a date within the last year', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 6);
    expect(isValidEventDate(recent)).toBe(true);
  });

  it('rejects very old dates and empty values', () => {
    expect(isValidEventDate('2000-01-01')).toBe(false);
    expect(isValidEventDate(null)).toBe(false);
    expect(isValidEventDate(undefined)).toBe(false);
  });
});

describe('isValidImageUrl', () => {
  it('accepts image extensions and known hosts', () => {
    expect(isValidImageUrl('https://example.com/pic.jpg')).toBe(true);
    expect(isValidImageUrl('https://example.com/pic.png?w=100')).toBe(true);
    expect(isValidImageUrl('https://images.unsplash.com/photo-123')).toBe(true);
  });

  it('rejects non-image URLs and invalid URLs', () => {
    expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
    expect(isValidImageUrl('not-a-url')).toBe(false);
    expect(isValidImageUrl(null)).toBe(false);
  });
});

describe('validateEvent', () => {
  const goodEvent = {
    title: 'Jazz Night at the Civic Center',
    venue: 'Des Moines Civic Center',
    date: (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    })(),
    location: 'Downtown Des Moines',
    category: 'Music',
    image_url: 'https://images.unsplash.com/photo-1',
    original_description: 'A great evening of live jazz.',
  };

  it('marks a complete event valid with high confidence', () => {
    const report = validateEvent(goodEvent);
    expect(report.isValid).toBe(true);
    expect(report.criticalErrors).toBe(0);
    expect(report.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(report.autoApprovalRecommended).toBe(true);
  });

  it('flags missing required fields as critical errors', () => {
    const report = validateEvent({});
    expect(report.isValid).toBe(false);
    expect(report.criticalErrors).toBeGreaterThan(0);
    const fields = report.results.map((r) => r.field);
    expect(fields).toContain('title');
    expect(fields).toContain('venue');
    expect(fields).toContain('date');
  });

  it('clamps confidence score to the 0-100 range', () => {
    const report = validateEvent({});
    expect(report.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(report.confidenceScore).toBeLessThanOrEqual(100);
  });

  it('warns on a generic title', () => {
    const report = validateEvent({ ...goodEvent, title: 'concert' });
    const titleWarn = report.results.find(
      (r) => r.field === 'title' && r.message.includes('generic')
    );
    expect(titleWarn).toBeDefined();
  });
});

describe('validateRestaurant', () => {
  it('returns a report object with expected shape', () => {
    const report = validateRestaurant({ name: 'Test Diner' });
    expect(report).toHaveProperty('isValid');
    expect(report).toHaveProperty('confidenceScore');
    expect(Array.isArray(report.results)).toBe(true);
    expect(report.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(report.confidenceScore).toBeLessThanOrEqual(100);
  });

  it('flags an empty restaurant as invalid', () => {
    const report = validateRestaurant({});
    expect(report.isValid).toBe(false);
    expect(report.criticalErrors).toBeGreaterThan(0);
  });
});
