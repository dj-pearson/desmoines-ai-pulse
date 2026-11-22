/**
 * WEB-BE-072: the pure half of scripts/recompute-menu-dietary-tags.ts.
 *
 * Stored dietary_tags were the union of a model's reported tags and the old
 * text rules ("(GFO)" -> gluten-free, "veggie" -> vegetarian). Neither half can
 * be told apart in a stored row, so the recompute keeps only what the stored
 * name and description mark today, using the same normalizeDietaryTags the
 * scraper runs. That includes JSON-LD menus: their structured suitableForDiet
 * tags were unioned with the old text rules too, so they cannot be kept
 * selectively. A missing badge is the smaller harm; the next scrape of a
 * JSON-LD menu restores its structured tags.
 *
 * This is why the recompute is a script and not a SQL migration: the rule
 * lives in TypeScript, and a second copy of it in SQL is two rules that will
 * drift.
 */
import { normalizeDietaryTags } from "../../supabase/functions/_shared/menu/menuNormalize.ts";

export interface StoredMenuItem {
  id: string;
  item_name: string;
  item_description: string | null;
  dietary_tags: string[] | null;
  extraction_method: string | null;
}

export interface TagCounts {
  /** Rows with at least one tag. */
  tagged_rows: number;
  /** Row count per tag. */
  by_tag: Record<string, number>;
}

export interface RecomputePlan {
  rows: number;
  before: TagCounts;
  after: TagCounts;
  changed: number;
  /** Changed rows per restaurant_menus.extraction_method ("unknown" when null). */
  changed_by_method: Record<string, number>;
  /** New tag set -> ids, so --apply writes one update per distinct set. */
  updates: Map<string, string[]>;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function count(tagSets: ReadonlyArray<readonly string[]>): TagCounts {
  const by_tag: Record<string, number> = {};
  let tagged_rows = 0;
  for (const tags of tagSets) {
    if (tags.length > 0) tagged_rows += 1;
    for (const t of tags) by_tag[t] = (by_tag[t] ?? 0) + 1;
  }
  return { tagged_rows, by_tag };
}

export function planRecompute(items: readonly StoredMenuItem[]): RecomputePlan {
  const before: string[][] = [];
  const after: string[][] = [];
  const changed_by_method: Record<string, number> = {};
  const updates = new Map<string, string[]>();
  let changed = 0;

  for (const item of items) {
    const old = [...(item.dietary_tags ?? [])].sort();
    const next = normalizeDietaryTags([], item.item_name, item.item_description);
    before.push(old);
    after.push(next);
    if (sameTags(old, next)) continue;
    changed += 1;
    const method = item.extraction_method ?? "unknown";
    changed_by_method[method] = (changed_by_method[method] ?? 0) + 1;
    const key = JSON.stringify(next);
    const ids = updates.get(key) ?? [];
    ids.push(item.id);
    updates.set(key, ids);
  }

  return {
    rows: items.length,
    before: count(before),
    after: count(after),
    changed,
    changed_by_method,
    updates,
  };
}
