import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Search, CalendarDays, UtensilsCrossed, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export interface LinkedListing {
  type: 'event' | 'restaurant';
  id: string;
  name: string;
  image_url?: string | null;
  subtitle?: string | null;
}

interface ListingPickerProps {
  value: LinkedListing | null;
  onChange: (listing: LinkedListing | null) => void;
}

interface EventRow {
  id: string;
  title: string;
  date: string;
  location: string;
  image_url: string | null;
}

interface RestaurantRow {
  id: string;
  name: string;
  cuisine: string | null;
  location: string | null;
  image_url: string | null;
}

export function ListingPicker({ value, onChange }: ListingPickerProps) {
  const [tab, setTab] = useState<'event' | 'restaurant'>('event');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<EventRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    setLoadingEvents(true);
    const timer = setTimeout(async () => {
      let query = supabase
        .from('events')
        .select('id, title, date, location, image_url')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(50);

      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      const { data } = await query;
      setEvents((data as EventRow[]) ?? []);
      setLoadingEvents(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, today]);

  useEffect(() => {
    setLoadingRestaurants(true);
    const timer = setTimeout(async () => {
      let query = supabase
        .from('restaurants')
        .select('id, name, cuisine, location, image_url')
        .order('name', { ascending: true })
        .limit(50);

      if (search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }

      const { data } = await query;
      setRestaurants((data as RestaurantRow[]) ?? []);
      setLoadingRestaurants(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function selectEvent(event: EventRow) {
    const listing: LinkedListing = {
      type: 'event',
      id: event.id,
      name: event.title,
      image_url: event.image_url,
      subtitle: `${event.date} · ${event.location}`,
    };
    onChange(value?.id === event.id ? null : listing);
  }

  function selectRestaurant(restaurant: RestaurantRow) {
    const listing: LinkedListing = {
      type: 'restaurant',
      id: restaurant.id,
      name: restaurant.name,
      image_url: restaurant.image_url,
      subtitle: [restaurant.cuisine, restaurant.location].filter(Boolean).join(' · '),
    };
    onChange(value?.id === restaurant.id ? null : listing);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {value && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          {value.image_url && (
            <img
              src={value.image_url}
              alt={value.name}
              className="h-12 w-16 object-cover rounded"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{value.name}</p>
            {value.subtitle && (
              <p className="text-xs text-muted-foreground truncate">{value.subtitle}</p>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 text-amber-600 border-amber-400">
            Selected
          </Badge>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'event' | 'restaurant')}>
        <TabsList className="w-full">
          <TabsTrigger value="event" className="flex-1 gap-2">
            <CalendarDays className="h-4 w-4" /> Events
          </TabsTrigger>
          <TabsTrigger value="restaurant" className="flex-1 gap-2">
            <UtensilsCrossed className="h-4 w-4" /> Restaurants
          </TabsTrigger>
        </TabsList>

        <TabsContent value="event" className="mt-3">
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {loadingEvents
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))
              : events.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">No upcoming events found.</p>
              : events.map((event) => {
                  const selected = value?.type === 'event' && value.id === event.id;
                  return (
                    <Card
                      key={event.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selected ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => selectEvent(event)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        {event.image_url ? (
                          <img
                            src={event.image_url}
                            alt={event.title}
                            className="h-12 w-16 object-cover rounded shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                            <CalendarDays className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {event.date} · {event.location}
                          </p>
                        </div>
                        {selected && <CheckCircle2 className="h-5 w-5 text-amber-500 shrink-0" />}
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </TabsContent>

        <TabsContent value="restaurant" className="mt-3">
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {loadingRestaurants
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))
              : restaurants.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">No restaurants found.</p>
              : restaurants.map((restaurant) => {
                  const selected = value?.type === 'restaurant' && value.id === restaurant.id;
                  return (
                    <Card
                      key={restaurant.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selected ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => selectRestaurant(restaurant)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        {restaurant.image_url ? (
                          <img
                            src={restaurant.image_url}
                            alt={restaurant.name}
                            className="h-12 w-16 object-cover rounded shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                            <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{restaurant.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[restaurant.cuisine, restaurant.location].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {selected && <CheckCircle2 className="h-5 w-5 text-amber-500 shrink-0" />}
                      </CardContent>
                    </Card>
                  );
                })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
