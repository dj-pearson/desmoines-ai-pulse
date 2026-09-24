import { useState, useMemo, lazy, Suspense, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, Navigation, Search, ChevronUp, ChevronDown, RotateCw } from 'lucide-react';
import { upcomingOrFilter } from '@/components/events/eventsHubQuery';
import { applyEventVisibility } from '@/lib/eventQuery';
import { handleError } from '@/lib/errorHandler';
import { STALE_TIME } from '@/lib/queryConfig';
import { resolveOpenStatus, formatOpenStatusLine } from '@/lib/restaurantHours';
import { createSlug } from '@/lib/slug';
import {
  CENTRAL_TIMEZONE,
  centralDateOf,
  centralHour,
  centralWindow,
  createEventSlugWithCentralTime,
} from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { getCanonicalUrl } from '@/lib/brandConfig';
import type { MapBounds, MapEntity, MapEntityType } from '@/components/map/DiscoverMapCanvas';

// react-leaflet stays off the initial bundle (WEB-PERF-003) - the whole canvas
// (incl. leaflet and its stylesheet) loads lazily when the map renders.
const DiscoverMapCanvas = lazy(() => import('@/components/map/DiscoverMapCanvas'));

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * Marker markup per type: a shape AND a letter, so a pin is identifiable
 * without colour (explore plan WP2 item 7). The same markup draws the legend
 * swatch in each layer chip, so the chips are the legend. Static constants:
 * no row data ever reaches these strings.
 */
function markerSvg(shape: string, fill: string, glyph: string, textY = 18.5): string {
  return (
    '<svg viewBox="0 0 28 28" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
    `<g fill="${fill}" stroke="#ffffff" stroke-width="2">${shape}</g>` +
    `<text x="14" y="${textY}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff" font-family="system-ui, sans-serif">${glyph}</text>` +
    '</svg>'
  );
}

const MARKER_HTML: Record<MapEntityType, string> = {
  event: markerSvg('<circle cx="14" cy="14" r="12"/>', '#c2410c', 'E'),
  restaurant: markerSvg('<rect x="3" y="3" width="22" height="22" rx="4"/>', '#0f766e', 'R'),
  attraction: markerSvg('<path d="M14 1 L27 14 L14 27 L1 14 Z"/>', '#1d4ed8', 'A'),
  playground: markerSvg('<path d="M8 2 H20 L27 14 L20 26 H8 L1 14 Z"/>', '#be185d', 'P'),
  trail: markerSvg('<path d="M14 1 L27 26 H1 Z"/>', '#4d7c0f', 'T', 22),
};

const LAYER_CONFIG: ReadonlyArray<{ key: MapEntityType; label: string; limit: number }> = [
  { key: 'event', label: 'Events', limit: 200 },
  { key: 'restaurant', label: 'Restaurants', limit: 300 },
  { key: 'attraction', label: 'Attractions', limit: 200 },
  { key: 'playground', label: 'Playgrounds', limit: 200 },
  { key: 'trail', label: 'Trails', limit: 100 },
];
const LAYER_KEYS = LAYER_CONFIG.map((l) => l.key);
const LAYER_LIMIT = Object.fromEntries(LAYER_CONFIG.map((l) => [l.key, l.limit])) as Record<
  MapEntityType,
  number
>;
const LAYER_LABEL = Object.fromEntries(LAYER_CONFIG.map((l) => [l.key, l.label])) as Record<
  MapEntityType,
  string
>;
const DEFAULT_LAYERS: ReadonlyArray<MapEntityType> = ['event', 'restaurant', 'attraction'];

const TYPE_LABEL: Record<MapEntityType, string> = {
  event: 'Event',
  restaurant: 'Restaurant',
  attraction: 'Attraction',
  playground: 'Playground',
  trail: 'Trail',
};

// ---------------------------------------------------------------------------
// Time chips (WP2 item 8)
// ---------------------------------------------------------------------------

type When = 'now' | 'tonight' | 'weekend' | 'any';

const WHEN_OPTIONS: ReadonlyArray<{ key: When; label: string }> = [
  { key: 'now', label: 'Now' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'any', label: 'Any time' },
];

/** "Now" reaches this far ahead, the same horizon as the events hub's tonight strip. */
const NOW_AHEAD_MS = 3 * 60 * 60 * 1000;
/** Events fetch against a 15-minute bucket so the clock tick does not refetch. */
const BUCKET_MS = 15 * 60 * 1000;
/** Tonight's events start from 4 PM Central; the default flips to Tonight at the same hour. */
const TONIGHT_EVENTS_FROM_HOUR = 16;
/** "Open tonight" for a restaurant means open at 6 PM Central, or now if later. */
const TONIGHT_DINNER_HOUR = 18;

function defaultWhen(now: Date): When {
  return centralHour(now) >= TONIGHT_EVENTS_FROM_HOUR ? 'tonight' : 'any';
}

function parseWhen(value: string | null): When | null {
  return WHEN_OPTIONS.some((o) => o.key === value) ? (value as When) : null;
}

/** An instant at a Central wall-clock hour on the Central day of `now`. */
function centralTodayAt(now: number, hour: number): number {
  const day = centralDateOf(new Date(now));
  return fromZonedTime(`${day}T${String(hour).padStart(2, '0')}:00:00`, CENTRAL_TIMEZONE).getTime();
}

/**
 * The instants an event must fall in for a time chip: it starts inside
 * [from, to], or it started before `from` and its end_date has not passed
 * `from`. A row that started earlier with no end_date is not "on now": nothing
 * says it still is (the rule selectTonight uses on /events).
 */
interface EventWindow {
  from: number;
  to: number;
}

function eventWindow(when: When, now: number): EventWindow | null {
  switch (when) {
    case 'now':
      return { from: now, to: now + NOW_AHEAD_MS };
    case 'tonight':
      return {
        from: Math.max(now, centralTodayAt(now, TONIGHT_EVENTS_FROM_HOUR)),
        to: new Date(centralWindow('today', new Date(now)).end).getTime(),
      };
    case 'weekend': {
      const w = centralWindow('this-weekend', new Date(now));
      return { from: new Date(w.start).getTime(), to: new Date(w.end).getTime() };
    }
    default:
      return null;
  }
}

function inEventWindow(row: MapRow, w: EventWindow): boolean {
  const start = row.startMs;
  if (start === undefined || !Number.isFinite(start)) return false;
  if (start >= w.from && start <= w.to) return true;
  const end = row.endMs;
  return start < w.from && end !== undefined && Number.isFinite(end) && end >= w.from;
}

/** "7 PM", "7:30 PM". */
function clockLabel(ms: number): string {
  return formatInTimeZone(new Date(ms), CENTRAL_TIMEZONE, 'h:mm a').replace(':00 ', ' ');
}

function eventStatusLabel(row: MapRow, now: number): string | undefined {
  const start = row.startMs;
  if (start === undefined || !Number.isFinite(start)) return undefined;
  const end = row.endMs;
  if (start < now && end !== undefined && Number.isFinite(end) && end >= now) return 'Happening now';
  const day = formatInTimeZone(new Date(start), CENTRAL_TIMEZONE, 'EEE, MMM d');
  if (row.dateOnly) return day;
  const sameDay = centralDateOf(new Date(start)) === centralDateOf(new Date(now));
  if (sameDay) return start < now ? `Started ${clockLabel(start)}` : `Starts ${clockLabel(start)}`;
  return `${day}, ${clockLabel(start)}`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** An entity this page always links: the canvas allows href to be absent, this page does not. */
type PlacedEntity = MapEntity & { href: string };

/** A fetched row: the entity plus what the clock-dependent pass reads. */
type MapRow = PlacedEntity & {
  startMs?: number;
  endMs?: number;
  dateOnly?: boolean;
  opening?: string | null;
};

interface LayerResult {
  rows: MapRow[];
  /** Rows the server returned before any client-side check. Equal to the limit means truncated. */
  fetched: number;
}

type RowsResponse<R> = { data: R[] | null; error: unknown };

/** Statuses that are never a place to go, as useOpenNowRestaurants reads them. */
const UNVISITABLE_RESTAURANT_STATUSES = new Set(['closed', 'opening_soon', 'announced']);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseInstant(raw: string | null | undefined): { ms: number; dateOnly: boolean } | null {
  if (!raw) return null;
  if (DATE_ONLY.test(raw)) {
    // A bare date is a Central calendar day, not UTC midnight (which is the
    // previous evening in Des Moines).
    return { ms: fromZonedTime(`${raw}T00:00:00`, CENTRAL_TIMEZONE).getTime(), dateOnly: true };
  }
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? { ms, dateOnly: false } : null;
}

// NOT GENERIC OVER THE BUILDER, deliberately. Constraining T to the builder's
// own filter methods made TypeScript instantiate the full
// PostgrestFilterBuilder once per call site and report TS2589 under
// @supabase/supabase-js 2.85+. The helper asks for exactly the two methods it
// calls and hands the caller's own type back; every builder method returns the
// builder itself, so the filters land on the request.
type BoundsFilterable = {
  gte(column: string, value: number): BoundsFilterable;
  lte(column: string, value: number): BoundsFilterable;
};

/**
 * Bounds reach the SERVER, so each limit applies to rows in view rather than
 * to the city (WEB-FEAT-009 AC1). Longitude is only constrained when
 * west <= east: a viewport straddling the antimeridian would otherwise produce
 * `lng >= 179 AND lng <= -179` and silently return nothing.
 */
function inBounds<T>(query: T, bounds: MapBounds): T {
  const byLatitude = (query as unknown as BoundsFilterable)
    .gte('latitude', bounds.south)
    .lte('latitude', bounds.north);
  const scoped =
    bounds.west <= bounds.east
      ? byLatitude.gte('longitude', bounds.west).lte('longitude', bounds.east)
      : byLatitude;
  return scoped as unknown as T;
}

interface EventRow {
  id: string;
  title: string | null;
  latitude: number | string;
  longitude: number | string;
  enhanced_description: string | null;
  original_description: string | null;
  category: string | null;
  date: string | null;
  end_date: string | null;
  event_start_utc: string | null;
  is_merged?: boolean | null;
  is_hidden?: boolean | null;
  archived_at?: string | null;
}

async function fetchEvents(bounds: MapBounds, when: When, at: number): Promise<LayerResult> {
  const limit = LAYER_LIMIT.event;
  let query = applyEventVisibility(
    supabase
      .from('events')
      // public.events has no `description` - it carries enhanced_description
      // and original_description. Selecting `description` failed the whole
      // query with 42703, so the map showed no events at all.
      .select(
        'id, title, latitude, longitude, enhanced_description, original_description, category, date, end_date, event_start_utc, is_merged, is_hidden, archived_at'
      )
  )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    // Started today in Central, or a multi-day event still running: a
    // `date >= now` floor dropped every festival already under way.
    .or(upcomingOrFilter(new Date(at)));
  const w = eventWindow(when, at);
  // One bucket of slack so an event the live clock reaches before the next
  // bucket is already in the fetch; the client pass trims it.
  if (w) query = query.lte('date', new Date(w.to + BUCKET_MS).toISOString());

  const { data, error } = (await inBounds(query, bounds)
    // Soonest first: without an order the rows kept under the cap were arbitrary.
    .order('date', { ascending: true })
    .limit(limit)) as unknown as RowsResponse<EventRow>;
  if (error) throw error;

  const rows: MapRow[] = [];
  for (const e of data ?? []) {
    // Belt and braces: the request carries the same predicates.
    if (e.is_merged === true || e.is_hidden === true || e.archived_at) continue;
    const start = parseInstant(e.event_start_utc || e.date);
    const end = parseInstant(e.end_date);
    rows.push({
      id: e.id,
      name: e.title ?? 'Event',
      type: 'event',
      latitude: Number(e.latitude),
      longitude: Number(e.longitude),
      href: `/events/${createEventSlugWithCentralTime(e.title, {
        date: e.date,
        event_start_utc: e.event_start_utc,
      })}`,
      description: (e.enhanced_description ?? e.original_description)?.slice(0, 120),
      category: e.category ?? undefined,
      date: e.date ?? undefined,
      startMs: start?.ms,
      endMs: end?.ms,
      dateOnly: start?.dateOnly,
    });
  }
  return { rows, fetched: data?.length ?? 0 };
}

interface RestaurantRow {
  id: string;
  slug: string | null;
  name: string;
  latitude: number | string;
  longitude: number | string;
  description: string | null;
  cuisine: string | null;
  rating: number | string | null;
  opening: string | null;
  status: string | null;
  is_merged: boolean | null;
}

async function fetchRestaurants(bounds: MapBounds): Promise<LayerResult> {
  const limit = LAYER_LIMIT.restaurant;
  const query = supabase
    .from('restaurants')
    .select('id, slug, name, latitude, longitude, description, cuisine, rating, opening, status, is_merged')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    // The predicates /restaurants/open-now uses. `not.is.true` rather than
    // `neq.true`, because neq drops the rows where is_merged is NULL.
    .not('is_merged', 'is', true)
    .or('status.is.null,status.not.in.(closed,opening_soon,announced)');
  const { data, error } = (await inBounds(query, bounds)
    .order('name', { ascending: true })
    .limit(limit)) as unknown as RowsResponse<RestaurantRow>;
  if (error) throw error;

  const rows: MapRow[] = [];
  for (const r of data ?? []) {
    if (r.is_merged === true) continue;
    if (r.status && UNVISITABLE_RESTAURANT_STATUSES.has(r.status)) continue;
    const rating = r.rating != null ? Number(r.rating) : undefined;
    rows.push({
      id: r.id,
      name: r.name,
      type: 'restaurant',
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      href: `/restaurants/${r.slug || r.id}`,
      description: r.description?.slice(0, 120),
      category: r.cuisine ?? undefined,
      rating: rating && Number.isFinite(rating) ? rating : undefined,
      opening: r.opening,
    });
  }
  return { rows, fetched: data?.length ?? 0 };
}

interface AttractionRow {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  description: string | null;
  type: string | null;
}

async function fetchAttractions(bounds: MapBounds): Promise<LayerResult> {
  const query = supabase
    .from('attractions')
    // public.attractions classifies with `type`, not `category`.
    .select('id, name, latitude, longitude, description, type')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  const { data, error } = (await inBounds(query, bounds)
    .order('name', { ascending: true })
    .limit(LAYER_LIMIT.attraction)) as unknown as RowsResponse<AttractionRow>;
  if (error) throw error;
  const rows: MapRow[] = (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: 'attraction',
    latitude: Number(a.latitude),
    longitude: Number(a.longitude),
    // The slug resolver's own fallback until attractions.slug is confirmed
    // live (explore plan deferred D2).
    href: `/attractions/${createSlug(a.name)}`,
    description: a.description?.slice(0, 120),
    category: a.type ?? undefined,
  }));
  return { rows, fetched: data?.length ?? 0 };
}

interface PlaygroundRow {
  id: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  description: string | null;
  age_range: string | null;
}

async function fetchPlaygrounds(bounds: MapBounds): Promise<LayerResult> {
  // Bounds scoping is also what drops the 21 out-of-state rows
  // (useOutdoorsNearby.ts explains where they came from).
  const query = supabase
    .from('playgrounds')
    .select('id, name, latitude, longitude, description, age_range')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  const { data, error } = (await inBounds(query, bounds)
    .order('name', { ascending: true })
    .limit(LAYER_LIMIT.playground)) as unknown as RowsResponse<PlaygroundRow>;
  if (error) throw error;
  const rows: MapRow[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: 'playground',
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    // playgrounds has no slug column; PlaygroundDetails matches createSlug(name).
    href: `/playgrounds/${createSlug(p.name)}`,
    description: p.description?.slice(0, 120),
    category: p.age_range ? `Ages ${p.age_range}` : undefined,
  }));
  return { rows, fetched: data?.length ?? 0 };
}

interface TrailRow {
  id: string;
  name: string;
  slug: string;
  latitude: number | string;
  longitude: number | string;
  description: string | null;
  length_miles: number | string | null;
  difficulty: string | null;
}

async function fetchTrails(bounds: MapBounds): Promise<LayerResult> {
  const query = supabase
    .from('trails')
    .select('id, name, slug, latitude, longitude, description, length_miles, difficulty')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  const { data, error } = (await inBounds(query, bounds)
    .order('name', { ascending: true })
    .limit(LAYER_LIMIT.trail)) as unknown as RowsResponse<TrailRow>;
  if (error) throw error;
  const rows: MapRow[] = (data ?? []).map((t) => {
    const miles = t.length_miles != null ? Number(t.length_miles) : NaN;
    const facts = [
      Number.isFinite(miles) ? `${miles} mi` : null,
      t.difficulty,
    ].filter(Boolean);
    return {
      id: t.id,
      name: t.name,
      type: 'trail',
      latitude: Number(t.latitude),
      longitude: Number(t.longitude),
      href: `/outdoors/${t.slug}`,
      description: t.description?.slice(0, 120),
      category: facts.length > 0 ? facts.join(', ') : undefined,
    };
  });
  return { rows, fetched: data?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// URL state (WP2 item 9). New optional params only.
// ---------------------------------------------------------------------------

function parseLayers(value: string | null): Set<MapEntityType> {
  if (value === null) return new Set(DEFAULT_LAYERS);
  if (value === 'none') return new Set();
  const picked = value
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is MapEntityType => (LAYER_KEYS as string[]).includes(v));
  return picked.length > 0 ? new Set(picked) : new Set(DEFAULT_LAYERS);
}

function serializeLayers(layers: Set<MapEntityType>): string | null {
  if (layers.size === 0) return 'none';
  const ordered = LAYER_KEYS.filter((k) => layers.has(k));
  const isDefault =
    ordered.length === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((k) => layers.has(k));
  return isDefault ? null : ordered.join(',');
}

/** `bbox=west,south,east,north`, four decimals (about 11 m). */
function parseBbox(value: string | null): MapBounds | null {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts;
  if (south >= north || south < -90 || north > 90) return null;
  if (west < -180 || east > 180 || west > 180 || east < -180) return null;
  return { west, south, east, north };
}

function serializeBbox(b: MapBounds): string {
  return [b.west, b.south, b.east, b.north].map((n) => n.toFixed(4)).join(',');
}

/** Bounds equal by value. Leaflet hands back a fresh object on every moveend. */
function sameBounds(a: MapBounds | null, b: MapBounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const eps = 1e-6;
  return (
    Math.abs(a.north - b.north) < eps &&
    Math.abs(a.south - b.south) < eps &&
    Math.abs(a.east - b.east) < eps &&
    Math.abs(a.west - b.west) < eps
  );
}

function withinBounds(e: MapEntity, b: MapBounds): boolean {
  return (
    e.latitude <= b.north &&
    e.latitude >= b.south &&
    e.longitude <= b.east &&
    e.longitude >= b.west
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// WEB-PERF-023. The list rendered every entry in view, and with no bounds that
// was the full fetch: /map shipped 6,568 elements inside #root against a 481
// median. Only the LIST is capped; markers and counters report everything in
// the applied viewport.
const VISIBLE_RESULTS = 60;
const MOBILE_PEEK = 2;

export default function DiscoverMap() {
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const layersParam = searchParams.get('layers');
  const activeLayers = useMemo(() => parseLayers(layersParam), [layersParam]);
  const [fallbackWhen] = useState<When>(() => defaultWhen(new Date()));
  const when = parseWhen(searchParams.get('when')) ?? fallbackWhen;
  const selectedId = searchParams.get('sel');
  // Read once: the canvas fits to it on mount and owns the viewport after.
  const [initialBbox] = useState(() => parseBbox(searchParams.get('bbox')));

  // Bounds the map currently shows (updated on moveend) vs. the bounds the
  // query and list are scoped to ("Search this area" promotes pending ->
  // applied). Nothing is fetched until the canvas reports its first viewport,
  // so the first count is already the count in view (WP2 item 3).
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<MapBounds | null>(null);
  const firstBoundsSeen = useRef(false);
  const applyOnNextMove = useRef(false);
  const applyTimer = useRef<number | null>(null);

  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const flyKey = useRef(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Open status and "starts in" are re-derived each minute from the rows
  // already fetched; the fetch itself only moves every 15 minutes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const bucketAt = Math.floor(now / BUCKET_MS) * BUCKET_MS;

  useEffect(
    () => () => {
      if (applyTimer.current !== null) window.clearTimeout(applyTimer.current);
    },
    []
  );

  const results = useQueries({
    queries: LAYER_KEYS.map((layer) => ({
      queryKey: [
        'map-entities',
        layer,
        appliedBounds ? serializeBbox(appliedBounds) : null,
        layer === 'event' ? when : null,
        layer === 'event' ? bucketAt : null,
      ],
      queryFn: (): Promise<LayerResult> => {
        const b = appliedBounds as MapBounds;
        switch (layer) {
          case 'event':
            return fetchEvents(b, when, bucketAt);
          case 'restaurant':
            return fetchRestaurants(b);
          case 'attraction':
            return fetchAttractions(b);
          case 'playground':
            return fetchPlaygrounds(b);
          default:
            return fetchTrails(b);
        }
      },
      enabled: appliedBounds !== null && activeLayers.has(layer),
      // Keep the last rows on screen while a new viewport loads, rather than
      // dropping to a skeleton that unmounted the map (WP2 item 2).
      placeholderData: keepPreviousData,
      staleTime: STALE_TIME.CONTENT_LIST,
    })),
  });

  const byLayer = useMemo(() => {
    const out = {} as Record<MapEntityType, (typeof results)[number]>;
    LAYER_KEYS.forEach((k, i) => {
      out[k] = results[i];
    });
    return out;
  }, [results]);

  const activeKeys = LAYER_KEYS.filter((k) => activeLayers.has(k));
  const failedLayers = activeKeys.filter((k) => byLayer[k].isError);
  const allFailed = activeKeys.length > 0 && failedLayers.length === activeKeys.length;
  const isFetching = activeKeys.some((k) => byLayer[k].isFetching);
  const awaitingFirst =
    appliedBounds === null || activeKeys.some((k) => byLayer[k].data === undefined && !byLayer[k].isError);

  // Report each failure once, with the layer that failed.
  const errorKey = LAYER_KEYS.map((k) => byLayer[k].errorUpdatedAt).join(',');
  useEffect(() => {
    for (const k of LAYER_KEYS) {
      const r = byLayer[k];
      if (r.isError && r.error) {
        handleError(r.error, {
          component: 'DiscoverMap',
          action: 'fetchEntities',
          metadata: { layer: k },
        });
      }
    }
    // byLayer changes every render; errorKey moves only when an error does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorKey]);

  const retryFailed = () => {
    for (const k of failedLayers) void byLayer[k].refetch();
  };

  // The clock-dependent pass: time-chip filtering and status labels.
  const entities = useMemo(() => {
    const out: PlacedEntity[] = [];
    const evWindow = eventWindow(when, now);
    const dinnerAt =
      when === 'tonight' ? Math.max(now, centralTodayAt(now, TONIGHT_DINNER_HOUR)) : now;
    for (const k of activeKeys) {
      const rows = byLayer[k].data?.rows ?? [];
      for (const row of rows) {
        const { startMs: _s, endMs: _e, dateOnly: _d, opening, ...entity } = row;
        if (k === 'event') {
          if (evWindow && !inEventWindow(row, evWindow)) continue;
          out.push({ ...entity, statusLabel: eventStatusLabel(row, now) });
        } else if (k === 'restaurant') {
          const status = resolveOpenStatus(undefined, opening, new Date(dinnerAt));
          if (
            (when === 'now' || when === 'tonight') &&
            status.status !== 'open' &&
            status.status !== 'closing-soon'
          ) {
            continue;
          }
          const labelStatus =
            dinnerAt === now ? status : resolveOpenStatus(undefined, opening, new Date(now));
          out.push({ ...entity, statusLabel: formatOpenStatusLine(labelStatus) ?? undefined });
        } else {
          out.push(entity);
        }
      }
    }
    return out;
    // activeKeys is derived from activeLayers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byLayer, activeLayers, when, now]);

  // Markers and list both show what is inside the applied viewport, so
  // "N in view" is the number of pins a user can count.
  const inView = useMemo(
    () => (appliedBounds ? entities.filter((e) => withinBounds(e, appliedBounds)) : []),
    [entities, appliedBounds]
  );

  const countByType = useMemo(() => {
    const counts = Object.fromEntries(LAYER_KEYS.map((k) => [k, 0])) as Record<MapEntityType, number>;
    for (const e of inView) counts[e.type] += 1;
    return counts;
  }, [inView]);

  const truncated = (k: MapEntityType) =>
    activeLayers.has(k) && (byLayer[k].data?.fetched ?? 0) >= LAYER_LIMIT[k];
  const anyTruncated = activeKeys.some(truncated);
  // No number until one is known: "0 in view" while the first fetch is in
  // flight, or after every layer failed, states a count nothing computed.
  const countText = allFailed
    ? 'Places unavailable'
    : awaitingFirst && inView.length === 0
      ? 'Loading places...'
      : `${inView.length}${anyTruncated ? '+' : ''} in view`;

  const visibleResults = inView.slice(0, VISIBLE_RESULTS);
  const hiddenResults = inView.length - visibleResults.length;

  const boundsAreStale = pendingBounds !== null && !sameBounds(pendingBounds, appliedBounds);

  const applyBounds = useCallback(
    (b: MapBounds) => {
      setAppliedBounds(b);
      updateParams((p) => p.set('bbox', serializeBbox(b)));
    },
    [updateParams]
  );

  const handleBoundsChange = useCallback(
    (b: MapBounds) => {
      setPendingBounds(b);
      if (!firstBoundsSeen.current) {
        firstBoundsSeen.current = true;
        setAppliedBounds(b);
        return;
      }
      if (applyOnNextMove.current) {
        applyOnNextMove.current = false;
        if (applyTimer.current !== null) window.clearTimeout(applyTimer.current);
        applyBounds(b);
      }
    },
    [applyBounds]
  );

  const handleSearchArea = () => {
    if (pendingBounds) applyBounds(pendingBounds);
  };

  const toggleLayer = (key: MapEntityType) => {
    const next = new Set(activeLayers);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const value = serializeLayers(next);
    updateParams((p) => {
      if (value === null) p.delete('layers');
      else p.set('layers', value);
    });
  };

  const setWhen = (key: When) => {
    updateParams((p) => p.set('when', key));
  };

  const handleSelect = (id: string) => {
    updateParams((p) => p.set('sel', id));
    const entity = entities.find((e) => e.id === id);
    if (entity) {
      flyKey.current += 1;
      setFlyTo({ lat: entity.latitude, lng: entity.longitude, key: flyKey.current });
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setGeoMessage('Location is not available in this browser. Pan the map instead.');
      return;
    }
    setLocating(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(here);
        // Apply the viewport once the fly-to settles, so the list and counts
        // describe where the user is rather than where the map was.
        applyOnNextMove.current = true;
        if (applyTimer.current !== null) window.clearTimeout(applyTimer.current);
        applyTimer.current = window.setTimeout(() => {
          applyOnNextMove.current = false;
        }, 3000);
        flyKey.current += 1;
        setFlyTo({ ...here, key: flyKey.current });
      },
      (err) => {
        setLocating(false);
        setGeoMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission is off. Pan the map to your area instead.'
            : 'Could not find your location. Pan the map to your area instead.'
        );
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const statusNotice = allFailed ? (
    <div className="p-4 space-y-2" role="alert">
      <p className="text-sm">The map could not load places right now.</p>
      <Button size="sm" variant="outline" onClick={retryFailed} className="min-h-11">
        <RotateCw className="h-4 w-4 mr-1" aria-hidden="true" /> Retry
      </Button>
    </div>
  ) : failedLayers.length > 0 ? (
    <div className="p-3 text-sm border-b flex items-center justify-between gap-2" role="alert">
      <span>
        Could not load {listNames(failedLayers.map((k) => LAYER_LABEL[k]))}. Other layers are shown.
      </span>
      <Button size="sm" variant="outline" onClick={retryFailed} className="min-h-11 shrink-0">
        Retry
      </Button>
    </div>
  ) : null;

  const renderRow = (e: PlacedEntity) => {
    const selected = selectedId === e.id;
    return (
      <li key={`${e.type}:${e.id}`} className={cn('flex items-center', selected && 'bg-primary/10')}>
        <button
          type="button"
          onClick={() => handleSelect(e.id)}
          className="flex-1 min-w-0 text-left p-3 hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-current={selected ? 'true' : undefined}
        >
          <span className="flex items-center gap-2 mb-0.5">
            <Badge variant="outline" className="text-[10px]">
              {TYPE_LABEL[e.type]}
            </Badge>
            {e.rating != null && e.rating > 0 && (
              <span className="text-[11px] text-muted-foreground">
                <Star className="h-3 w-3 inline mr-0.5 text-amber-500" aria-hidden="true" />
                {e.rating}
                <span className="sr-only"> out of 5</span>
              </span>
            )}
          </span>
          <span className="block font-medium text-sm line-clamp-1">{e.name}</span>
          {e.statusLabel && <span className="block text-xs font-medium">{e.statusLabel}</span>}
          {e.category && (
            <span className="block text-xs text-muted-foreground line-clamp-1">{e.category}</span>
          )}
        </button>
        <Link
          to={e.href}
          className="shrink-0 inline-flex min-h-11 items-center px-3 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View details<span className="sr-only"> for {e.name}</span>
        </Link>
      </li>
    );
  };

  const emptyText =
    activeKeys.length === 0
      ? 'Turn on a layer to see places.'
      : when !== 'any'
        ? 'Nothing matches this time in this area. Try "Any time", or pan and "Search this area".'
        : 'No results in this area. Pan or zoom out, then "Search this area".';

  const renderResults = (limit: number, showTruncation: boolean) => (
    <ul className="divide-y" aria-label="Results in view">
      {allFailed ? null : awaitingFirst && inView.length === 0 ? (
        <li className="p-4 text-sm text-muted-foreground">Loading places...</li>
      ) : inView.length === 0 ? (
        <li className="p-4 text-sm text-muted-foreground">{emptyText}</li>
      ) : (
        inView.slice(0, limit).map(renderRow)
      )}
      {showTruncation && !allFailed && (hiddenResults > 0 || anyTruncated) && (
        // Say what is not shown. A list that stops without saying so reads as
        // "that is everything", which is how a truncation becomes a fact.
        <li className="p-3 text-xs text-muted-foreground">
          {hiddenResults > 0 && `Showing the first ${VISIBLE_RESULTS} of ${inView.length} results. `}
          {anyTruncated && 'Some layers have more places here than the map loads at once. '}
          Zoom in or pan, then "Search this area", to narrow them down.
        </li>
      )}
    </ul>
  );

  const chipClass = 'shrink-0 min-h-11 md:min-h-9';

  return (
    <>
      <Helmet>
        <title>Discover Map - Explore Des Moines | Des Moines Insider</title>
        <meta
          name="description"
          content="See what's on tonight and what's open now in Des Moines. Browse events, restaurants, attractions, playgrounds and trails on one map."
        />
        {/* WEB-SEO-002: sitemapped and prerendered, but had no canonical. */}
        <link rel="canonical" href={getCanonicalUrl('/map')} />
        <meta property="og:title" content="Discover Map - Explore Des Moines | Des Moines Insider" />
        <meta
          property="og:description"
          content="See what's on tonight and what's open now in Des Moines. Browse events, restaurants, attractions, playgrounds and trails on one map."
        />
        <meta property="og:url" content={getCanonicalUrl('/map')} />
        <meta name="twitter:title" content="Discover Map - Explore Des Moines | Des Moines Insider" />
        <meta
          name="twitter:description"
          content="See what's on tonight and what's open now in Des Moines. Browse events, restaurants, attractions, playgrounds and trails on one map."
        />
      </Helmet>
      {/* WEB-SEO-004: the UI is map-first with no natural place for a visible
          title, so the h1 is screen-reader only. */}
      <h1 className="sr-only">Explore Des Moines on a Map - Events, Restaurants, Attractions, Playgrounds and Trails</h1>
      {/* Below md the page is exactly one screen: header, controls, map. The
          app's <main> already pads 5rem for the bottom nav, hence the calc. */}
      <div className="h-[calc(100dvh-5rem)] md:h-auto md:min-h-screen bg-background flex flex-col">
        <Header />

        {/* Controls: one horizontally scrolling row on phones */}
        <div className="border-b bg-card px-4 py-2">
          <div className="container mx-auto px-0 flex items-center gap-2 overflow-x-auto md:flex-wrap">
            <div role="group" aria-label="Map layers" className="shrink-0 flex items-center gap-2 md:flex-wrap">
              {LAYER_CONFIG.map(({ key, label }) => {
                const on = activeLayers.has(key);
                return (
                  <Button
                    key={key}
                    variant={on ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleLayer(key)}
                    aria-pressed={on}
                    className={chipClass}
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 mr-1 inline-block"
                      // Static page constant (MARKER_HTML); no row data.
                      dangerouslySetInnerHTML={{ __html: MARKER_HTML[key] }}
                    />
                    {label}
                    {on && byLayer[key].data && (
                      <Badge variant="secondary" className="ml-1 text-xs">
                        {countByType[key]}
                        {truncated(key) ? '+' : ''}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
            <span className="shrink-0 h-6 w-px bg-border mx-1" aria-hidden="true" />
            <div
              role="group"
              aria-label="When (events and restaurants)"
              className="shrink-0 flex items-center gap-2"
            >
              {WHEN_OPTIONS.map(({ key, label }) => (
                <Button
                  key={key}
                  variant={when === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setWhen(key)}
                  aria-pressed={when === key}
                  className={chipClass}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNearMe}
              disabled={locating}
              className={cn(chipClass, 'md:ml-auto')}
            >
              <Navigation className="h-4 w-4 mr-1" aria-hidden="true" />
              {locating ? 'Locating...' : 'Near me'}
            </Button>
          </div>
          {geoMessage && (
            <p className="container mx-auto px-0 pt-1 text-xs" role="status">
              {geoMessage}
            </p>
          )}
        </div>

        {/* Map + results */}
        <div className="flex-1 min-h-0 relative flex md:min-h-[70vh]">
          {/* Desktop sidebar list */}
          <aside className="hidden md:flex md:flex-col w-80 border-r bg-card overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-sm font-semibold" aria-live="polite">
                {countText}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {statusNotice}
              {renderResults(VISIBLE_RESULTS, true)}
            </div>
          </aside>

          {/* Map: always mounted, so a new search never resets the viewport */}
          <div className="flex-1 relative">
            <Suspense fallback={<Skeleton className="w-full h-full absolute inset-0" />}>
              <DiscoverMapCanvas
                entities={inView}
                selectedId={selectedId}
                onSelect={handleSelect}
                onBoundsChange={handleBoundsChange}
                flyTo={flyTo}
                initialBounds={initialBbox}
                userLocation={userLocation}
                markerHtml={MARKER_HTML}
                typeLabel={TYPE_LABEL}
              />
            </Suspense>

            {/* Search this area + loading pill */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
              <Button
                size="sm"
                onClick={handleSearchArea}
                disabled={!boundsAreStale}
                className="min-h-11 md:min-h-9"
              >
                <Search className="h-4 w-4 mr-1" aria-hidden="true" /> Search this area
              </Button>
              <div role="status" aria-live="polite">
                {isFetching && (
                  <span className="rounded-full border bg-card px-3 py-1 text-xs">
                    Loading places...
                  </span>
                )}
              </div>
            </div>

            {/* Mobile bottom sheet: collapsed, it still shows the first two results */}
            <div className="md:hidden absolute bottom-0 inset-x-0 z-[1000]">
              <div className="mx-2 rounded-t-xl border border-b-0 bg-card">
                <button
                  type="button"
                  onClick={() => setSheetOpen((o) => !o)}
                  className="w-full min-h-11 flex items-center justify-between px-4 py-2"
                  aria-expanded={sheetOpen}
                  aria-controls="discover-map-sheet"
                >
                  <span className="text-sm font-semibold" aria-live="polite">
                    {countText}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {sheetOpen ? 'Hide list' : 'Show list'}
                    {sheetOpen ? (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                </button>
                <div
                  id="discover-map-sheet"
                  className={cn('border-t overflow-y-auto', sheetOpen ? 'max-h-[45vh]' : 'max-h-40')}
                >
                  {statusNotice}
                  {sheetOpen
                    ? renderResults(VISIBLE_RESULTS, true)
                    : renderResults(MOBILE_PEEK, false)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The map is the phone page; the footer would push it off screen. */}
        <div className="hidden md:block">
          <Footer />
        </div>
      </div>
    </>
  );
}
