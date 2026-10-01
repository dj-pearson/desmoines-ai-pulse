/**
 * Which event ids the sections above a Home rail already show (home pass-2
 * WP3 item 6), read from the query cache. No request of its own.
 *
 * One event used to appear up to four times on `/`: Tonight, the For You
 * rail, the dashboard's events group and the snapshot's "Next up". The order
 * of the page is the order of a plan (tonight, then the weekend, then later),
 * so each rail drops what a rail above it already has:
 *   - ForYouRail drops tonight's events;
 *   - the dashboard drops tonight's events and the For You rows.
 *
 * TONIGHT. The Tonight rail's rows live under TONIGHT_EVENTS_KEY. The query is
 * bounded loosely and keeps the previous window's rows while the next loads,
 * so the rows are re-filtered here with the rail's own rule
 * (selectTonightEvents, evening mode) against the current minute. Weather only
 * changes the rail's order, not its membership, so the neutral snapshot is
 * used. Every event that counts as tonight is excluded, not only the five
 * cards on screen: the rail's "see all" is where the rest of tonight lives.
 *
 * FOR YOU. The rail's rows live under FOR_YOU_RAIL_KEY.
 *
 * The cache is watched with useSyncExternalStore, so a rail that renders
 * before the Tonight query lands drops the overlap when it does. The snapshot
 * is a joined string, so an unrelated cache update does not re-render.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { TONIGHT_EVENTS_KEY } from "@/hooks/useTonightPairings";
import { WEATHER_UNAVAILABLE } from "@/hooks/useWeather";
import { useNow } from "@/hooks/useNow";
import { selectTonightEvents, type TonightEvent } from "@/lib/tonightPairings";

/** Every For You rail cache entry starts with this. */
export const FOR_YOU_RAIL_KEY = ["for-you-rail"] as const;

const ONE_MINUTE = 60 * 1000;
const EMPTY: ReadonlySet<string> = new Set();

function tonightIdsKey(client: QueryClient, now: Date): string {
  const rows: TonightEvent[] = [];
  for (const [, data] of client.getQueriesData<TonightEvent[]>({ queryKey: TONIGHT_EVENTS_KEY })) {
    if (Array.isArray(data)) rows.push(...data);
  }
  if (rows.length === 0) return "";
  return selectTonightEvents(rows, now, WEATHER_UNAVAILABLE, { mode: "evening" })
    .map((event) => event.id)
    .sort()
    .join(",");
}

function forYouIdsKey(client: QueryClient): string {
  const ids = new Set<string>();
  for (const [, data] of client.getQueriesData<{ rows?: Array<{ id?: unknown }> }>({
    queryKey: FOR_YOU_RAIL_KEY,
  })) {
    for (const row of data?.rows ?? []) {
      if (typeof row?.id === "string") ids.add(row.id);
    }
  }
  return [...ids].sort().join(",");
}

const toSet = (key: string): ReadonlySet<string> => (key ? new Set(key.split(",")) : EMPTY);

export interface HomeShownIds {
  /** Events the Tonight rail counts as tonight. */
  tonight: ReadonlySet<string>;
  /** Events the For You rail fetched. */
  forYou: ReadonlySet<string>;
}

export function useHomeShownIds(): HomeShownIds {
  const client = useQueryClient();
  const now = useNow(ONE_MINUTE);
  const nowMs = now.getTime();
  const cache = client.getQueryCache();

  const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
  const tonightKey = useSyncExternalStore(
    subscribe,
    () => tonightIdsKey(client, new Date(nowMs)),
    () => "",
  );
  const forYouKey = useSyncExternalStore(subscribe, () => forYouIdsKey(client), () => "");

  const tonight = useMemo(() => toSet(tonightKey), [tonightKey]);
  const forYou = useMemo(() => toSet(forYouKey), [forYouKey]);
  return { tonight, forYou };
}
