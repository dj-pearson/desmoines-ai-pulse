import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Restaurant detail used select("*"). It now names its columns, and the ones
 * later migrations add are optional: a 42703 naming one drops that column and
 * retries, instead of blanking the page.
 */
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn((_columns: string) => ({ eq }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: (c: string) => select(c) }) },
}));

const { fetchRestaurantDetail } = await import('../restaurantDetail');
const { RESTAURANT_DETAIL_COLUMNS } = await import('../listColumns');

beforeEach(() => vi.clearAllMocks());

describe('fetchRestaurantDetail', () => {
  it('names its columns and leaves the heavy ones out', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: 'r1' }, error: null });
    await expect(fetchRestaurantDetail('lucca')).resolves.toEqual({ id: 'r1' });
    const columns = select.mock.calls[0][0];
    expect(columns.startsWith(RESTAURANT_DETAIL_COLUMNS)).toBe(true);
    for (const heavy of ['*', 'search_vector', 'geom', 'writeup_prompt_used']) {
      expect(columns).not.toContain(heavy);
    }
    expect(eq).toHaveBeenCalledWith('slug', 'lucca');
  });

  it('drops an optional column the database lacks, retries, and remembers it', async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column restaurants.reservable does not exist' } })
      .mockResolvedValueOnce({ data: { id: 'r2' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'r3' }, error: null });

    await expect(fetchRestaurantDetail('zombie-burger')).resolves.toEqual({ id: 'r2' });
    expect(select.mock.calls[0][0]).toContain('reservable');
    expect(select.mock.calls[1][0]).not.toContain('reservable,');
    expect(select.mock.calls[1][0]).toContain('reservation_url');

    await fetchRestaurantDetail('another');
    expect(select).toHaveBeenCalledTimes(3);
    expect(select.mock.calls[2][0]).not.toMatch(/\breservable\b/);
  });

  it('rethrows an unknown column that is not one of the optional ones', async () => {
    const error = { code: '42703', message: 'column restaurants.menu_url does not exist' };
    maybeSingle.mockResolvedValueOnce({ data: null, error });
    await expect(fetchRestaurantDetail('x')).rejects.toBe(error);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('falls back to the id only for a uuid', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchRestaurantDetail('no-such-place')).resolves.toBeNull();
    expect(eq).toHaveBeenCalledTimes(1);

    const id = '0b5c6f4e-2f0a-4c8e-9d43-1a2b3c4d5e6f';
    await fetchRestaurantDetail(id);
    expect(eq).toHaveBeenLastCalledWith('id', id);
  });
});
