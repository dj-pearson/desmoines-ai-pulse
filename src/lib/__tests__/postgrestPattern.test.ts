import { describe, it, expect } from 'vitest';
import { escapeLikePattern, sanitizePostgrestPattern } from '@/lib/postgrestPattern';

// A literal backslash has been mangled by more than one tool writing this
// repo, so expected values are built from a char code.
const BS = String.fromCharCode(92);

describe('sanitizePostgrestPattern', () => {
  it('removes the characters PostgREST parses structurally', () => {
    // Measured against production before this existed: 'Bar, Grill' answered
    // 400 'failed to parse logic tree', and 'a*b' returned 446 rows because
    // * is the ilike wildcard.
    expect(sanitizePostgrestPattern('Bar, Grill')).toBe('Bar Grill');
    expect(sanitizePostgrestPattern('Casey (West)')).toBe('Casey West');
    expect(sanitizePostgrestPattern('a*b')).toBe('a b');
    expect(sanitizePostgrestPattern('back`tick')).toBe('back tick');
  });

  it('keeps the punctuation real venue names contain', () => {
    // The direction that matters. The Deno-side twin used to strip
    // apostrophes, which emptied every search naming Casey's Center - 44
    // events. Do not reintroduce that here.
    expect(sanitizePostgrestPattern("Casey's Center")).toBe("Casey's Center");
    expect(sanitizePostgrestPattern('Bar & Grill')).toBe('Bar & Grill');
    expect(sanitizePostgrestPattern('Cafe Dodici')).toBe('Cafe Dodici');
    expect(sanitizePostgrestPattern('drive-in')).toBe('drive-in');
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(sanitizePostgrestPattern('50% off')).toBe('50' + BS + '% off');
    expect(sanitizePostgrestPattern('a_b')).toBe('a' + BS + '_b');
    expect(escapeLikePattern('%')).toBe(BS + '%');
    expect(escapeLikePattern('a' + BS + 'b')).toBe('a' + BS + BS + 'b');
  });

  it('collapses the whitespace its own substitutions create', () => {
    expect(sanitizePostgrestPattern('a,,,b')).toBe('a b');
    expect(sanitizePostgrestPattern('  padded  ')).toBe('padded');
    expect(sanitizePostgrestPattern('')).toBe('');
  });
});
