/**
 * Form model for the trail editor at /admin/trails (WEB-BE-055).
 *
 * public.trails backs /outdoors and /outdoors/:slug and was filled only by
 * its seed migration (20260228000004). RLS allows admin insert and update and
 * no delete, so the editor creates and edits.
 *
 * The slug is fixed once a trail exists: it is the public URL.
 */
import { absoluteHttpUrl } from "@/lib/seasonalGuideForm";
import { SLUG_RE, checkIowaCoordinates, slugifyVenueName } from "@/lib/venuePageForm";

/** The CHECK constraints on public.trails. */
export const TRAIL_DIFFICULTIES = ["easy", "moderate", "difficult"] as const;
export const TRAIL_SURFACES = ["paved", "gravel", "dirt", "mixed"] as const;
export type TrailDifficulty = (typeof TRAIL_DIFFICULTIES)[number];
export type TrailSurface = (typeof TRAIL_SURFACES)[number];

/** The activities /outdoors filters on and draws an icon for. */
export const TRAIL_ACTIVITIES = ["biking", "hiking", "running", "walking"] as const;

export const TRAIL_LABELS: Record<TrailDifficulty | TrailSurface | (typeof TRAIL_ACTIVITIES)[number], string> = {
  easy: "Easy",
  moderate: "Moderate",
  difficult: "Difficult",
  paved: "Paved",
  gravel: "Gravel",
  dirt: "Dirt",
  mixed: "Mixed surface",
  biking: "Biking",
  hiking: "Hiking",
  running: "Running",
  walking: "Walking",
};

/** Select value meaning "not set", since both columns are nullable. */
export const NOT_SET = "none";

export interface AdminTrail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  length_miles: number | null;
  difficulty: string | null;
  surface_type: string | null;
  activities: string[] | null;
  highlights: string | null;
  trailhead_address: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  website: string | null;
  is_featured: boolean | null;
}

export interface TrailFormState {
  id?: string;
  name: string;
  slug: string;
  difficulty: TrailDifficulty | typeof NOT_SET;
  surface_type: TrailSurface | typeof NOT_SET;
  /** Every activity on the row, including any the form has no checkbox for. */
  activities: string[];
  length_miles: string;
  description: string;
  highlights: string;
  trailhead_address: string;
  latitude: string;
  longitude: string;
  website: string;
  image_url: string;
  is_featured: boolean;
}

export type TrailRow = {
  name: string;
  slug: string;
  difficulty: TrailDifficulty | null;
  surface_type: TrailSurface | null;
  activities: string[];
  length_miles: number | null;
  description: string | null;
  highlights: string | null;
  trailhead_address: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  image_url: string | null;
  is_featured: boolean;
};

export type TrailFormErrors = Partial<Record<keyof TrailFormState, string>>;

export const slugifyTrailName = slugifyVenueName;

/** Well past the 89-mile Raccoon River Valley loop; catches 256 typed for 25.6. */
export const MAX_TRAIL_MILES = 200;

export function emptyTrailForm(): TrailFormState {
  return {
    name: "",
    slug: "",
    difficulty: NOT_SET,
    surface_type: NOT_SET,
    activities: [],
    length_miles: "",
    description: "",
    highlights: "",
    trailhead_address: "",
    latitude: "",
    longitude: "",
    website: "",
    image_url: "",
    is_featured: false,
  };
}

function oneOf<T extends string>(values: readonly T[], value: string | null): value is T {
  return !!value && (values as readonly string[]).includes(value);
}

const str = (n: number | null): string => (n === null || n === undefined ? "" : String(n));

export function formFromTrail(trail: AdminTrail): TrailFormState {
  return {
    id: trail.id,
    name: trail.name,
    slug: trail.slug,
    difficulty: oneOf(TRAIL_DIFFICULTIES, trail.difficulty) ? trail.difficulty : NOT_SET,
    surface_type: oneOf(TRAIL_SURFACES, trail.surface_type) ? trail.surface_type : NOT_SET,
    activities: [...(trail.activities ?? [])],
    length_miles: str(trail.length_miles),
    description: trail.description ?? "",
    highlights: trail.highlights ?? "",
    trailhead_address: trail.trailhead_address ?? "",
    latitude: str(trail.latitude),
    longitude: str(trail.longitude),
    website: trail.website ?? "",
    image_url: trail.image_url ?? "",
    is_featured: !!trail.is_featured,
  };
}

/** Adds or removes one activity and leaves the others, in their order. */
export function toggleActivity(activities: string[], activity: string, on: boolean): string[] {
  const without = activities.filter((a) => a !== activity);
  return on ? [...without, activity] : without;
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** row is null exactly when errors has an entry. */
export interface BuiltTrailRow {
  row: TrailRow | null;
  errors: TrailFormErrors;
}

export function buildTrailRow(form: TrailFormState): BuiltTrailRow {
  const errors: TrailFormErrors = {};
  const name = form.name.trim();
  const slug = form.slug.trim();
  if (!name) errors.name = "Name is required.";
  if (!slug) errors.slug = "Slug is required.";
  else if (!SLUG_RE.test(slug)) {
    errors.slug = "Use lowercase letters, numbers and single hyphens, e.g. grays-lake-trail.";
  }

  let length: number | null = null;
  const lenRaw = form.length_miles.trim();
  if (lenRaw) {
    length = Number(lenRaw);
    if (!/^\d+(\.\d+)?$/.test(lenRaw) || length <= 0 || length > MAX_TRAIL_MILES) {
      errors.length_miles = `Use miles as a number above 0 and up to ${MAX_TRAIL_MILES}, or leave it empty.`;
    }
  }

  for (const key of ["website", "image_url"] as const) {
    const value = form[key].trim();
    if (value && !absoluteHttpUrl(value)) errors[key] = "Use a full https:// URL, or leave it empty.";
  }

  const coords = checkIowaCoordinates(form.latitude, form.longitude);
  Object.assign(errors, coords.errors);

  if (Object.keys(errors).length > 0) return { row: null, errors };

  return {
    errors,
    row: {
      name,
      slug,
      difficulty: form.difficulty === NOT_SET ? null : form.difficulty,
      surface_type: form.surface_type === NOT_SET ? null : form.surface_type,
      activities: [...new Set(form.activities)],
      length_miles: length,
      description: orNull(form.description),
      highlights: orNull(form.highlights),
      trailhead_address: orNull(form.trailhead_address),
      latitude: coords.latitude,
      longitude: coords.longitude,
      website: orNull(form.website),
      image_url: orNull(form.image_url),
      is_featured: form.is_featured,
    },
  };
}
