import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-FEAT-019. The newsletter signup used to promise things the platform does
 * not do; now it does them, and the assertions move with it.
 *
 * The earlier version of this file asserted that the copy must NOT say
 * "confirm" or "check your email", because nothing sent either. That is no
 * longer true: newsletter-subscribe sends a confirmation and the row stays
 * 'pending' until the link is clicked. What is worth pinning now is narrower
 * and harder to keep: the hook must not write the table itself, and it must
 * show the function's answer rather than inventing one, because the function
 * deliberately says the SAME sentence for a new address, a pending one, an
 * unsubscribed one and an already-active one. A per-case message on the screen
 * re-creates the subscription oracle the server was careful not to be.
 */
const invoke = vi.fn();
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (...a: unknown[]) => from(...a),
  },
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

const ANSWER =
  "Almost there. If that address can receive mail from us, a confirmation link is on its way - click it and you're on the list.";

beforeEach(() => {
  invoke.mockReset();
  from.mockReset();
  toastSuccess.mockReset();
  toastInfo.mockReset();
  toastError.mockReset();
});

describe('newsletter signup', () => {
  it('goes through the edge function and never writes the table from the browser', async () => {
    // The direct insert could only ever take the table default ('active') and
    // could only ever 23505 on a returning address - there is no UPDATE policy
    // for any role. Both fixes live server-side.
    invoke.mockResolvedValue({ data: { ok: true, message: ANSWER }, error: null });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: 'Reader@Example.COM ', source: 'footer' });
    });

    expect(from).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(fnName).toBe('newsletter-subscribe');
    // Normalised before it leaves, so the address the function looks up is the
    // one the unique index is on.
    expect(options.body.email).toBe('reader@example.com');
    expect(options.body.source).toBe('footer');
  });

  it('shows the function answer verbatim, so the screen is not an oracle either', async () => {
    invoke.mockResolvedValue({ data: { ok: true, message: ANSWER }, error: null });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: 'returning@example.com' });
    });

    expect(String(toastSuccess.mock.calls[0][0])).toBe(ANSWER);
    // Nothing here may distinguish a returning unsubscriber from a new signup.
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('still says something useful if the function answers without a message', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderHook(() => useNewsletterSubscription());

    await act(async () => {
      await result.current.subscribe({ email: 'reader@example.com' });
    });

    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/confirmation link/i);
  });

  it('reports a real failure as a failure', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
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
    // on the one action a person has a legal right to. The real path is the
    // emailed token link handled by newsletter_unsubscribe_by_token.
    const { result } = renderHook(() => useNewsletterSubscription());
    expect('unsubscribe' in result.current).toBe(false);
    expect('updatePreferences' in result.current).toBe(false);
  });
});
