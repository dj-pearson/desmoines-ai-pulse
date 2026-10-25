import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * useActiveAds keys its query on the user from useAuthState and passes that id
 * as p_user_id (WEB-ADS-002 per-account caps). It used to ask the auth server
 * for the same user again inside the queryFn, once per placement per fetch.
 */
const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
const getUser = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
  },
}));
vi.mock('@/lib/tracking', () => ({ getOrCreateSessionId: () => 'session-1' }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ user: { id: 'user-1' } }),
}));

const { renderHook, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { useActiveAds } = await import('../useActiveAds');

describe('useActiveAds auth', () => {
  it('passes the context user to get_active_ads without calling auth.getUser', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useActiveAds('top_banner'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('get_active_ads', {
      p_placement_type: 'top_banner',
      p_session_id: 'session-1',
      p_user_id: 'user-1',
    });
  });
});
