/**
 * Rendering helpers for the ops digest (WEB-BE-032).
 *
 * Separated from agent-ops-digest/index.ts so they can be tested: that file
 * calls Deno.serve at import time, so importing it from a test starts a server.
 *
 * WHAT THESE EXIST TO PREVENT. The digest's metrics all ran through a helper
 * that returned `count ?? 0` and discarded the error, so a failed query printed
 * "Overdue tasks: 0", "Agent failures (24h): 0", "Open dependency CVEs: 0". A
 * digest that could read nothing and a system with nothing wrong produced the
 * same eleven lines. These helpers make "could not read" a value the renderer
 * has to handle rather than a zero it silently prints.
 */

/** A metric that may not have been readable. null is NOT zero. */
export type Counted = number | null;

/** Renders a metric, saying so when it could not be read. */
export function renderCount(value: Counted): string {
  return value === null ? "unavailable (read failed)" : String(value);
}

/** A section whose query failed says so instead of reporting its empty state. */
export function unavailable(label: string, error: { message?: string } | null): string {
  return `${label} - UNAVAILABLE (${error?.message ?? "read failed"})`;
}

/**
 * Joins the digest lines, prefixing a warning when any section is unreadable.
 *
 * Said at the top, not buried halfway down: a reader skimming eleven
 * healthy-looking numbers stops reading before reaching the line that admits
 * the digest is partly blind.
 */
export function composeDigest(lines: string[]): { body: string; degraded: number } {
  const degraded = lines.filter((l) => /unavailable/i.test(l)).length;
  const out =
    degraded > 0
      ? [
          `WARNING: ${degraded} of ${lines.length} sections could not be read - this digest is incomplete.`,
          "",
          ...lines,
        ]
      : lines;
  return { body: out.join("\n"), degraded };
}

/**
 * A metric plus where it came from, so a digest can be audited from its own
 * output (AOS-MANAGE-001 AC3: every number sourced from a real table).
 */
export interface Metric {
  label: string;
  value: Counted;
  source: string;
  /** Set when the TABLE is missing - a permanent absence, not a failed read. */
  absent?: string;
  adminPath?: string;
}

/**
 * Renders one metric, and never renders an unread value as a number.
 *
 * Three states have to stay distinguishable to a reader: a real count, a read
 * that failed today, and a table that does not exist. Collapsing the last two
 * into "0" is the WEB-BE-032 defect in a new place.
 */
export function renderMetric(m: Metric, site = ""): string {
  if (m.absent) return unavailable(m.label, { message: m.absent + " - not sourced, not zero" });
  if (m.value === null) return unavailable(m.label, { message: "read failed on " + m.source });
  const link = m.adminPath ? "  " + site + m.adminPath : "";
  return m.label + ": " + renderCount(m.value) + "   [" + m.source + "]" + link;
}

/**
 * A period-over-period delta is only meaningful when BOTH windows read.
 * Printing "+0" from one null window is the same lie as a fabricated count.
 */
export function renderDelta(label: string, now: Counted, prev: Counted): string {
  if (now === null || prev === null) {
    return unavailable(label, { message: "one of the two windows could not be read" });
  }
  const d = now - prev;
  return label + ": " + (d >= 0 ? "+" : "") + d;
}
