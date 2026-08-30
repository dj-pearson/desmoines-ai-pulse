import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

/**
 * WEB-PERF-005 — render-count proof for the AuthContext split.
 *
 * A TOKEN_REFRESHED tick changes only `session`/`user`. Components that read the
 * split status context (useAuthStatus — what Header/BottomNav now use) must NOT
 * re-render on it, while full-state consumers (useAuthState) still do.
 */

let authCallback: ((event: string, session: unknown) => void) | null = null;

const makeSession = (token: string, userId = "u1") => ({
  access_token: token,
  expires_at: 1_700_000_000,
  user: { id: userId, email: `${userId}@b.com` },
});

// Minimal chainable query stub for the admin check (returns no role/profile).
// `deferRoleQueries` holds the answer open, standing in for a real network
// round-trip so tests can observe what the UI does *while* a check is in
// flight.
let deferRoleQueries = false;
let pendingRoleQueries: Array<() => void> = [];

const fromChain: Record<string, unknown> = {};
fromChain.select = () => fromChain;
fromChain.eq = () => fromChain;
fromChain.maybeSingle = () => {
  if (!deferRoleQueries) return Promise.resolve({ data: null, error: null });
  return new Promise((resolve) => {
    pendingRoleQueries.push(() => resolve({ data: null, error: null }));
  });
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: makeSession("t1") },
        error: null,
      })),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: () => fromChain,
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));

import {
  AuthProvider,
  useAuthFlags as useAuthStatus,
  useAuthState,
} from "@/contexts/AuthContext";

let statusRenders = 0;
let stateRenders = 0;

function StatusConsumer() {
  statusRenders++;
  useAuthStatus();
  return null;
}

function StateConsumer() {
  stateRenders++;
  useAuthState();
  return null;
}

async function flush() {
  // Let getSession + the (async) admin check settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("AuthContext split (WEB-PERF-005)", () => {
  beforeEach(() => {
    statusRenders = 0;
    stateRenders = 0;
    authCallback = null;
  });

  it("status consumers skip token-refresh re-renders; state consumers re-render", async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <StatusConsumer />
          <StateConsumer />
        </AuthProvider>,
      );
    });
    await flush();
    await flush();

    const statusBefore = statusRenders;
    const stateBefore = stateRenders;

    // A token refresh changes only session/user — not the status fields.
    await act(async () => {
      authCallback?.("TOKEN_REFRESHED", makeSession("t2"));
      await Promise.resolve();
    });

    expect(statusRenders).toBe(statusBefore); // no status change → no re-render
    expect(stateRenders).toBeGreaterThan(stateBefore); // session changed → re-render
  });
});

/**
 * WEB-UX-008 — a browser tab regaining focus must not look like a new sign-in.
 *
 * supabase-js re-emits SIGNED_IN for the session we already hold every time the
 * tab becomes visible (GoTrueClient#_recoverAndRefresh). If that flips
 * `isAdminLoading`, ProtectedRoute swaps the page for a spinner and the whole
 * subtree unmounts — losing the open tab, the scroll position and any
 * half-filled form.
 */
describe("AuthContext tab-focus re-emitted SIGNED_IN (WEB-UX-008)", () => {
  beforeEach(() => {
    authCallback = null;
    deferRoleQueries = false;
    pendingRoleQueries = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    pendingRoleQueries.forEach((resolve) => resolve());
    pendingRoleQueries = [];
  });

  async function renderAndSettle() {
    const seen: boolean[] = [];
    function AdminLoadingProbe() {
      seen.push(useAuthState().isAdminLoading);
      return null;
    }
    await act(async () => {
      render(
        <AuthProvider>
          <AdminLoadingProbe />
        </AuthProvider>,
      );
    });
    await flush();
    await flush();
    return seen;
  }

  it("does not re-enter the admin-loading state for the same user", async () => {
    const seen = await renderAndSettle();
    expect(seen.at(-1)).toBe(false);
    const countBefore = seen.length;

    // Tab hidden -> visible: same session, re-announced as SIGNED_IN.
    await act(async () => {
      authCallback?.("SIGNED_IN", makeSession("t1"));
      await Promise.resolve();
    });
    await flush();

    expect(seen.slice(countBefore).some(Boolean)).toBe(false);
    expect(seen.at(-1)).toBe(false);
  });

  it("keeps state identity when the re-emitted session is unchanged", async () => {
    let stateRenderCount = 0;
    function CountingConsumer() {
      stateRenderCount++;
      useAuthState();
      return null;
    }
    await act(async () => {
      render(
        <AuthProvider>
          <CountingConsumer />
        </AuthProvider>,
      );
    });
    await flush();
    await flush();

    const before = stateRenderCount;
    await act(async () => {
      authCallback?.("SIGNED_IN", makeSession("t1"));
      await Promise.resolve();
    });
    await flush();

    // Identical session -> identical state object -> nothing re-renders.
    expect(stateRenderCount).toBe(before);
  });

  it("still shows the admin check for a genuinely different user", async () => {
    const seen = await renderAndSettle();
    const countBefore = seen.length;

    await act(async () => {
      authCallback?.("SIGNED_IN", makeSession("t9", "someone-else"));
      await Promise.resolve();
    });

    expect(seen.slice(countBefore).some(Boolean)).toBe(true);
  });

  it("never blocks the page while re-checking a stale admin cache", async () => {
    const seen = await renderAndSettle();
    const countBefore = seen.length;

    // Age past the 5-minute admin-status cache TTL and hold the role query
    // open: this is the real-world case, where you come back to the tab after
    // a while and the check needs an actual round-trip. Blocking here is what
    // unmounted the page and threw away everything the user was doing.
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 6 * 60 * 1000);
    deferRoleQueries = true;

    await act(async () => {
      authCallback?.("SIGNED_IN", makeSession("t1"));
      await Promise.resolve();
    });
    await flush();

    expect(pendingRoleQueries.length).toBeGreaterThan(0); // check really is in flight
    expect(seen.slice(countBefore).some(Boolean)).toBe(false);
    expect(seen.at(-1)).toBe(false);
  });
});
