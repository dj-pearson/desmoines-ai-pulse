import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// content_merges' filled_columns/moved_claims and suggest_merge_survivor come
// from migration 20261121000080 and are not in the generated types yet, so the
// reads go through `as never` casts like the rest of the merge panel.

export const RECENT_MERGES_KEY = ["recent-merges"] as const;

/** What unmerge_content() does, in the words every merge toast and the list use. */
export const UNDO_SCOPE =
  "Undo within 30 days brings the hidden listing back, clears details that were copied onto the kept listing (unless someone has edited them since) and returns owner claims. Reviews, saves and other linked records stay on the kept listing.";

export interface RecentMerge {
  id: string;
  content_type: "event" | "restaurant";
  survivor_id: string;
  loser_id: string;
  decided_by: string;
  created_at: string;
  reversed: boolean;
  repointed: Record<string, number> | null;
  filled_columns: Record<string, unknown> | null;
  moved_claims: string[] | null;
  survivorName: string;
  loserName: string;
}

interface MergeRow {
  id: string;
  content_type: "event" | "restaurant";
  survivor_id: string;
  loser_id: string;
  decided_by: string;
  created_at: string;
  reversed: boolean;
  repointed: Record<string, number> | null;
  filled_columns: Record<string, unknown> | null;
  moved_claims: string[] | null;
}

const UNDO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Error text from either an Error or a PostgREST error object. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string") return e.message;
  return "Unknown error";
}

async function namesFor(table: "events" | "restaurants", ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const out: Record<string, string> = {};
  if (table === "events") {
    const { data, error } = await supabase.from("events").select("id, title").in("id", ids);
    if (error) throw error;
    for (const r of data ?? []) out[r.id] = r.title ?? "(untitled)";
  } else {
    const { data, error } = await supabase.from("restaurants").select("id, name").in("id", ids);
    if (error) throw error;
    for (const r of data ?? []) out[r.id] = r.name ?? "(unnamed)";
  }
  return out;
}

/** Merges from the last 30 days, newest first: the ones Undo can still reverse. */
export function useRecentMerges() {
  return useQuery({
    queryKey: RECENT_MERGES_KEY,
    queryFn: async (): Promise<RecentMerge[]> => {
      const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("content_merges" as never)
        .select("id, content_type, survivor_id, loser_id, decided_by, created_at, reversed, repointed, filled_columns, moved_claims")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as MergeRow[];

      const ids = (type: MergeRow["content_type"]) =>
        Array.from(new Set(rows.filter((r) => r.content_type === type).flatMap((r) => [r.survivor_id, r.loser_id])));
      const [events, restaurants] = await Promise.all([
        namesFor("events", ids("event")),
        namesFor("restaurants", ids("restaurant")),
      ]);
      const names = { ...events, ...restaurants };
      return rows.map((r) => ({
        ...r,
        survivorName: names[r.survivor_id] ?? r.survivor_id,
        loserName: names[r.loser_id] ?? r.loser_id,
      }));
    },
    refetchInterval: 60_000,
  });
}

/** The server's survivor rule (place id, then verified claim, then score). */
export async function suggestSurvivor(a: string, b: string): Promise<string> {
  const { data, error } = await supabase.rpc("suggest_merge_survivor" as never, {
    p_content_type: "restaurant",
    p_a: a,
    p_b: b,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}

export async function mergeContent(args: {
  contentType: "event" | "restaurant";
  survivor: string;
  loser: string;
  confidence: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc("merge_duplicate_content", {
    p_content_type: args.contentType,
    p_survivor: args.survivor,
    p_loser: args.loser,
    ...(args.confidence == null ? {} : { p_confidence: args.confidence }),
    p_decided_by: "admin",
  });
  if (error) throw error;
}

export async function unmergeContent(mergeId: string): Promise<void> {
  const { error } = await supabase.rpc("unmerge_content", { p_merge_id: mergeId });
  if (error) throw error;
}
