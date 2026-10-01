/**
 * The /advertise builder's unsent choices, kept across a sign-in (business
 * plan WP1 item 8).
 *
 * The builder is usable signed out; checkout is not. Before this, "Continue to
 * login" went to /auth?redirect=/advertise and the buyer came back to an empty
 * form. The draft is saved on every change and read back on load.
 *
 * STORAGE IS UNTRUSTED INPUT. Anything on this origin can write the key, and
 * an older build may have written a different shape, so every read is
 * validated field by field and a malformed value is dropped whole rather than
 * half-applied. The key carries a version; a shape change gets a new key
 * (CLAUDE.md, "On-disk / client-stored state").
 *
 * No price is stored. The total is asked of the server each time.
 */
import { safeStorage, storage } from "@/lib/safeStorage";
import { isDateOnly } from "@/lib/dateOnly";
import type { PlacementType } from "@/lib/placementSpecs";

export const ADVERTISE_DRAFT_KEY = "dmi_advertise_draft_v1";

const PLACEMENT_TYPES: readonly PlacementType[] = [
  "top_banner",
  "featured_spot",
  "below_fold",
  "sponsored_listing",
];

const LISTING_TYPES = ["event", "restaurant"] as const;
type DraftListingType = (typeof LISTING_TYPES)[number];

/** A listing is stored by reference; its name is re-read from the database. */
export interface AdvertiseDraftListing {
  type: DraftListingType;
  id: string;
}

export interface AdvertiseDraft {
  name: string;
  /** yyyy-MM-dd, or null when not chosen. */
  startDate: string | null;
  endDate: string | null;
  placements: PlacementType[];
  listing: AdvertiseDraftListing | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 200;

export function isPlacementType(value: unknown): value is PlacementType {
  return typeof value === "string" && (PLACEMENT_TYPES as readonly string[]).includes(value);
}

function dateOrNull(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && isDateOnly(value)) return value;
  return undefined;
}

function listingOrNull(value: unknown): AdvertiseDraftListing | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const { type, id } = value as { type?: unknown; id?: unknown };
  if (typeof type !== "string" || !(LISTING_TYPES as readonly string[]).includes(type)) return undefined;
  if (typeof id !== "string" || !UUID_RE.test(id)) return undefined;
  return { type: type as DraftListingType, id };
}

/**
 * The draft in `raw`, or null when any field is the wrong shape. Pure, so the
 * rules are testable without storage.
 */
export function parseAdvertiseDraft(raw: unknown): AdvertiseDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  const name = value.name ?? "";
  if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) return null;

  const startDate = dateOrNull(value.startDate);
  const endDate = dateOrNull(value.endDate);
  if (startDate === undefined || endDate === undefined) return null;

  const placementsRaw = value.placements ?? [];
  if (!Array.isArray(placementsRaw) || !placementsRaw.every(isPlacementType)) return null;
  const placements = [...new Set(placementsRaw)];

  const listing = listingOrNull(value.listing);
  if (listing === undefined) return null;

  return { name, startDate, endDate, placements, listing };
}

/** True when the draft holds nothing worth restoring. */
export function isEmptyDraft(draft: AdvertiseDraft): boolean {
  return (
    draft.name.trim() === "" &&
    !draft.startDate &&
    !draft.endDate &&
    draft.placements.length === 0 &&
    !draft.listing
  );
}

/** The saved draft, or null. A malformed value is removed, not repaired. */
export function readAdvertiseDraft(): AdvertiseDraft | null {
  const text = safeStorage.getItem(ADVERTISE_DRAFT_KEY);
  if (text === null) return null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const draft = parseAdvertiseDraft(raw);
  if (!draft) {
    storage.remove(ADVERTISE_DRAFT_KEY);
    return null;
  }
  return draft;
}

export function saveAdvertiseDraft(draft: AdvertiseDraft): void {
  if (isEmptyDraft(draft)) {
    storage.remove(ADVERTISE_DRAFT_KEY);
    return;
  }
  storage.set(ADVERTISE_DRAFT_KEY, draft);
}

export function clearAdvertiseDraft(): void {
  storage.remove(ADVERTISE_DRAFT_KEY);
}
