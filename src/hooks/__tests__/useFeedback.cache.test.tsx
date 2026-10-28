import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Every EventCard mounted useFeedback twice (the card for trackInteraction,
 * EventFeedback for the buttons) and each mount fetched the user's whole
 * feedback table in its own effect: two identical uncached requests per card.
 * The read now lives in one query keyed on the user.
 */
const eq = vi.fn();
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => from(...(a as [])) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const { renderHook, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { useFeedback, useTrackInteraction } = await import('../useFeedback');

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({
    data: [{ id: 'f1', user_id: 'user-1', event_id: 'e1', feedback_type: 'thumbs_up', created_at: '', updated_at: '' }],
    error: null,
  });
});

describe('useFeedback cache', () => {
  it('two mounts share one request', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => [useFeedback(), useFeedback()], { wrapper });
    await waitFor(() => expect(result.current[0].isLoading).toBe(false));

    expect(from).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('*'));
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.current[1].getFeedbackForEvent('e1')?.feedback_type).toBe('thumbs_up');
  });

  it('useTrackInteraction issues no feedback read and keeps one reference', () => {
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(() => useTrackInteraction(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(from).not.toHaveBeenCalled();
  });
});
