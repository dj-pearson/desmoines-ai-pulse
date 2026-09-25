import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CalendarDays, UtensilsCrossed, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { isDateOnly } from '@/lib/dateOnly';
import { centralDateOf } from '@/lib/timezone';
import { handleError } from '@/lib/errorHandler';

export type SponsorableListingType = 'event' | 'restaurant';

export interface LinkedListing {
  type: SponsorableListingType;
  id: string;
  name: string;
  image_url?: string | null;
  subtitle?: string | null;
  /**
   * The Central calendar day an event ends (yyyy-MM-dd). A sponsorship can't
   * outlive its event, so /advertise caps the campaign's end date here.
   * Restaurants have none.
   */
  endsOn?: string | null;
}

interface ListingPickerProps {
  value: LinkedListing | null;
  onChange: (listing: LinkedListing | null) => void;
}

interface EventRow {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  location: string | null;
  image_url: string | null;
}

interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string | null;
  location: string | null;
  image_url: string | null;
}

const EVENT_COLUMNS = 'id, title, date, end_date, location, image_url';
const RESTAURANT_COLUMNS = 'id, name, cuisine, location, image_url';

/** The Central day a date or timestamp falls on. A bare date is already one. */
function centralDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isDateOnly(value)) return value;
  try {
    return centralDateOf(value);
  } catch {
    return null;
  }
}

function eventListing(event: EventRow): LinkedListing {
  const startDay = centralDay(event.date);
  return {
    type: 'event',
    id: event.id,
    name: event.title,
    image_url: event.image_url,
    subtitle: [startDay, event.location].filter(Boolean).join(' - '),
    endsOn: centralDay(event.end_date) ?? startDay,
  };
}

function restaurantListing(restaurant: RestaurantRow): LinkedListing {
  return {
    type: 'restaurant',
    id: restaurant.id,
    name: restaurant.name,
    image_url: restaurant.image_url,
    subtitle: [restaurant.cuisine, restaurant.location].filter(Boolean).join(' - '),
    endsOn: null,
  };
}

/**
 * Read one listing by id, for a deep link (business plan WP1 item 7). The
 * name shown is the database's, never the one in the URL: a link could put
 * any text there, and the summary would have repeated it back as the thing
 * being sponsored. Null when the row doesn't exist or can't be read.
 */
export async function fetchListingById(
  type: SponsorableListingType,
  id: string,
): Promise<LinkedListing | null> {
  try {
    if (type === 'event') {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? eventListing(data as EventRow) : null;
    }
    const { data, error } = await supabase
      .from('restaurants')
      .select(RESTAURANT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? restaurantListing(data as RestaurantRow) : null;
  } catch (error) {
    handleError(error, { component: 'ListingPicker', action: 'fetchListingById' });
    return null;
  }
}

interface ListingOptionProps {
  listing: LinkedListing;
  selected: boolean;
  onSelect: () => void;
}

function ListingOption({ listing, selected, onSelect }: ListingOptionProps) {
  const Fallback = listing.type === 'event' ? CalendarDays : UtensilsCrossed;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full min-h-[44px] items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      )}
    >
      {listing.image_url ? (
        <img src={listing.image_url} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted">
          <Fallback className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{listing.name}</span>
        {listing.subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{listing.subtitle}</span>
        )}
      </span>
      {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

export function ListingPicker({ value, onChange }: ListingPickerProps) {
  const [tab, setTab] = useState<SponsorableListingType>(value?.type ?? 'event');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<LinkedListing[]>([]);
  const [restaurants, setRestaurants] = useState<LinkedListing[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);

  // Central, not UTC: after 7pm in Des Moines the UTC date is already
  // tomorrow, and tonight's events dropped out of the list.
  const today = centralDateOf();

  useEffect(() => {
    setLoadingEvents(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      let query = supabase
        .from('events')
        .select(EVENT_COLUMNS)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(50);

      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) handleError(error, { component: 'ListingPicker', action: 'searchEvents' });
      setEvents(((data as EventRow[] | null) ?? []).map(eventListing));
      setLoadingEvents(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, today]);

  useEffect(() => {
    setLoadingRestaurants(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      let query = supabase
        .from('restaurants')
        .select(RESTAURANT_COLUMNS)
        .order('name', { ascending: true })
        .limit(50);

      if (search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) handleError(error, { component: 'ListingPicker', action: 'searchRestaurants' });
      setRestaurants(((data as RestaurantRow[] | null) ?? []).map(restaurantListing));
      setLoadingRestaurants(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  function toggle(listing: LinkedListing) {
    onChange(value?.id === listing.id ? null : listing);
  }

  function renderList(items: LinkedListing[], loading: boolean, emptyText: string) {
    if (loading) {
      return Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[74px] w-full rounded-xl" />);
    }
    if (items.length === 0) {
      return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }
    return items.map((item) => (
      <ListingOption
        key={item.id}
        listing={item}
        selected={value?.type === item.type && value.id === item.id}
        onSelect={() => toggle(item)}
      />
    ));
  }

  return (
    <div className="space-y-4">
      {value && (
        <div className="flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-3" aria-live="polite">
          {value.image_url && (
            <img src={value.image_url} alt="" className="h-12 w-16 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Sponsoring</p>
            <p className="truncate text-sm font-medium" id="linked-listing-name">{value.name}</p>
            {value.subtitle && <p className="truncate text-xs text-muted-foreground">{value.subtitle}</p>}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Search events and restaurants by name"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SponsorableListingType)}>
        <TabsList className="w-full">
          <TabsTrigger value="event" className="flex-1 gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Events
          </TabsTrigger>
          <TabsTrigger value="restaurant" className="flex-1 gap-2">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" /> Restaurants
          </TabsTrigger>
        </TabsList>

        <TabsContent value="event" className="mt-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {renderList(events, loadingEvents, 'No upcoming events found.')}
          </div>
        </TabsContent>

        <TabsContent value="restaurant" className="mt-3">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {renderList(restaurants, loadingRestaurants, 'No restaurants found.')}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
