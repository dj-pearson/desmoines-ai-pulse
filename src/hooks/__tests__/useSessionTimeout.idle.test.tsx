import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * The admin idle timeout has to actually sign an idle admin out.
 *
 * isWarning used to be a dependency of the activity handler, and the handler a
 * dependency of the effect that arms the timers. So the moment the warning
 * opened, the effect re-ran, its first act was resetTimer(), and resetTimer
 * cleared the warning and the countdown and started the 30 minutes over. An
 * admin who walked away was warned every 25 minutes and never logged out.
 */
const logout = vi.fn().mockResolvedValue(undefined);
const toast = vi.fn();
// Stable identities, as AuthContext's useCallback values are.
const getSessionExpiresAt = () => null;
const getSessionStartedAt = () => Date.now() - 60 * 1000;
const auth = {
  isAuthenticated: true,
  logout,
  getSessionExpiresAt,
  getSessionStartedAt,
  user: { id: 'admin-1' },
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

const { renderHook, act } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { useSessionTimeout } = await import('../useSessionTimeout');

const MIN = 60 * 1000;

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useSessionTimeout({
        idleTimeout: 30,
        warningTime: 5,
        maxSessionDuration: 8,
        enabled: true,
        useDatabasePolicy: false,
      }),
    { wrapper },
  );
}

describe('useSessionTimeout idle logout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logout.mockClear();
    toast.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the warning after 25 idle minutes and keeps it open', () => {
    const { result } = render();
    act(() => {
      vi.advanceTimersByTime(25 * MIN + 1000);
    });
    expect(result.current.isWarning).toBe(true);
    act(() => {
      vi.advanceTimersByTime(MIN);
    });
    expect(result.current.isWarning).toBe(true);
    expect(result.current.timeRemaining).toBeLessThanOrEqual(4 * 60);
  });

  it('signs an idle admin out locally after 30 minutes', () => {
    render();
    // Separate acts, so React renders when the warning opens, as a browser
    // does. One act would batch the state change past the logout timer and
    // hide the reset this test exists for.
    act(() => {
      vi.advanceTimersByTime(25 * MIN + 1000);
    });
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(MIN);
      });
    }
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('activity during the warning dismisses it and restarts the clock', () => {
    const { result } = render();
    act(() => {
      vi.advanceTimersByTime(26 * MIN);
    });
    expect(result.current.isWarning).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.isWarning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(20 * MIN);
    });
    expect(logout).not.toHaveBeenCalled();
    expect(result.current.isWarning).toBe(false);
  });

  it('Stay logged in closes the warning and restarts the clock', () => {
    const { result } = render();
    act(() => {
      vi.advanceTimersByTime(26 * MIN);
    });
    act(() => {
      result.current.resetTimer();
    });
    expect(result.current.isWarning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(24 * MIN);
    });
    expect(logout).not.toHaveBeenCalled();
  });
});
