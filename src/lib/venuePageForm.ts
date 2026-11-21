/**
 * Form model for the venue page editor at /admin/venue-pages (WEB-BE-055).
 *
 * public.venues backs /music/venues/:slug, the /music venue list, the hotel
 * callout on event pages and "hotels near <venue>". It was filled only by
 * migrations. The admin "Venues" tab edits known_venues, the ingest matching
 * table, which is a different table.
 *
 * The slug is fixed once a venue exists: it is the public URL, and changing it
 * would break inbound links with no redirect.
 */
import { absoluteHttpUrl, slugifyGuideTitle } from "@/lib/seasonalGuideForm";

/** The venue_type CHECK constraint on public.venues (migration 20260228000002). */
export const VENUE_PAGE_TYPES = ["arena", "theater", "bar", "club", "outdoor", "civic"] as const;
export type VenuePageType = (typeof VENUE_PAGE_TYPES)[number];

export const VENUE_PAGE_TYPE_LABELS: Record<VenuePageType, string> = {
  arena: "Arena",
  theater: "Theater",
  bar: "Bar & Lounge",
  club: "Music Club",
  outdoor: "Outdoor Venue",
  civic: "Civic Center",
};

/** Select value meaning "no type", since venue_type is nullable. */
export const NO_VENUE_TYPE = "none";

export interface AdminVenuePage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  capacity: number | null;
  venue_type: string | null;
  image_url: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
}

export interface VenuePageFormState {
  id?: string;
  name: string;
  slug: string;
  venue_type: VenuePageType | typeof NO_VENUE_TYPE;
  description: string;
  address: string;
  capacity: string;
  website: string;
  image_url: string;
  latitude: string;
  longitude: string;
}

export type VenuePageRow = {
  name: string;
  slug: string;
  venue_type: VenuePageType | null;
  description: string | null;
  address: string | null;
  capacity: number | null;
  website: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VenuePageFormErrors = Partial<Record<keyof VenuePageFormState, string>>;

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A box around Iowa. Every venue here is in the metro; the box exists to
 * catch swapped or sign-dropped coordinates (41.59, 93.62 lands in Asia),
 * which pass any plain range check and put the pin and every "hotels near"
 * distance in the wrong place.
 */
const IOWA = { latMin: 40.3, latMax: 43.6, lngMin: -96.7, lngMax: -90.1 };

export const slugifyVenueName = slugifyGuideTitle;

export interface CheckedCoordinates {
  latitude: number | null;
  longitude: number | null;
  errors: Partial<Record<"latitude" | "longitude", string>>;
}

/**
 * Both coordinates or neither, inside the IOWA box. Shared by every admin
 * editor whose rows put a pin on a public map (venues, trails).
 */
export function checkIowaCoordinates(latInput: string, lngInput: string): CheckedCoordinates {
  const errors: CheckedCoordinates["errors"] = {};
  const latRaw = latInput.trim();
  const lngRaw = lngInput.trim();
  if (!latRaw && !lngRaw) return { latitude: null, longitude: null, errors };
  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!latRaw || !lngRaw) {
    errors[latRaw ? "longitude" : "latitude"] = "Enter both coordinates, or neither.";
  } else if (Number.isNaN(latitude) || latitude < IOWA.latMin || latitude > IOWA.latMax) {
    errors.latitude = "Latitude should be in Iowa, around 41.6.";
  } else if (Number.isNaN(longitude) || longitude < IOWA.lngMin || longitude > IOWA.lngMax) {
    errors.longitude = "Longitude should be in Iowa and negative, around -93.6.";
  }
  return { latitude, longitude, errors };
}

export function emptyVenuePageForm(): VenuePageFormState {
  return {
    name: "",
    slug: "",
    venue_type: NO_VENUE_TYPE,
    description: "",
    address: "",
    capacity: "",
    website: "",
    image_url: "",
    latitude: "",
    longitude: "",
  };
}

function isVenueType(value: string | null): value is VenuePageType {
  return !!value && (VENUE_PAGE_TYPES as readonly string[]).includes(value);
}

const str = (n: number | null): string => (n === null || n === undefined ? "" : String(n));

export function formFromVenuePage(venue: AdminVenuePage): VenuePageFormState {
  return {
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    venue_type: isVenueType(venue.venue_type) ? venue.venue_type : NO_VENUE_TYPE,
    description: venue.description ?? "",
    address: venue.address ?? "",
    capacity: str(venue.capacity),
    website: venue.website ?? "",
    image_url: venue.image_url ?? "",
    latitude: str(venue.latitude),
    longitude: str(venue.longitude),
  };
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** row is null exactly when errors has an entry. */
export interface BuiltVenuePageRow {
  row: VenuePageRow | null;
  errors: VenuePageFormErrors;
}

export function buildVenuePageRow(form: VenuePageFormState): BuiltVenuePageRow {
  const errors: VenuePageFormErrors = {};
  const name = form.name.trim();
  const slug = form.slug.trim();
  if (!name) errors.name = "Name is required.";
  if (!slug) errors.slug = "Slug is required.";
  else if (!SLUG_RE.test(slug)) {
    errors.slug = "Use lowercase letters, numbers and single hyphens, e.g. hoyt-sherman-place.";
  }

  let capacity: number | null = null;
  const capRaw = form.capacity.trim();
  if (capRaw) {
    capacity = Number(capRaw);
    if (!/^\d+$/.test(capRaw) || capacity < 1) {
      errors.capacity = "Use a whole number of people, or leave it empty.";
    }
  }

  for (const key of ["website", "image_url"] as const) {
    const value = form[key].trim();
    if (value && !absoluteHttpUrl(value)) errors[key] = "Use a full https:// URL, or leave it empty.";
  }

  const coords = checkIowaCoordinates(form.latitude, form.longitude);
  Object.assign(errors, coords.errors);
  const { latitude, longitude } = coords;

  if (Object.keys(errors).length > 0) return { row: null, errors };

  return {
    errors,
    row: {
      name,
      slug,
      venue_type: form.venue_type === NO_VENUE_TYPE ? null : form.venue_type,
      description: orNull(form.description),
      address: orNull(form.address),
      capacity,
      website: orNull(form.website),
      image_url: orNull(form.image_url),
      latitude,
      longitude,
    },
  };
}
