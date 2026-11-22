import { format } from "date-fns";

/**
 * Builds the row ContentEditDialog sends to Supabase (WEB-BE-067).
 *
 * The dialog is opened with a row from an admin list query, which carries
 * columns the form never shows: sponsorship, hours, closure state, merge
 * state, popularity. Sending the whole form back rewrote those columns with
 * whatever they held when the tab loaded, so fixing a phone number could undo
 * a sponsorship that activated in the meantime. An edit now sends only the
 * configured fields whose value changed, the same rule the owner form uses
 * (ClaimedListingEditForm), and never the columns below.
 */

/** Columns this dialog must never write. is_sponsored is paid placement. */
export const PROTECTED_COLUMNS = [
  "is_sponsored",
  "sponsored_until",
  "hours_json",
  "business_status",
  "hours_checked_at",
  "popularity_score",
  "is_merged",
  "merged_into",
  "enhanced",
  "slug",
] as const;

/** Never sent on insert or update: the database owns them. */
const READONLY_KEYS = ["id", "created_at", "updated_at", "isNew"];

export interface EditFieldConfig {
  key: string;
  type: string;
}

export type ContentRow = Record<string, unknown>;

export interface BuildContentEditPayloadInput {
  /** The configured form fields for this content type. */
  fields: readonly EditFieldConfig[];
  /** The row the dialog was opened with. */
  original: ContentRow;
  /** The current form state. */
  current: ContentRow;
  /** True when creating a row rather than editing one. */
  isNew: boolean;
  /**
   * Keys the dialog writes without showing a field for them, such as the
   * coordinates the event venue match fills in. Sent only when changed.
   */
  extraKeys?: readonly string[];
  /**
   * Protected columns this content type edits on purpose (hotels have a
   * Slug field). Anything not listed here stays protected.
   */
  allowedProtected?: readonly string[];
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
}

/**
 * A select option that writes null. Radix Select cannot hold an empty-string
 * value, so a field that must be clearable (reservation_provider, whose CHECK
 * rejects '') offers this and the payload writes null (WEB-BE-070).
 */
export const SELECT_NONE = "__none__";

/** The value as it is written to the column. */
function serialize(type: string, value: unknown): unknown {
  if (!value) return value;
  if (type === "select" && value === SELECT_NONE) return null;
  if (type === "date" || type === "datetime") {
    const date = toDate(value);
    if (!date || Number.isNaN(date.getTime())) return value;
    return type === "date" ? format(date, "yyyy-MM-dd") : date.toISOString();
  }
  return value;
}

/**
 * The value as compared. Empty string, null and undefined are the same
 * thing to the form (an untouched empty text input shows "" for null).
 */
function comparable(type: string, value: unknown): string {
  const written = serialize(type, value);
  if (written === null || written === undefined || written === "") return "";
  if (typeof written === "object") return JSON.stringify(written);
  return String(written);
}

export function buildContentEditPayload({
  fields,
  original,
  current,
  isNew,
  extraKeys = [],
  allowedProtected = [],
}: BuildContentEditPayloadInput): ContentRow {
  const isProtected = (key: string) =>
    (PROTECTED_COLUMNS as readonly string[]).includes(key) && !allowedProtected.includes(key);
  const typeOf = new Map<string, string>(fields.map((f) => [f.key, f.type]));

  if (isNew) {
    // A new row has no stale state to clobber, and its defaults (template
    // values, city, state) may sit outside the configured fields, so it
    // keeps everything the form holds apart from readonly and protected keys.
    const row: ContentRow = {};
    for (const [key, value] of Object.entries(current)) {
      if (READONLY_KEYS.includes(key) || isProtected(key)) continue;
      row[key] = serialize(typeOf.get(key) ?? "", value);
    }
    return row;
  }

  const patch: ContentRow = {};
  const keys = [...fields.map((f) => f.key), ...extraKeys];
  for (const key of keys) {
    if (READONLY_KEYS.includes(key) || isProtected(key) || key in patch) continue;
    const type = typeOf.get(key) ?? "";
    if (comparable(type, current[key]) === comparable(type, original[key])) continue;
    patch[key] = serialize(type, current[key]);
  }
  return patch;
}
