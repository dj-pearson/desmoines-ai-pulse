/**
 * WEB-BE-077: where restaurant copy came from, and whether AI copy is still
 * fresh enough to show.
 *
 * description_source and geo_generated_at are kept by a trigger (migration
 * 20261121000160). Rows written before it have NULL for both: the source and
 * the date were never recorded, so no label is shown rather than a guess.
 */

export type DescriptionSource = "google" | "restaurant" | "editor" | "ai";

/** The label beside About, or null when the source is unknown. */
export function descriptionSourceLabel(source: string | null | undefined): string | null {
  switch (source) {
    case "google":
      return "From Google";
    case "restaurant":
      return "From the restaurant";
    case "editor":
      return "From our editors";
    case "ai":
      return "AI-assisted";
    default:
      return null;
  }
}

/** AI copy older than this is hidden until it is regenerated from current facts. */
export const AI_COPY_MAX_AGE_DAYS = 365;

/**
 * Whether AI copy generated at `generatedAt` may be shown. Undated copy
 * (written before the date was recorded) is shown with "date not recorded";
 * dated copy older than AI_COPY_MAX_AGE_DAYS is not.
 */
export function aiCopyIsFresh(generatedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!generatedAt) return true;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= AI_COPY_MAX_AGE_DAYS * 86_400_000;
}

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Chicago",
});

/** "Generated Nov 21, 2026", or "Generation date not recorded". */
export function aiGeneratedLine(generatedAt: string | null | undefined): string {
  const t = generatedAt ? Date.parse(generatedAt) : NaN;
  return Number.isNaN(t) ? "Generation date not recorded" : `Generated ${DATE.format(new Date(t))}`;
}
