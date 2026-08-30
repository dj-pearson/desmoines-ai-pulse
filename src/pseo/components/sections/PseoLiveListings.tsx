/**
 * PseoLiveListings — Dynamic data-driven listing component.
 *
 * Queries the database based on page dimensions to show real-time
 * events, restaurants, or attractions matching the page's filters.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, DollarSign } from 'lucide-react';
import type { PseoDimensionRef } from '../../schemas';
import { CATEGORY_FILTERS, temporalRange } from '../../listingFilters';

interface PseoLiveListingsProps {
  dimensions: PseoDimensionRef[];
  pageTypeId: string;
}

export function PseoLiveListings({ dimensions, pageTypeId }: PseoLiveListingsProps) {
  const contentType = dimensions.find((d) => d.dimension === 'content_type');
  const category = dimensions.find((d) => d.dimension === 'category');

  // `location` used to be bound here and never read - the same dead-binding
  // shape as `temporal` in fetchListings, which is the bug that made every
  // temporal variant of a page render the same twelve rows.
  const entityType = resolveEntityType(contentType?.slug, category?.slug);

  const { data: items, isLoading } = useQuery({
    queryKey: ['pseo-listings', pageTypeId, ...dimensions.map((d) => d.slug)],
    queryFn: () => fetchListings(entityType, dimensions),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <section>
        <h2 className="text-2xl font-bold mb-4">What&apos;s Available</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (!items?.length) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">
        {entityType === 'events' ? 'Upcoming Events' :
         entityType === 'restaurants' ? 'Top Restaurants' :
         'Top Attractions'}
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ListingCard key={item.id} item={item} entityType={entityType} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Listing Card
// ---------------------------------------------------------------------------

interface ListingItem {
  id: string;
  name: string;
  description?: string;
  location?: string;
  date?: string;
  price?: string;
  rating?: number;
  category?: string;
  image_url?: string;
  slug?: string;
}

function ListingCard({ item, entityType }: { item: ListingItem; entityType: string }) {
  const linkPath = entityType === 'events'
    ? `/events/${item.slug ?? item.id}`
    : entityType === 'restaurants'
    ? `/restaurants/${item.slug ?? item.id}`
    : `/attractions/${item.slug ?? item.id}`;

  return (
    <Link to={linkPath}>
      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
        {item.image_url && (
          <div className="h-36 overflow-hidden rounded-t-lg">
            <img
              src={item.image_url}
              alt={item.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <CardHeader className="pb-2">
          <CardTitle className="text-base line-clamp-2">{item.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {item.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {item.location}
              </span>
            )}
            {item.date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(item.date).toLocaleDateString()}
              </span>
            )}
            {item.price && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {item.price}
              </span>
            )}
          </div>
          {item.category && (
            <Badge variant="secondary" className="text-xs">
              {item.category}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------------

function resolveEntityType(contentSlug?: string, categorySlug?: string): string {
  if (contentSlug === 'restaurants') return 'restaurants';
  if (contentSlug === 'attractions') return 'attractions';
  if (contentSlug === 'events' || contentSlug === 'things-to-do' || contentSlug === 'nightlife') return 'events';

  // Infer from category
  const restaurantCategories = ['italian', 'mexican', 'asian', 'bbq', 'brunch', 'coffee', 'steakhouse'];
  if (categorySlug && restaurantCategories.includes(categorySlug)) return 'restaurants';

  const eventCategories = ['live-music', 'festivals', 'arts-culture', 'sports', 'farmers-markets'];
  if (categorySlug && eventCategories.includes(categorySlug)) return 'events';

  return 'events'; // Default
}

async function fetchListings(
  entityType: string,
  dimensions: PseoDimensionRef[]
): Promise<ListingItem[]> {
  const location = dimensions.find((d) => d.dimension === 'location');
  const category = dimensions.find((d) => d.dimension === 'category');
  const temporal = dimensions.find((d) => d.dimension === 'temporal');

  // An incoherent page lists nothing rather than everything. The taxonomy
  // crosses every content_type with every category, so it produced
  // /events/italian and /things-to-do/bbq - a cuisine narrowing an events page.
  // There is no such thing as an Italian event, and dropping the filter as
  // unapplicable would render the generic next-twelve events under a URL
  // promising Italian ones, which is the doorway-page shape AC5 exists to stop.
  // 20 published pages are this way; the audit reports them with no inventory,
  // which is the truth about them.
  const categoryFilter = category ? CATEGORY_FILTERS[category.slug] : undefined;
  if (category && categoryFilter && categoryFilter.entity !== entityType) return [];

  if (entityType === 'events') {
    let query = supabase
      .from('events')
      // public.events has no `description` (enhanced_description /
      // original_description instead). Selecting it failed the whole query with
      // 42703, so every pSEO event landing page rendered an empty listing block.
      .select('id, title, enhanced_description, original_description, location, date, price, category, image_url')
      .gte('date', new Date().toISOString())
      .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
      .order('date', { ascending: true })
      .limit(12);

    if (location) {
      // venue is in the OR because that is where a neighbourhood name actually
      // lands on this table - events.city is NULL on 1,243 of 1,249 rows, so the
      // city arm almost never fires. Same fields EventsByLocation.tsx matches.
      query = query.or(
        `city.ilike.%${location.name}%,location.ilike.%${location.name}%,venue.ilike.%${location.name}%`,
      );
    }
    if (categoryFilter?.entity === 'events') {
      query = query.filter(categoryFilter.column, 'imatch', categoryFilter.pattern);
    }
    if (temporal) {
      const range = temporalRange(temporal.slug);
      if (range) query = query.gte('date', range.from).lte('date', range.to);
    }

    const { data, error } = await query;
    // The component renders NOTHING when this returns empty - `if (!items?.length)
    // return null` - so a failed query removes the listing block from the page
    // entirely and the pSEO page silently becomes prose with no inventory. That
    // is exactly the doorway-page shape WEB-SEO-013 AC5 exists to prevent, and
    // an empty listing from a failed read is indistinguishable from a genuinely
    // empty one. Throwing lets react-query surface it instead.
    if (error) throw error;
    return (data ?? []).map((e) => ({
      id: e.id,
      name: e.title,
      description: e.enhanced_description ?? e.original_description ?? undefined,
      location: e.location ?? undefined,
      date: e.date ?? undefined,
      price: e.price ?? undefined,
      category: e.category ?? undefined,
      image_url: e.image_url ?? undefined,
    }));
  }

  if (entityType === 'restaurants') {
    let query = supabase
      .from('restaurants')
      .select('id, name, description, location, price_range, rating, cuisine, image_url, slug')
      .order('rating', { ascending: false })
      .limit(12);

    if (location) {
      query = query.or(`city.ilike.%${location.name}%,location.ilike.%${location.name}%`);
    }
    if (categoryFilter?.entity === 'restaurants') {
      query = query.filter(categoryFilter.column, 'imatch', categoryFilter.pattern);
    }
    // No temporal filter here on purpose: restaurants carry no date, so
    // /italian/today and /italian/winter list the same restaurants. That is the
    // taxonomy generating a dimension the entity does not have, not a bug to fix
    // in this query.

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      location: r.location ?? undefined,
      price: r.price_range ?? undefined,
      rating: r.rating ?? undefined,
      category: r.cuisine ?? undefined,
      image_url: r.image_url ?? undefined,
      slug: r.slug ?? undefined,
    }));
  }

  // Attractions
  let query = supabase
    .from('attractions')
    .select('id, name, description, location, type, image_url')
    .order('name')
    .limit(12);

  if (location) {
    query = query.ilike('location', `%${location.name}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? undefined,
    location: a.location ?? undefined,
    category: a.type ?? undefined,
    image_url: a.image_url ?? undefined,
  }));
}
