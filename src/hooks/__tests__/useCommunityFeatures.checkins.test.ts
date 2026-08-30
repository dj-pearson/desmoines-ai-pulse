import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * WEB-SEC-025. getEventCheckIns used to select `status` for every attendee of an
 * event and count them in the browser, which meant the anon key could enumerate
 * who is going to which event while the UI rendered four numbers and no names.
 * It now calls event_attendance_tallies(uuid), a SECURITY DEFINER aggregate.
 *
 * What these tests hold onto:
 *   - the returned SHAPE is unchanged, because EventCheckIn.tsx reads all five
 *     fields and a silent change here shows up as a zero in the UI, not an error
 *   - `total` still counts every status including not_going, which is what the
 *     old `data.length` did and is easy to get wrong when moving to per-status
 *     rows
 *   - it reads the RPC and NOT the raw table, which is the whole point: a
 *     regression here type-checks, compiles, and works right up until the policy
 *     tightens, at which point it silently reports one attendee
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

// useCommunityFeatures imports ./useAuth, which is a barrel re-exporting from
// AuthContext - so the barrel is not where the implementation lives.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
  useAuthState: () => ({ user: { id: 'user-1' } }),
  useAuthFlags: () => ({ isAuthenticated: true }),
  useAuthActions: () => ({}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const errors: unknown[] = [];
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: (...args: unknown[]) => errors.push(args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const { useCommunityFeatures } = await import('../useCommunityFeatures');

/** The hook fetches forums and friends on mount; stub those away. */
function stubIdleTable() {
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'upsert', 'insert', 'update', 'single']) {
    builder[m] = () => builder;
  }
  return builder;
}

function checkIns() {
  const { result } = renderHook(() => useCommunityFeatures());
  return result.current.getEventCheckIns;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  from.mockImplementation(() => stubIdleTable());
  errors.length = 0;
});

describe('getEventCheckIns', () => {
  it('calls the aggregate, not the raw table', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await checkIns()('event-1');

    expect(rpc).toHaveBeenCalledWith('event_attendance_tallies', { p_event_id: 'event-1' });
    // Any .from('event_attendance') here would be the defect coming back.
    expect(from.mock.calls.flat()).not.toContain('event_attendance');
  });

  it('maps per-status rows onto the shape EventCheckIn reads', async () => {
    rpc.mockResolvedValue({
      data: [
        { status: 'going', attendee_count: 7 },
        { status: 'interested', attendee_count: 3 },
        { status: 'not_going', attendee_count: 2 },
      ],
      error: null,
    });

    expect(await checkIns()('event-1')).toEqual({
      going: 7,
      interested: 3,
      maybe: 0,
      not_going: 2,
      // 7 + 3 + 2. The old implementation used data.length over raw rows, which
      // included not_going, so excluding it here would quietly change the number.
      total: 12,
    });
  });

  it('counts a status the client does not know about toward the total', async () => {
    // `status` is plain text with no CHECK constraint, so this is reachable.
    rpc.mockResolvedValue({
      data: [
        { status: 'going', attendee_count: 4 },
        { status: 'waitlisted', attendee_count: 5 },
      ],
      error: null,
    });

    const result = await checkIns()('event-1');
    expect(result.going).toBe(4);
    expect(result.total).toBe(9);
  });

  it('returns all zeros for an event nobody has responded to', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await checkIns()('event-1')).toEqual({
      going: 0, interested: 0, maybe: 0, not_going: 0, total: 0,
    });
  });

  it('treats a null data payload as empty rather than throwing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await checkIns()('event-1')).total).toBe(0);
  });

  it('coerces a numeric-string count, because bigint arrives as a string', async () => {
    // PostgREST serialises bigint as a JSON string. Adding those with + would
    // concatenate: "4" + "5" is "45", and the tile would show 45 attendees.
    rpc.mockResolvedValue({
      data: [
        { status: 'going', attendee_count: '4' },
        { status: 'interested', attendee_count: '5' },
      ],
      error: null,
    });
    const result = await checkIns()('event-1');
    expect(result.going).toBe(4);
    expect(result.total).toBe(9);
  });

  it('logs and returns zeros on an RPC error instead of throwing at the caller', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PGRST202' } });
    expect(await checkIns()('event-1')).toEqual({
      going: 0, interested: 0, maybe: 0, not_going: 0, total: 0,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
