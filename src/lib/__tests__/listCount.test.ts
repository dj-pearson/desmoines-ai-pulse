import { describe, it, expect } from 'vitest';
import { countOption } from '../listCount';

/**
 * WEB-PERF-033. count: "exact" is a second full COUNT(*) per request, and
 * /attractions and /playgrounds never render the number it produces.
 *
 * The assertion that matters is the "none" one: the option must be ABSENT,
 * not set to some falsy value, because PostgREST decides whether to count
 * from the presence of the key. Returning `{ count: undefined }` would look
 * correct here and still issue the count.
 */
describe('countOption', () => {
  it('defaults to estimated when no mode is given', () => {
    expect(countOption(undefined)).toEqual({ count: 'estimated' });
  });

  it('omits the option entirely for "none"', () => {
    expect(countOption('none')).toBeUndefined();
  });

  it('passes exact through for the admin tables that paginate on it', () => {
    expect(countOption('exact')).toEqual({ count: 'exact' });
  });

  it('passes estimated through', () => {
    expect(countOption('estimated')).toEqual({ count: 'estimated' });
  });
});
