/**
 * Duplicate lookup for firecrawl-scraper's non-event categories (WEB-BE-046 AC2).
 *
 * Events already read their neighbours once per run and judge every item with
 * _shared/eventDedup.ts. Restaurants, playgrounds, attractions and competitor
 * content still asked PostgREST once per item (`.eq('name', ...)`), and
 * competitor content also looked its competitor up once per item although the
 * URL - and so the answer - is the same for the whole run. This module holds
 * the part of the replacement that can be tested without a database: what the
 * row's key is, how the keys are split into batched `.in()` reads, and an index
 * that a row inserted earlier in the same run is added to, so a second copy of
 * it later in the run is still caught (the per-item read caught it because the
 * first copy was already in the table).
 *
 * No imports, so the test runs offline.
 */

/** Categories whose duplicate key is the row's `name`, with the name a row gets when the source gave none. */
export const NAME_KEYED_DEFAULTS = {
  restaurants: 'Unnamed Restaurant',
  playgrounds: 'Playground',
  attractions: 'Attraction',
} as const;

export type NameKeyedCategory = keyof typeof NAME_KEYED_DEFAULTS;

export function isNameKeyed(category: string): category is NameKeyedCategory {
  return Object.prototype.hasOwnProperty.call(NAME_KEYED_DEFAULTS, category);
}

/**
 * The name stored for a scraped item. The insert and the duplicate read both
 * call this, so the key the read looks for is the value the insert writes; two
 * copies of the truncate-and-default rule would drift and turn every re-scrape
 * of an over-long name into a new row.
 */
export function rowName(category: NameKeyedCategory, item: { name?: unknown }): string {
  const raw = typeof item.name === 'string' ? item.name.substring(0, 200) : '';
  return raw || NAME_KEYED_DEFAULTS[category];
}

/** The title stored for a competitor_content row, by the same rule. */
export function competitorTitle(item: { title?: unknown }): string {
  const raw = typeof item.title === 'string' ? item.title.substring(0, 200) : '';
  return raw || 'Untitled Content';
}

/** Keys per `.in()` read. 50 names of up to 200 characters keeps the URL well under PostgREST's limits. */
export const KEYS_PER_READ = 50;

/**
 * supabase-js wraps an `.in()` value in double quotes when it holds a comma or
 * a parenthesis, and does not escape a double quote or backslash inside it. A
 * name carrying either would make the whole batched read fail, and a failed
 * read skips every item in the run. Those few names are looked up one at a
 * time with `.eq()`, as before.
 */
export function needsSingleRead(key: string): boolean {
  return /["\\]/.test(key);
}

/** Distinct keys, split into batched `.in()` groups and the ones that need their own read. */
export function planReads(keys: string[]): { batches: string[][]; singles: string[] } {
  const distinct = [...new Set(keys)];
  const batchable = distinct.filter((k) => !needsSingleRead(k));
  const singles = distinct.filter(needsSingleRead);
  const batches: string[][] = [];
  for (let i = 0; i < batchable.length; i += KEYS_PER_READ) {
    batches.push(batchable.slice(i, i + KEYS_PER_READ));
  }
  return { batches, singles };
}

/**
 * Existing rows by exact key. Exact on purpose: the per-item read was
 * `.eq()`, which is case- and whitespace-sensitive, and this must not merge
 * anything that read kept apart.
 */
export class ExistingRowIndex<Row extends Record<string, unknown>> {
  private readonly byKey = new Map<string, Row>();

  constructor(private readonly keyField: string, rows: Row[] = []) {
    for (const row of rows) this.add(row);
  }

  /** First row wins, matching `existingItems[0]` from the per-item read. */
  add(row: Row): void {
    const key = row[this.keyField];
    if (typeof key === 'string' && !this.byKey.has(key)) this.byKey.set(key, row);
  }

  find(key: string): Row | undefined {
    return this.byKey.get(key);
  }

  get size(): number {
    return this.byKey.size;
  }
}
