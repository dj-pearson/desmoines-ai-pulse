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

interface PseoLiveListingsProps {
  dimensions: PseoDimensionRef[];
  pageTypeId: string;
}

export function PseoLiveListings({ dimensions, pageTypeId }: PseoLiveListingsProps) {
  const contentType = dimensions.find((d) => d.dimension === 'content_type');
  const location = dimensions.find((d) => d.dimension === 'location');
  const category = dimensions.find((d) => d.dimension === 'category');

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

  if (entityType === 'events') {
    let query = supabase
      .from('events')
      .select('id, title, description, location, date, price, category, image_url')
      .gte('date', new Date().toISOString())
      .neq('is_hidden', true) // Exclude soft-hidden stale events (WEB-AUTO-006)
      .order('date', { ascending: true })
      .limit(12);

    if (location) {
      query = query.or(`city.ilike.%${location.name}%,location.ilike.%${location.name}%`);
    }
    if (category) {
      query = query.ilike('category', `%${category.name}%`);
    }

    const { data } = await query;
    return (data ?? []).map((e) => ({
      id: e.id,
      name: e.title,
      description: e.description ?? undefined,
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
    if (category) {
      query = query.ilike('cuisine', `%${category.name}%`);
    }

    const { data } = await query;
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

  const { data } = await query;
  return (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? undefined,
    location: a.location ?? undefined,
    category: a.type ?? undefined,
    image_url: a.image_url ?? undefined,
  }));
}
