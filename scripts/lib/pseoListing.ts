/**
 * SEO-064 - the ids a pSEO page's live listing shows, read the way
 * src/pseo/components/sections/PseoLiveListings.tsx fetchListings reads them,
 * over PostgREST with the anon key (what a visitor's browser uses, so RLS is
 * the same). Ids only: the duplicate rule compares sets.
 *
 * Mirrors, in order: entity from resolveEntityType; an incoherent category
 * lists nothing; events = visible (not merged, not hidden, not archived),
 * date >= now, category imatch, temporal window [from, dayAfter(to)), soonest
 * first, 12; restaurants = not merged, cuisine imatch, rating desc, 24 then
 * visitable status then 12. No location: no page the rule governs has one,
 * and a half-copied location filter would measure something else, so it
 * throws instead.
 */
import { CATEGORY_FILTERS, dayAfter, resolveEntityType, temporalRange } from '../../src/pseo/listingFilters';
import { isVisitableStatus } from '../../src/lib/restaurantHours';

interface Dim {
  dimension: string;
  slug: string;
}

export async function fetchListingIds(
  { base, key }: { base: string; key: string },
  dimensions: readonly Dim[],
  now: Date = new Date(),
): Promise<string[]> {
  const content = dimensions.find((d) => d.dimension === 'content_type');
  const category = dimensions.find((d) => d.dimension === 'category');
  const temporal = dimensions.find((d) => d.dimension === 'temporal');
  if (dimensions.some((d) => d.dimension === 'location')) {
    throw new Error('fetchListingIds does not model the location filter');
  }
  const entity = resolveEntityType(content?.slug, category?.slug);
  const filter = category ? CATEGORY_FILTERS[category.slug] : undefined;
  if (category && filter && filter.entity !== entity) return [];

  const params = new URLSearchParams();
  if (entity === 'events') {
    params.append('select', 'id');
    params.append('date', `gte.${now.toISOString()}`);
    params.append('order', 'date.asc');
    params.append('limit', '12');
    params.append('is_merged', 'neq.true');
    params.append('is_hidden', 'neq.true');
    params.append('archived_at', 'is.null');
    if (filter) params.append(filter.column, `imatch.${filter.pattern}`);
    if (temporal) {
      const range = temporalRange(temporal.slug, now);
      if (range) {
        params.append('date', `gte.${range.from}`);
        params.append('date', `lt.${dayAfter(range.to)}`);
      }
    }
  } else if (entity === 'restaurants') {
    params.append('select', 'id,status');
    params.append('is_merged', 'neq.true');
    params.append('order', 'rating.desc');
    params.append('limit', '24');
    if (filter) params.append(filter.column, `imatch.${filter.pattern}`);
  } else {
    throw new Error('fetchListingIds does not model attractions');
  }

  const res = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/${entity}?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${entity}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as Array<{ id: string; status?: string | null }>;
  if (entity === 'restaurants') {
    return rows.filter((r) => isVisitableStatus(r.status ?? null)).slice(0, 12).map((r) => r.id);
  }
  return rows.map((r) => r.id);
}
