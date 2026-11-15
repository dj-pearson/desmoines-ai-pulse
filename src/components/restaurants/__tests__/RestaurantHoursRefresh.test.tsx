import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-FEAT-086: the admin bulk updater could not start bulk-update-restaurants'
 * hours-only fill or the stale-hours refresh (WEB-FEAT-079); it sent
 * batchSize/forceUpdate/clearEnhanced only. These assert the exact body each
 * action sends, that the fill cursor is passed back, and that the enrichment
 * call's body did not change.
 */
const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));
const handleError = vi.fn();
vi.mock('@/lib/errorHandler', () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
const { RestaurantHoursRefresh } = await import('../RestaurantHoursRefresh');
const { bulkUpdateRequestBody } = await import('@/hooks/useBulkRestaurantUpdate');
const { buildHoursRefreshBody, hoursRefreshSummary } = await import('@/lib/restaurantHoursRefresh');

const lastBody = () => (invoke.mock.calls.at(-1)?.[1] as { body: unknown }).body;

describe('RestaurantHoursRefresh', () => {
  beforeEach(() => {
    invoke.mockReset();
    handleError.mockReset();
  });

  it('Fill missing hours sends hoursOnly with no staleDays, then passes lastId back', async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, mode: 'hoursOnly', processed: 20, updated: 17, noHours: 3, errors: 0, lastId: 'id-20' },
      error: null,
    });
    render(<RestaurantHoursRefresh />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill missing hours' }));

    await screen.findByText('17 of 20 updated, 3 with no hours on Google, 0 errors');
    expect(invoke).toHaveBeenCalledWith('bulk-update-restaurants', { body: { batchSize: 20, hoursOnly: true } });

    invoke.mockResolvedValueOnce({
      data: { success: true, mode: 'hoursOnly', processed: 0, updated: 0, noHours: 0, errors: 0, lastId: null },
      error: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fill missing hours (next batch)' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(lastBody()).toEqual({ batchSize: 20, hoursOnly: true, afterId: 'id-20' });
    // An empty pass resets the cursor, so the next fill starts over.
    await screen.findByRole('button', { name: 'Fill missing hours' });
  });

  it('Refresh stale hours sends hoursOnly with staleDays and shows gone', async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, mode: 'hoursOnly-stale', staleDays: 14, processed: 5, updated: 4, noHours: 1, gone: 1, errors: 1 },
      error: null,
    });
    render(<RestaurantHoursRefresh />);
    const days = screen.getByLabelText('Refresh hours older than (days)');
    fireEvent.change(days, { target: { value: '14' } });
    fireEvent.blur(days);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh stale hours' }));

    await screen.findByText('4 of 5 updated, 1 with no hours on Google, 1 no longer on Google, 1 error');
    expect(lastBody()).toEqual({ batchSize: 20, hoursOnly: true, staleDays: 14 });
  });

  it('a failed call goes through handleError and shows the message', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Too many bulk update requests' } });
    render(<RestaurantHoursRefresh />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh stale hours' }));

    await screen.findByText('Too many bulk update requests');
    expect(handleError).toHaveBeenCalledWith(expect.any(Error), {
      component: 'useBulkRestaurantUpdate',
      action: 'refreshHours',
    });
  });
});

describe('request bodies', () => {
  it('the enrichment body is unchanged and carries no hours fields', () => {
    expect(bulkUpdateRequestBody({ batchSize: 3, forceUpdate: true, clearEnhanced: false })).toEqual({
      batchSize: 3,
      forceUpdate: true,
      clearEnhanced: false,
    });
    expect(bulkUpdateRequestBody()).toEqual({ batchSize: 10, forceUpdate: false, clearEnhanced: false });
  });

  it('stale ignores a fill cursor and clamps to the edge function bounds', () => {
    expect(buildHoursRefreshBody('stale', { batchSize: 500, staleDays: 2, afterId: 'x' })).toEqual({
      hoursOnly: true,
      batchSize: 50,
      staleDays: 7,
    });
    expect(buildHoursRefreshBody('stale', { batchSize: 0, staleDays: 9999 })).toEqual({
      hoursOnly: true,
      batchSize: 1,
      staleDays: 365,
    });
    expect(bulkUpdateRequestBody({ hoursOnly: true, staleDays: 30, afterId: 'x', batchSize: 5 })).toEqual({
      batchSize: 5,
      hoursOnly: true,
      staleDays: 30,
    });
  });

  it('an empty pass reads as nothing to do, not as a failure', () => {
    expect(hoursRefreshSummary('stale', { processed: 0, updated: 0, errors: 0 })).toMatch(/Nothing to refresh/);
  });
});
