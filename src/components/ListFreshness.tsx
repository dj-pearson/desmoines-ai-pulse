import { CheckCircle } from "lucide-react";

/**
 * SEO-009: a visible, honest freshness date for a LIST page.
 *
 * /events/today and /events/this-weekend are the recurring-traffic pages - the
 * ones somebody checks again next Friday - and neither showed when its list was
 * last rebuilt. Their meta descriptions said "Updated daily"; the page itself
 * said nothing, so the claim was unverifiable by the reader it was aimed at.
 *
 * WHY NOT LastUpdatedBadge, WHICH ALREADY EXISTS. It renders RELATIVE time
 * ("2 hours ago"), computed at render. These pages are prerendered, so that
 * string is computed once at build time and then frozen into static HTML: a
 * page built on Tuesday still says "2 hours ago" on Friday, to every crawler
 * and to every visitor served the prerendered document before React takes over.
 * A freshness signal that becomes false with age is worse than none, because it
 * is the one thing on the page that is meant to be checkable. The badge is fine
 * where it is used - on detail pages, against a real row's updated_at, where
 * being a few hours out does not turn it into a lie.
 *
 * So this renders an ABSOLUTE date. It cannot drift.
 *
 * WHERE THE DATE COMES FROM. The newest updated_at among the rows actually
 * listed. That is a fact about the data rather than a fact about the build, so
 * it stays true no matter when the HTML was captured, and it is the real answer
 * to "how current is this list".
 *
 * It renders NOTHING when no row carries a usable date. An empty list and a
 * list of unknown age must not both render as fresh - claiming currency we
 * cannot demonstrate is the failure this component exists to avoid.
 */

interface DatedRow {
  updated_at?: string | null;
  created_at?: string | null;
}

/**
 * Newest usable timestamp across the rows, or null.
 *
 * Exported for tests. Ignores unparseable values and future dates: a row
 * timestamped next week would make the list claim to be newer than today,
 * which reads as broken rather than fresh.
 */
export function newestTimestamp(rows: DatedRow[] | null | undefined, now = Date.now()): string | null {
  if (!rows || rows.length === 0) return null;
  let best: number | null = null;
  for (const r of rows) {
    for (const raw of [r?.updated_at, r?.created_at]) {
      if (!raw) continue;
      const t = new Date(raw).getTime();
      if (!Number.isFinite(t) || t > now) continue;
      if (best === null || t > best) best = t;
    }
  }
  return best === null ? null : new Date(best).toISOString();
}

export function ListFreshness({
  rows,
  label = "Event list",
  className = "",
}: {
  rows: DatedRow[] | null | undefined;
  label?: string;
  className?: string;
}) {
  const iso = newestTimestamp(rows);
  if (!iso) return null;

  const d = new Date(iso);
  const formatted = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <p className={`flex items-center gap-1.5 text-sm text-muted-foreground ${className}`}>
      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
      <span>
        {label} last updated{" "}
        {/* A machine-readable date beside the human one. <time> is the only
            element that carries an unambiguous timestamp, and the visible text
            is a US-formatted string that a parser would have to guess at. */}
        <time dateTime={iso.slice(0, 10)}>{formatted}</time>
      </span>
    </p>
  );
}

export default ListFreshness;
