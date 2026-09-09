import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-FEAT-019. The newsletter signup promised things the platform does not do.
 *
 * These assert the COPY, which is unusual for a unit test and is the point:
 * the defect was never in the control flow. The insert succeeded, the toast
 * fired, and the sentence it showed was false.
 */
const insert = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert: (...a: unknown[]) => insert(...a) }) },
}));

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

const { renderHook, act } = await import('@testing-library/react');
const { useNewsletterSubscription } = await import('../useNewsletterSubscription');

beforeEach(() => {
  insert.mockReset();
  toastSuccess.mockReset();
  toastInfo.mockReset();
  toastError.mockReset();
});

describe('newsletter signup copy', () => {
  it('does not promise a confirmation email, because nothing sends one', async () => {
    insert.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: 'reader@example.com' });
    });

    const said = String(toastSuccess.mock.calls[0][0]);
    // There is no confirmation token, no double opt-in and no sender anywhere
    // in the repo. Anything that tells the reader to go and look for one sends
    // them to wait for mail that will not arrive.
    expect(said).not.toMatch(/confirm/i);
    expect(said).not.toMatch(/check your email/i);
    expect(said).toMatch(/on the list/i);
  });

  it('does not tell a returning unsubscriber to check their inbox', async () => {
    // 23505 is a duplicate address. The row may be status='unsubscribed', and
    // the SELECT policy is admin-only so this hook cannot tell. The old copy
    // asserted both that they were subscribed and that mail was coming.
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: 'returning@example.com' });
    });

    const said = String(toastInfo.mock.calls[0][0]);
    expect(said).not.toMatch(/check your inbox/i);
    expect(said).not.toMatch(/you'?re already subscribed/i);
    expect(said).toMatch(/already on our list/i);
  });

  it('reports a real failure as a failure', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    const { result } = renderHook(() => useNewsletterSubscription());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.subscribe({ email: 'reader@example.com' });
    });

    expect(ok).toBe(false);
    expect(toastError).toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('exposes no client-side unsubscribe', () => {
    // newsletter_subscribers has INSERT and admin-SELECT policies and NO
    // UPDATE policy, so the old unsubscribe() matched zero rows, got no error
    // back, and announced success. Re-adding it would restore a false success
    // on the one action a person has a legal right to.
    const { result } = renderHook(() => useNewsletterSubscription());
    expect('unsubscribe' in result.current).toBe(false);
    expect('updatePreferences' in result.current).toBe(false);
  });
});
