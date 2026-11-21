import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * mergeConsentKeys is how the OAuth finish-setup step puts the
 * personalized-suggestions answer on the profile. The bag is shared, so the
 * write must keep every other key, and a failed read must not become a write
 * over an empty bag.
 */

let readResult: { data: unknown; error: unknown } = { data: null, error: null };
const updates: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = () => Promise.resolve(readResult);
      chain.update = (payload: unknown) => {
        updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      };
      return chain;
    },
  },
}));

const { mergeConsentKeys, readOptIn } = await import('../communicationPreferences');

beforeEach(() => {
  updates.length = 0;
});

describe('mergeConsentKeys', () => {
  it('adds the key and keeps the rest of the bag', async () => {
    readResult = {
      data: { communication_preferences: { taste_preferences: { a: 1 }, email_notifications: true } },
      error: null,
    };
    await mergeConsentKeys('user-1', { event_recommendations: true });
    expect(updates).toEqual([
      {
        communication_preferences: {
          taste_preferences: { a: 1 },
          email_notifications: true,
          event_recommendations: true,
        },
      },
    ]);
  });

  it('writes onto a null bag', async () => {
    readResult = { data: { communication_preferences: null }, error: null };
    await mergeConsentKeys('user-1', { event_recommendations: false });
    expect(updates).toEqual([{ communication_preferences: { event_recommendations: false } }]);
  });

  it('throws on a failed read and writes nothing', async () => {
    readResult = { data: null, error: { message: 'boom' } };
    await expect(mergeConsentKeys('user-1', { event_recommendations: true })).rejects.toEqual({ message: 'boom' });
    expect(updates).toEqual([]);
  });
});

describe('readOptIn', () => {
  it('counts only an explicit true', () => {
    expect(readOptIn({ event_recommendations: true }, 'event_recommendations')).toBe(true);
    expect(readOptIn({ event_recommendations: 'true' }, 'event_recommendations')).toBe(false);
    expect(readOptIn({}, 'event_recommendations')).toBe(false);
    expect(readOptIn(null, 'event_recommendations')).toBe(false);
  });
});
