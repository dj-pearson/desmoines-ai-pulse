import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  addCentralDays,
  centralDateOf,
  createEventSlugWithCentralTime,
  formatInCentralTime,
  hasSpecificTime,
} from "@/lib/timezone";
import { eventPriceLabel } from "@/lib/eventPrice";
import type { MapEvent } from "@/hooks/useEventsMapData";

/**
 * The /events map view (docs/page-plans/events.md WP4).
 *
 * Pins are grouped by venue, coloured by Central calendar day, drawn as inline
 * SVG (no hotlinked PNGs), and the map lets the page scroll past it.
 */

// ---------------------------------------------------------------------------
// When: Central calendar-day buckets
// ---------------------------------------------------------------------------

type PinBucket = "today" | "week" | "later" | "earlier";

/** Most urgent first; a venue pin takes the most urgent of its events. */
const BUCKET_ORDER: readonly PinBucket[] = ["today", "week", "later", "earlier"];

function startOf(event: Pick<MapEvent, "event_start_utc" | "date">): string {
  return event.event_start_utc || event.date;
}

/**
 * Which bucket an event falls in, by Central calendar day rather than a
 * millisecond diff. The old diff called a 9pm show "future" at 8am and
 * tomorrow's 1am show "today". A multi-day event that started earlier and is
 * still running counts as today.
 */
function pinBucket(event: MapEvent, now: Date = new Date()): PinBucket {
  const today = centralDateOf(now);
  let day: string;
  try {
    day = centralDateOf(startOf(event));
  } catch {
    return "later";
  }
  if (day === today) return "today";
  if (day < today) {
    if (event.end_date && new Date(event.end_date).getTime() >= now.getTime()) return "today";
    return "earlier";
  }
  if (day <= addCentralDays(today, 6)) return "week";
  return "later";
}

// ---------------------------------------------------------------------------
// Pins: inline SVG divIcons, built once per (bucket, count) and cached
// ---------------------------------------------------------------------------

interface BucketStyle {
  label: string;
  /** Pin fill, from the colour tokens in index.css. */
  fill: string;
  /** Glyph colour on that fill. */
  ink: string;
  /** SVG markup for the glyph, drawn in a 24x24 box centred at (12, 11). */
  glyph: string;
}

// A glyph per bucket so colour is never the only signal (WCAG 1.4.1).
const BUCKET_STYLES: Record<PinBucket, BucketStyle> = {
  today: {
    label: "Today",
    fill: "hsl(var(--secondary))",
    ink: "hsl(var(--secondary-foreground))",
    glyph: '<circle cx="12" cy="11" r="4.5" fill="currentColor"/>',
  },
  week: {
    label: "Next 7 days",
    fill: "hsl(var(--warning))",
    ink: "hsl(var(--warning-foreground))",
    glyph: '<rect x="8" y="7" width="8" height="8" transform="rotate(45 12 11)" fill="currentColor"/>',
  },
  later: {
    label: "Later",
    fill: "hsl(var(--primary))",
    ink: "hsl(var(--primary-foreground))",
    glyph: '<circle cx="12" cy="11" r="4" fill="none" stroke="currentColor" stroke-width="2.25"/>',
  },
  earlier: {
    label: "Earlier",
    fill: "hsl(var(--muted-foreground))",
    ink: "hsl(var(--background))",
    glyph: '<rect x="7.5" y="10" width="9" height="2.25" rx="1" fill="currentColor"/>',
  },
};

const PIN_PATH =
  "M12 1.5C6.2 1.5 1.5 6.1 1.5 11.8c0 7.3 9 14.6 9.9 15.4a.9.9 0 0 0 1.2 0c.9-.8 9.9-8.1 9.9-15.4C22.5 6.1 17.8 1.5 12 1.5Z";

function pinSvg(style: BucketStyle, count: number): string {
  const badge =
    count > 1
      ? `<g><circle cx="21" cy="4" r="4.5" fill="hsl(var(--foreground))" stroke="hsl(var(--background))" stroke-width="1"/>` +
        `<text x="21" y="6" text-anchor="middle" font-size="6" font-weight="700" fill="hsl(var(--background))" font-family="system-ui, sans-serif">${count > 9 ? "9+" : count}</text></g>`
      : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="-1 -1 27 30" aria-hidden="true" focusable="false" style="color:${style.ink};overflow:visible">` +
    `<path d="${PIN_PATH}" fill="${style.fill}" stroke="hsl(var(--background))" stroke-width="1.25"/>` +
    style.glyph +
    badge +
    `</svg>`
  );
}

const iconCache = new Map<string, L.DivIcon>();

function pinIcon(bucket: PinBucket, count: number): L.DivIcon {
  const countKey = count > 9 ? 10 : count;
  const key = `${bucket}:${countKey}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    html: pinSvg(BUCKET_STYLES[bucket], countKey),
    className: "dmi-map-pin",
    iconSize: [30, 36],
    iconAnchor: [15, 35],
    popupAnchor: [0, -32],
    tooltipAnchor: [0, -30],
  });
  iconCache.set(key, icon);
  return icon;
}

// The single-count icons, built at module scope; counts are added on demand.
for (const bucket of BUCKET_ORDER) pinIcon(bucket, 1);

const YOU_ICON = L.divIcon({
  html:
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">' +
    '<circle cx="11" cy="11" r="10" fill="hsl(var(--primary) / 0.2)"/>' +
    '<circle cx="11" cy="11" r="6" fill="hsl(var(--primary))" stroke="hsl(var(--background))" stroke-width="2"/>' +
    "</svg>",
  className: "dmi-map-pin",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// ---------------------------------------------------------------------------
// Venues: events sharing coordinates become one pin
// ---------------------------------------------------------------------------

interface VenueGroup {
  key: string;
  latitude: number;
  longitude: number;
  events: MapEvent[];
  bucket: PinBucket;
}

function hasCoords(e: MapEvent): e is MapEvent & { latitude: number; longitude: number } {
  return (
    typeof e.latitude === "number" &&
    typeof e.longitude === "number" &&
    Number.isFinite(e.latitude) &&
    Number.isFinite(e.longitude)
  );
}

function groupByVenue(events: readonly MapEvent[], now: Date = new Date()): VenueGroup[] {
  const groups = new Map<string, VenueGroup>();
  for (const event of events) {
    if (!hasCoords(event)) continue;
    // Five decimals is about a metre: the same venue, not the same block.
    const key = `${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
    const bucket = pinBucket(event, now);
    const group = groups.get(key);
    if (group) {
      group.events.push(event);
      if (BUCKET_ORDER.indexOf(bucket) < BUCKET_ORDER.indexOf(group.bucket)) group.bucket = bucket;
    } else {
      groups.set(key, {
        key,
        latitude: event.latitude,
        longitude: event.longitude,
        events: [event],
        bucket,
      });
    }
  }
  for (const group of groups.values()) {
    group.events.sort((a, b) => new Date(startOf(a)).getTime() - new Date(startOf(b)).getTime());
  }
  return Array.from(groups.values());
}

function whenLabel(event: MapEvent): string {
  try {
    const source = startOf(event);
    const day = formatInCentralTime(source, "EEE, MMM d");
    return hasSpecificTime(event) ? `${day}, ${formatInCentralTime(source, "h:mm a")} CT` : day;
  } catch {
    return "Date to be announced";
  }
}

function shortDate(event: MapEvent): string {
  try {
    return formatInCentralTime(startOf(event), "MMM d");
  } catch {
    return "";
  }
}

function venueName(event: MapEvent): string | null {
  return event.venue?.trim() || event.location?.trim() || null;
}

function markerLabel(group: VenueGroup): string {
  const first = group.events[0];
  if (group.events.length === 1) return `${first.title}, ${shortDate(first)}`;
  return `${venueName(first) ?? "Venue"}: ${group.events.length} events, next ${shortDate(first)}`;
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------

export interface MapUserLocation {
  latitude: number;
  longitude: number;
}

const DES_MOINES: [number, number] = [41.5868, -93.625];

function FitToResults({
  groups,
  userLocation,
}: {
  groups: readonly VenueGroup[];
  userLocation?: MapUserLocation | null;
}) {
  const map = useMap();
  // Keyed on the point SET, not the array identity. The page's clock ticks
  // every minute and the near-me caller maps its rows on every render, so
  // `groups` is a new array constantly; refitting on each one snapped the map
  // back while someone was panning it.
  const points = useMemo(() => {
    const out: [number, number][] = groups.map((g) => [g.latitude, g.longitude]);
    if (userLocation) out.push([userLocation.latitude, userLocation.longitude]);
    return out;
  }, [groups, userLocation]);
  const fitKey = points.map(([lat, lng]) => `${lat},${lng}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the set of points changes
  }, [map, fitKey]);
  return null;
}

/**
 * One finger scrolls the page on touch; pinch still zooms and pans. MapContainer
 * reads `dragging` only when the map is created, and the pointer type is only
 * known after mount, so this toggles the handler on the live map.
 */
function TouchDragPolicy({ coarse }: { coarse: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (coarse) map.dragging.disable();
    else map.dragging.enable();
  }, [map, coarse]);
  return null;
}

/**
 * The primary colour as a concrete value. Leaflet writes path colours as SVG
 * attributes, where var() is not resolved everywhere, so read the token once
 * after mount (dark mode included) instead of passing "hsl(var(--primary))".
 */
function usePrimaryColor(): string {
  const [color, setColor] = useState("hsl(225 87% 21%)");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    if (raw) setColor(`hsl(${raw})`);
  }, []);
  return color;
}

/** True on a touch-first device. Read after mount so prerendered HTML matches. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return coarse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface EventsMapProps {
  /** Rows to plot. Rows without coordinates are counted, not plotted. */
  events: MapEvent[];
  /**
   * All matching rows, including those with no coordinates, when the caller
   * knows it (useEventsMapData's totalCount). Defaults to events.length.
   */
  totalCount?: number;
  /**
   * Matching rows that have coordinates, when it can exceed events.length
   * because of the query cap (useEventsMapData's mappedCount).
   */
  mappedCount?: number;
  /** Adds an origin marker and includes it in the fitted bounds. */
  userLocation?: MapUserLocation | null;
  /**
   * What the origin marker is called: "Downtown" when near me measures from a
   * picked place, "You" (the default) when it is the visitor's position.
   */
  originLabel?: string;
  /** Draws the search radius around userLocation, in miles. */
  radiusMiles?: number;
  /** A popup line such as "1.2 mi from Ankeny"; null or "" prints nothing. */
  distanceLabel?: (event: MapEvent) => string | null;
  /** Switches the page back to the list. Shown in the coverage line and empty state. */
  onShowList?: () => void;
  now?: Date;
}

export function EventsMap({
  events,
  totalCount,
  mappedCount,
  userLocation,
  originLabel = "You",
  radiusMiles,
  distanceLabel,
  onShowList,
  now,
}: EventsMapProps) {
  const clock = useMemo(() => now ?? new Date(), [now]);
  const groups = useMemo(() => groupByVenue(events, clock), [events, clock]);
  const plotted = useMemo(() => events.filter(hasCoords).length, [events]);
  const mapped = Math.max(mappedCount ?? plotted, plotted);
  const total = Math.max(totalCount ?? events.length, mapped);
  const unmapped = total - mapped;
  const coarse = useCoarsePointer();
  const radiusColor = usePrimaryColor();
  // The legend names only the colours on the map (events-pass2 WP5 item 11);
  // a key for pins nobody can find reads as missing data.
  const presentBuckets = useMemo(() => {
    const present = new Set(groups.map((g) => g.bucket));
    return BUCKET_ORDER.filter((bucket) => present.has(bucket));
  }, [groups]);

  const showListButton = onShowList ? (
    <Button type="button" variant="link" className="h-auto min-h-11 px-1 py-0" onClick={onShowList}>
      show as list
    </Button>
  ) : null;

  if (groups.length === 0) {
    return (
      <section
        aria-label="Map of matching events"
        className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border bg-muted/40 p-6 text-center"
      >
        <p className="text-base font-semibold text-foreground">
          {total > 0 ? "None of these events has a mapped location" : "No events to map"}
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {total > 0
            ? `${total} ${total === 1 ? "event matches" : "events match"}, but we don't have coordinates for ${total === 1 ? "it" : "them"} yet.`
            : "Nothing matches these filters. Try a wider date range or fewer filters."}
        </p>
        {onShowList && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onShowList}>
            Show as list
          </Button>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Map of matching events" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {mapped} of {total} on the map
          {unmapped > 0 && (
            <>
              {" - "}
              {unmapped} {unmapped === 1 ? "has" : "have"} no mapped location
              {showListButton && <> ({showListButton})</>}
            </>
          )}
          {mapped > plotted && (
            <span className="text-muted-foreground"> (showing the first {plotted})</span>
          )}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground" aria-label="Pin colours">
          {presentBuckets.map((bucket) => (
            <li key={bucket} className="inline-flex items-center gap-1.5">
              {/* Static markup built from the constants above; no row data. */}
              <span
                aria-hidden="true"
                className="inline-block h-5 w-4 [&>svg]:h-5 [&>svg]:w-4"
                dangerouslySetInnerHTML={{ __html: pinSvg(BUCKET_STYLES[bucket], 1) }}
              />
              {BUCKET_STYLES[bucket].label}
            </li>
          ))}
        </ul>
      </div>
      {coarse && (
        <p className="text-sm text-muted-foreground">Use two fingers to move the map.</p>
      )}

      <MapContainer
        center={DES_MOINES}
        zoom={12}
        scrollWheelZoom={false}
        className="h-[60vh] min-h-[320px] w-full rounded-xl"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToResults groups={groups} userLocation={userLocation} />
        <TouchDragPolicy coarse={coarse} />

        {userLocation && radiusMiles != null && radiusMiles > 0 && (
          <Circle
            center={[userLocation.latitude, userLocation.longitude]}
            radius={radiusMiles * 1609.34}
            pathOptions={{
              color: radiusColor,
              weight: 1.5,
              fillColor: radiusColor,
              fillOpacity: 0.05,
              interactive: false,
            }}
          />
        )}
        {userLocation && (
          <Marker
            position={[userLocation.latitude, userLocation.longitude]}
            icon={YOU_ICON}
            title={originLabel}
            alt={originLabel === "You" ? "Your location" : `Starting point: ${originLabel}`}
            keyboard={false}
          >
            <Tooltip direction="top" className="text-foreground">
              {originLabel}
            </Tooltip>
          </Marker>
        )}

        {groups.map((group) => {
          const label = markerLabel(group);
          return (
            <Marker
              key={group.key}
              position={[group.latitude, group.longitude]}
              icon={pinIcon(group.bucket, group.events.length)}
              title={label}
              alt={label}
              eventHandlers={{
                add: (e) => {
                  // divIcons have no img to carry `alt`; name the focusable
                  // element instead of Leaflet's default "Marker".
                  const el = (e.target as L.Marker).getElement();
                  el?.setAttribute("aria-label", label);
                },
              }}
            >
              <Tooltip direction="top" className="text-foreground">
                {label}
              </Tooltip>
              <Popup maxWidth={280}>
                <ul className="m-0 max-h-72 list-none space-y-3 overflow-y-auto p-0">
                  {group.events.map((event) => {
                    const venue = venueName(event);
                    const distance = distanceLabel?.(event) || null;
                    return (
                      <li key={event.id} className="text-sm text-foreground">
                        <Link
                          to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                          className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          {event.title}
                        </Link>
                        <div>{whenLabel(event)}</div>
                        {venue && <div>{venue}</div>}
                        {distance && <div>{distance}</div>}
                        <div className="text-muted-foreground">{eventPriceLabel(event.price)}</div>
                      </li>
                    );
                  })}
                </ul>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </section>
  );
}

export default EventsMap;
