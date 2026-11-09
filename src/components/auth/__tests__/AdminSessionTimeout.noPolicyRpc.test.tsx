import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * WEB-QA-048. An admin page load must not call get_user_session_policy.
 *
 * useSessionTimeout read the idle policy from that RPC by default, and the one
 * mount point (AdminSessionTimeout) never opted out, so every admin session
 * fired it. Production has no such function (schema-baseline.json listed it,
 * scripts/db-snapshot.json does not have it), so every call failed and the
 * hook fell back to the values AdminSessionTimeout passes anyway. The policy
 * is those values; this asserts nothing goes to the database to look it up.
 */
const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
const from = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

const auth = {
  isAuthenticated: true,
  logout: vi.fn().mockResolvedValue(undefined),
  getSessionExpiresAt: () => null,
  getSessionStartedAt: () => Date.now() - 60 * 1000,
  user: { id: 'admin-1' },
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const { render, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { AdminSessionTimeout } = await import('../AdminSessionTimeout');

describe('AdminSessionTimeout', () => {
  it('reads no session policy from the database', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<AdminSessionTimeout />, { wrapper });

    // Give a mounted query every chance to fire before asserting it did not.
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((r) => setTimeout(r, 20));

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
