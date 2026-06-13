import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * Render-count tests for the AuthContext store split (WEB-PERF-005).
 *
 * Proves the core guarantee: components that read a narrow slice of auth state
 * via a selector (useIsAuthenticated — what Header/BottomNav use) do NOT
 * re-render on a session-refresh tick (TOKEN_REFRESHED only mutates
 * session/user), while a combined useAuth() consumer still does.
 */

// Capture the onAuthStateChange callback so the test can drive auth events.
let authCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const maybeSingle = () => Promise.resolve({ data: null, error: null });
  const eq = () => ({ maybeSingle });
  const select = () => ({ eq });
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: (cb: typeof authCallback) => {
          authCallback = cb;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        mfa: {
          getAuthenticatorAssuranceLevel: () =>
            Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }),
          listFactors: () => Promise.resolve({ data: { totp: [] } }),
        },
      },
      from: () => ({ select }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

// Import after the mock is registered.
import {
  AuthProvider,
  useIsAuthenticated,
  useAuth,
} from '../AuthContext';

function makeSession(token: string): Session {
  return {
    access_token: token,
    refresh_token: `refresh-${token}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    } as Session['user'],
  } as Session;
}

const counts = { narrow: 0, combined: 0 };

function NarrowConsumer() {
  counts.narrow += 1;
  const isAuthenticated = useIsAuthenticated();
  return <span data-testid="narrow">{String(isAuthenticated)}</span>;
}

function CombinedConsumer() {
  counts.combined += 1;
  const { isAuthenticated } = useAuth();
  return <span data-testid="combined">{String(isAuthenticated)}</span>;
}

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext selector store (WEB-PERF-005)', () => {
  beforeEach(() => {
    authCallback = null;
    counts.narrow = 0;
    counts.combined = 0;
  });

  it('narrow selector skips re-render on a session-refresh tick; combined consumer re-renders', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <NarrowConsumer />
          <CombinedConsumer />
        </Wrapper>,
      );
      // let initializeAuth() (getSession) resolve
      await Promise.resolve();
    });

    expect(authCallback).toBeTruthy();

    // Sign in: isAuthenticated flips false -> true. Both consumers re-render.
    await act(async () => {
      authCallback!('SIGNED_IN', makeSession('A'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const narrowAfterSignIn = counts.narrow;
    const combinedAfterSignIn = counts.combined;

    // Token refresh: only session/user change. isAuthenticated stays true.
    await act(async () => {
      authCallback!('TOKEN_REFRESHED', makeSession('B'));
      await Promise.resolve();
    });

    // Narrow selector consumer must NOT have re-rendered on the refresh tick.
    expect(counts.narrow).toBe(narrowAfterSignIn);
    // Combined useAuth() consumer DOES re-render (it reads the whole state).
    expect(counts.combined).toBeGreaterThan(combinedAfterSignIn);
  });

  it('a second identical token refresh still never re-renders the narrow consumer', async () => {
    await act(async () => {
      render(
        <Wrapper>
          <NarrowConsumer />
        </Wrapper>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      authCallback!('SIGNED_IN', makeSession('A'));
      await Promise.resolve();
      await Promise.resolve();
    });

    const baseline = counts.narrow;

    await act(async () => {
      authCallback!('TOKEN_REFRESHED', makeSession('B'));
      await Promise.resolve();
      authCallback!('TOKEN_REFRESHED', makeSession('C'));
      await Promise.resolve();
    });

    expect(counts.narrow).toBe(baseline);
  });
});
