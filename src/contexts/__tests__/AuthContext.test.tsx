import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

/**
 * WEB-PERF-005 — render-count proof for the AuthContext split.
 *
 * A TOKEN_REFRESHED tick changes only `session`/`user`. Components that read the
 * split status context (useAuthStatus — what Header/BottomNav now use) must NOT
 * re-render on it, while full-state consumers (useAuthState) still do.
 */

let authCallback: ((event: string, session: unknown) => void) | null = null;

const makeSession = (token: string) => ({
  access_token: token,
  expires_at: 1_700_000_000,
  user: { id: "u1", email: "a@b.com" },
});

// Minimal chainable query stub for the admin check (returns no role/profile).
const fromChain: Record<string, unknown> = {};
fromChain.select = () => fromChain;
fromChain.eq = () => fromChain;
fromChain.maybeSingle = async () => ({ data: null, error: null });

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
  useAuthStatus,
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
