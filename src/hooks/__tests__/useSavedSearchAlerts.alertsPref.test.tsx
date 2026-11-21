import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * WEB-FEAT-076. The saved-search alerts switch used to upsert
 * user_email_preferences with only user_id and event_alerts_enabled. When the
 * account had no row (everyone who signed up before handle_new_user started
 * seeding one in 20261004000001), the INSERT took the column default for
 * weekly_digest_enabled, which is true, and get_weekly_digest_recipients mails
 * every row with that flag set. Turning alerts on OR off subscribed the reader
 * to the weekly digest.
 *
 * The fake below keeps one in-memory table with that default, so the test
 * checks the row that ends up stored rather than the shape of one call.
 */
type PrefRow = {
  user_id: string;
  event_alerts_enabled: boolean;
  weekly_digest_enabled: boolean;
  updated_at?: string;
};

const COLUMN_DEFAULTS = { event_alerts_enabled: true, weekly_digest_enabled: true };
let rows: PrefRow[] = [];
let raceRow: PrefRow | null = null;

function result<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

/** Thenable so `await builder` and `await builder.select(...)` both work. */
function thenable<T>(run: () => T) {
  return {
    then: (ok: (v: { data: T; error: null }) => unknown, bad?: (e: unknown) => unknown) =>
      result(run()).then(ok, bad),
    select: () => result(run()),
  };
}

const prefsTable = {
  select: () => ({
    eq: (_col: string, id: string) => ({
      maybeSingle: () => result(rows.find((r) => r.user_id === id) ?? null),
    }),
  }),
  update: (changes: Partial<PrefRow>) => ({
    eq: (_col: string, id: string) =>
      thenable(() => {
        const hit = rows.filter((r) => r.user_id === id);
        hit.forEach((r) => Object.assign(r, changes));
        return hit;
      }),
  }),
  upsert: (values: Partial<PrefRow> & { user_id: string }, opts?: { ignoreDuplicates?: boolean }) =>
    thenable(() => {
      // A concurrent writer (another tab) creates the row between this
      // client's UPDATE and its INSERT.
      if (raceRow) {
        rows.push(raceRow);
        raceRow = null;
      }
      const existing = rows.find((r) => r.user_id === values.user_id);
      if (existing) {
        if (opts?.ignoreDuplicates) return [];
        Object.assign(existing, values);
        return [existing];
      }
      const row = { ...COLUMN_DEFAULTS, ...values } as PrefRow;
      rows.push(row);
      return [row];
    }),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'user_email_preferences') throw new Error(`unexpected table ${table}`);
      return prefsTable;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const { renderHook, act } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { useSavedSearchAlerts } = await import('../useSavedSearchAlerts');

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function setPref(enabled: boolean) {
  const { result } = renderHook(() => useSavedSearchAlerts(), { wrapper: makeWrapper() });
  await act(async () => {
    await result.current.setAlertsPref.mutateAsync(enabled);
  });
}

beforeEach(() => {
  rows = [];
  raceRow = null;
});

describe('useSavedSearchAlerts.setAlertsPref (WEB-FEAT-076)', () => {
  it.each([true, false])('with no prefs row, alerts=%s creates a row with the digest off', async (enabled) => {
    await setPref(enabled);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      event_alerts_enabled: enabled,
      weekly_digest_enabled: false,
    });
  });

  it('leaves an existing digest opt-in alone', async () => {
    rows = [{ user_id: 'user-1', event_alerts_enabled: true, weekly_digest_enabled: true }];

    await setPref(false);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_alerts_enabled: false, weekly_digest_enabled: true });
  });

  it('leaves an existing digest opt-out alone', async () => {
    rows = [{ user_id: 'user-1', event_alerts_enabled: false, weekly_digest_enabled: false }];

    await setPref(true);

    expect(rows[0]).toMatchObject({ event_alerts_enabled: true, weekly_digest_enabled: false });
  });

  it('still applies the switch when another tab created the row first', async () => {
    raceRow = { user_id: 'user-1', event_alerts_enabled: true, weekly_digest_enabled: true };

    await setPref(false);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_alerts_enabled: false, weekly_digest_enabled: true });
  });
});
