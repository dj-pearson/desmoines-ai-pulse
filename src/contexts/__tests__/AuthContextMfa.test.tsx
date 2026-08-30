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

import { AuthProvider, useAuth } from '../AuthContext';

type LoginResult = { success: boolean; requiresMFA?: boolean; error?: string };
let doLogin: (email: string, password: string) => Promise<LoginResult>;

function Probe() {
  const auth = useAuth() as unknown as { login: typeof doLogin };
  doLogin = auth.login;
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
