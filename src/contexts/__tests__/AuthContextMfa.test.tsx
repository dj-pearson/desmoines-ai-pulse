import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * WEB-BE-032 — the MFA gate must fail CLOSED.
 *
 * `const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
 * discarded its error. On failure `mfaData` is undefined, so both assurance
 * levels are undefined, the `aal1 && aal2` condition is false, the entire MFA
 * block is skipped, and login falls through to success — a transient error
 * silently bypassed the second factor.
 *
 * That branch is the ONLY enforcement: no RLS policy references aal2, so there
 * is no server-side backstop to catch it.
 *
 * The third case below is as important as the first two: a user with no second
 * factor must still be able to sign in when the assurance check fails, or the
 * fix trades a security hole for a lockout.
 */

const makeSession = (userId = 'u1') => ({
  access_token: 't1',
  expires_at: 1_700_000_000,
  user: { id: userId, email: `${userId}@b.com` },
});

// vi.mock is hoisted above module scope, so anything its factory references has
// to be created inside vi.hoisted rather than as a plain const.
const { mfa, signOut } = vi.hoisted(() => ({
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
  },
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/integrations/supabase/client', () => {
  const fromChain: Record<string, unknown> = {};
  fromChain.select = () => fromChain;
  fromChain.eq = () => fromChain;
  fromChain.order = () => fromChain;
  fromChain.limit = () => fromChain;
  fromChain.maybeSingle = async () => ({ data: null, error: null });
  return {
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async () => ({
        data: { session: makeSession(), user: makeSession().user },
        error: null,
      })),
      signOut,
      mfa,
    },
    from: () => fromChain,
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
  };
});

vi.mock('@/lib/safeStorage', () => ({
  storage: { get: () => null, set: () => undefined, remove: () => undefined },
}));

import { supabase as supabaseMock } from '@/integrations/supabase/client';
import { AuthProvider, useAuth } from '../AuthContext';

type LoginResult = { success: boolean; requiresMFA?: boolean; error?: string };
let doLogin: (email: string, password: string) => Promise<LoginResult>;

let flags: { isAuthenticated: boolean; requiresMFA: boolean };

function Probe() {
  const auth = useAuth() as unknown as {
    login: typeof doLogin;
    isAuthenticated: boolean;
    requiresMFA: boolean;
  };
  doLogin = auth.login;
  flags = { isAuthenticated: auth.isAuthenticated, requiresMFA: auth.requiresMFA };
  return null;
}

async function mount() {
  await act(async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

describe('MFA gate fails closed (WEB-BE-032)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it('refuses sign-in when neither MFA read succeeds', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'network' },
    });
    mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'network' } });

    await mount();
    const res = await doLogin('a@b.com', 'pw');

    // The pre-fix behaviour returned { success: true } here.
    expect(res.success).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });

  it('requires MFA when the level is unreadable but a verified factor exists', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'network' },
    });
    mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', status: 'verified' }] },
      error: null,
    });

    await mount();
    const res = await doLogin('a@b.com', 'pw');

    expect(res.success).toBe(false);
    expect(res.requiresMFA).toBe(true);
  });

  it('still lets a user without any factor sign in when the level is unreadable', async () => {
    // Guards the other direction: the fix must not lock out the 100% of accounts
    // that have no second factor.
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: { message: 'network' },
    });
    mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });

    await mount();
    const res = await doLogin('a@b.com', 'pw');

    expect(res.success).toBe(true);
    expect(res.requiresMFA).toBeFalsy();
  });
});

/**
 * WEB-SEC-026 — the aal1 session must not read as signed in.
 *
 * `signInWithPassword` stores a real session before any second factor is asked
 * for, so SIGNED_IN fires and every listener sees an ordinary sign-in. Auth.tsx
 * navigates on `isAuthenticated`, so the page unmounted before
 * MFAVerificationDialog could open and the admin dashboard was reachable on a
 * password alone.
 *
 * These drive the auth-state callback directly, because the defect is in
 * handleAuthChange rather than in login().
 */
describe('an aal1 session with a pending factor is not authenticated (WEB-SEC-026)', () => {
  const session = makeSession();

  /** Fire an auth event through the callback AuthProvider registered. */
  async function emit(event: string) {
    const onChange = supabaseMock.auth.onAuthStateChange as unknown as {
      mock: { calls: Array<[(e: string, s: unknown) => void]> };
    };
    const cb = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    await act(async () => {
      await cb(event, session);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it('holds back a session that still owes a second factor', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });

    await mount();
    await emit('SIGNED_IN');

    // Pre-fix this was true, which is what let Auth.tsx redirect to /admin.
    expect(flags.isAuthenticated).toBe(false);
    expect(flags.requiresMFA).toBe(true);
  });

  it('admits the same session once it reaches aal2', async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });

    await mount();
    await emit('SIGNED_IN');

    expect(flags.isAuthenticated).toBe(true);
    expect(flags.requiresMFA).toBe(false);
  });

  it('does not hold back a user who has no second factor', async () => {
    // The lockout guard. For an account with nothing enrolled GoTrue reports
    // both levels as aal1, and that user must sign in exactly as before.
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null,
    });

    await mount();
    await emit('SIGNED_IN');

    expect(flags.isAuthenticated).toBe(true);
    expect(flags.requiresMFA).toBe(false);
  });

  it('does not lock anyone out when the assurance level cannot be read', async () => {
    // handleAuthChange runs on every auth event, including token refreshes, so
    // failing closed here would sign people out on a transient error. The
    // fail-closed decision lives in login() and in the edge-function gate,
    // where refusing costs one action rather than every session.
    mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('offline'));

    await mount();
    await emit('SIGNED_IN');

    expect(flags.isAuthenticated).toBe(true);
  });
});
