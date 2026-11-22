import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface ChangeRow {
  id: number;
  changed_at: string;
  actor: string;
  columns: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
}

interface RestaurantHit {
  id: string;
  name: string;
  location: string | null;
}

async function searchRestaurants(term: string): Promise<RestaurantHit[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, location")
    .ilike("name", `%${term.replace(/[%_,()]/g, " ")}%`)
    .order("name")
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as RestaurantHit[];
}

/** The last 20 recorded changes to one restaurant (WEB-BE-075). Throws on a failed read. */
export async function fetchRestaurantChanges(restaurantId: string): Promise<ChangeRow[]> {
  const { data, error } = await supabase
    .from("restaurant_changes" as never)
    .select("id, changed_at, actor, columns, old_values, new_values")
    .eq("restaurant_id", restaurantId)
    .order("changed_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChangeRow[];
}

function show(v: unknown): string {
  if (v === null || v === undefined) return "empty";
  if (typeof v === "object" && (v as { changed?: boolean }).changed) return "(changed)";
  return typeof v === "string" ? v : JSON.stringify(v);
}

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

/**
 * The last 20 recorded changes to one restaurant, newest first. Shared by the
 * search card below and the admin restaurant drawer (WEB-FEAT-103).
 */
export function RestaurantChangeList({ restaurantId }: { restaurantId: string }) {
  const changes = useQuery({
    queryKey: ["restaurant-changes", restaurantId],
    queryFn: () => fetchRestaurantChanges(restaurantId),
  });
  if (changes.isLoading) return <Skeleton className="h-24 w-full" />;
  if (changes.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not read the history: {changes.error instanceof Error ? changes.error.message : String(changes.error)}
      </p>
    );
  }
  const rows = changes.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes recorded since history began (migration 20261121000110).</p>;
  }
  return (
    <ol className="space-y-3">
      {rows.map((c) => (
        <li key={c.id} className="rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap gap-x-3">
            <span className="font-medium">{WHEN.format(new Date(c.changed_at))}</span>
            <span className="text-muted-foreground">by {c.actor}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {c.columns.map((col) => (
              <li key={col} className="break-words">
                <span className="font-mono text-xs">{col}</span>: {show(c.old_values[col])} -&gt; {show(c.new_values[col])}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * WEB-BE-075. Which job or person last changed a restaurant row. Pick a
 * restaurant by name; the last 20 changes show with the actor, the columns,
 * and old -> new values (large fields show as changed).
 */
export function RestaurantChangeHistory() {
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<RestaurantHit | null>(null);

  const hits = useQuery({
    queryKey: ["restaurant-history-search", term],
    queryFn: () => searchRestaurants(term),
    enabled: term.trim().length >= 2 && !picked,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Restaurant change history</CardTitle>
        <CardDescription>The last 20 changes to a listing, with who or what made each one.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          aria-label="Find a restaurant"
          placeholder="Find a restaurant by name"
          value={picked ? picked.name : term}
          onChange={(e) => {
            setPicked(null);
            setTerm(e.target.value);
          }}
        />
        {!picked && hits.error && (
          <p role="alert" className="text-sm text-destructive">Search failed: {String(hits.error)}</p>
        )}
        {!picked && (hits.data ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border">
            {(hits.data ?? []).map((h) => (
              <li key={h.id}>
                <button type="button" className="min-h-11 w-full px-3 py-2 text-left text-sm" onClick={() => setPicked(h)}>
                  {h.name}
                  {h.location ? <span className="text-muted-foreground"> - {h.location}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && <RestaurantChangeList restaurantId={picked.id} />}
      </CardContent>
    </Card>
  );
}
