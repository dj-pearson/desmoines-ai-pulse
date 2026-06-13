/**
 * TripMapPreview (WEB-FEAT-011) — a Leaflet map of an itinerary's stops.
 *
 * Itinerary items carry only a content type + id (the get_trip_itinerary RPC's
 * content_details doesn't include coordinates), so we batch-fetch lat/lng for the
 * referenced events/restaurants/attractions in one query per type (the trending
 * N+1 batch pattern) and drop numbered markers in itinerary order.
 *
 * This module imports Leaflet, so it is lazy-loaded behind RevealOnVisible by the
 * caller — the heavy vendor chunk only loads when the map scrolls into view.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIME } from "@/lib/queryConfig";
import type { TripPlanItem } from "@/hooks/useTripPlanner";

interface TripMapPreviewProps {
  items: TripPlanItem[];
  className?: string;
}

type ContentType = "event" | "restaurant" | "attraction";

const TYPE_TABLE: Record<ContentType, string> = {
  event: "events",
  restaurant: "restaurants",
  attraction: "attractions",
};

interface MappedStop {
  key: string;
  label: string;
  latitude: number;
  longitude: number;
  index: number;
}

/** Numbered teardrop marker so stops read in itinerary order. */
function numberedIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "trip-map-marker",
    html: `<div style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff"><span style="transform:rotate(45deg);font-size:12px;font-weight:700">${n}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

/** Imperatively fits the map to all stops once they're known. */
function FitBounds({ stops }: { stops: MappedStop[] }) {
  const map = useMap();
  useMemo(() => {
    if (stops.length === 0) return;
    if (stops.length === 1) {
      map.setView([stops[0].latitude, stops[0].longitude], 14);
      return;
    }
    const bounds = L.latLngBounds(stops.map((s) => [s.latitude, s.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
  }, [stops, map]);
  return null;
}

export function TripMapPreview({ items, className = "h-64 w-full rounded-lg" }: TripMapPreviewProps) {
  // Stable list of (type,id) references, in itinerary order.
  const refs = useMemo(() => {
    return items
      .filter((i) => i.content_details?.id && i.content_details?.type)
      .map((i) => ({
        type: i.content_details!.type as ContentType,
        id: i.content_details!.id,
        title: i.title,
      }));
  }, [items]);

  const refKey = refs.map((r) => `${r.type}:${r.id}`).join(",");

  const { data: coords } = useQuery({
    queryKey: ["trip-map-coords", refKey],
    enabled: refs.length > 0,
    staleTime: STALE_TIME.CONTENT,
    queryFn: async (): Promise<Record<string, { latitude: number; longitude: number }>> => {
      const byType = new Map<ContentType, string[]>();
      for (const r of refs) {
        if (!byType.has(r.type)) byType.set(r.type, []);
        byType.get(r.type)!.push(r.id);
      }
      const result: Record<string, { latitude: number; longitude: number }> = {};
      await Promise.all(
        Array.from(byType.entries()).map(async ([type, ids]) => {
          // @ts-ignore -- Supabase SDK deep type instantiation under strict mode
          const q = supabase.from(TYPE_TABLE[type]);
          // @ts-ignore -- overload resolution under strict mode
          const { data, error } = await q.select("id, latitude, longitude").in("id", ids);
          if (error || !data) return;
          for (const row of data as Array<{ id: string; latitude: number | null; longitude: number | null }>) {
            if (row.latitude != null && row.longitude != null) {
              result[`${type}:${row.id}`] = { latitude: row.latitude, longitude: row.longitude };
            }
          }
        }),
      );
      return result;
    },
  });

  const stops = useMemo<MappedStop[]>(() => {
    if (!coords) return [];
    const seen = new Set<string>();
    const out: MappedStop[] = [];
    refs.forEach((r) => {
      const key = `${r.type}:${r.id}`;
      const c = coords[key];
      if (c && !seen.has(key)) {
        seen.add(key);
        out.push({ key, label: r.title, latitude: c.latitude, longitude: c.longitude, index: out.length + 1 });
      }
    });
    return out;
  }, [coords, refs]);

  if (refs.length === 0 || (coords && stops.length === 0)) {
    return null;
  }

  // Center on Des Moines until the data-driven FitBounds kicks in.
  const center: [number, number] = stops.length
    ? [stops[0].latitude, stops[0].longitude]
    : [41.5868, -93.625];

  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom={false} className={className} style={{ minHeight: 240 }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {stops.map((s) => (
        <Marker key={s.key} position={[s.latitude, s.longitude]} icon={numberedIcon(s.index)}>
          <Popup>
            <span className="font-medium">
              {s.index}. {s.label}
            </span>
          </Popup>
        </Marker>
      ))}
      <FitBounds stops={stops} />
    </MapContainer>
  );
}

export default TripMapPreview;
