/**
 * Form model for the seasonal guide editor at /admin/guides (WEB-BE-055).
 *
 * seasonal_guides was seeded by a migration and had no admin surface, so the
 * only way to add or fix a guide was SQL. The editor writes the same shape the
 * public page reads (SeasonalGuide.tsx renders content.sections[].items[]).
 *
 * Sections are edited as plain text, one heading per "## " line and one item
 * per "- " line, because that round-trips without loss and needs no nested
 * form state.
 */

export const GUIDE_SEASONS = ["spring", "summer", "fall", "winter", "holiday"] as const;
export type GuideSeason = (typeof GUIDE_SEASONS)[number];

// A type alias, not an interface, so it is assignable to the generated Json type.
export type GuideSectionInput = {
  title: string;
  items: string[];
};

/** The columns the editor reads and writes. */
export interface AdminSeasonalGuide {
  id: string;
  title: string;
  slug: string;
  season: string | null;
  description: string | null;
  cover_image: string | null;
  content: { sections?: GuideSectionInput[] } | null;
  is_published: boolean | null;
  publish_date: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string | null;
}

export interface GuideFormState {
  id?: string;
  title: string;
  slug: string;
  season: GuideSeason;
  description: string;
  cover_image: string;
  sectionsText: string;
  is_published: boolean;
  /** YYYY-MM-DD, or empty. */
  publish_date: string;
  seo_title: string;
  seo_description: string;
}

export type GuideRow = {
  title: string;
  slug: string;
  season: GuideSeason;
  description: string | null;
  cover_image: string | null;
  content: { sections: GuideSectionInput[] };
  is_published: boolean;
  publish_date: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

export type GuideFormErrors = Partial<Record<keyof GuideFormState, string>>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function slugifyGuideTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function sectionsToText(sections: GuideSectionInput[] | undefined | null): string {
  if (!sections || sections.length === 0) return "";
  return sections
    .map((s) => [`## ${s.title}`, ...(s.items ?? []).map((i) => `- ${i}`)].join("\n"))
    .join("\n\n");
}

/** error is null when the text parsed; sections is then the result. */
export interface ParsedSections {
  sections: GuideSectionInput[];
  error: string | null;
}

const parseError = (error: string): ParsedSections => ({ sections: [], error });

export function parseSectionsText(text: string): ParsedSections {
  const sections: GuideSectionInput[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      const title = heading[1].trim();
      if (!title) return parseError(`Line ${i + 1}: the heading is empty.`);
      sections.push({ title, items: [] });
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      const current = sections[sections.length - 1];
      if (!current) {
        return parseError(`Line ${i + 1}: an item needs a "## " heading above it.`);
      }
      const value = item[1].trim();
      if (value) current.items.push(value);
      continue;
    }
    return parseError(`Line ${i + 1}: start the line with "## " for a heading or "- " for an item.`);
  }
  const empty = sections.find((s) => s.items.length === 0);
  if (empty) return parseError(`"${empty.title}" has no items.`);
  return { sections, error: null };
}

export function emptyGuideForm(): GuideFormState {
  return {
    title: "",
    slug: "",
    season: "summer",
    description: "",
    cover_image: "",
    sectionsText: "",
    is_published: false,
    publish_date: "",
    seo_title: "",
    seo_description: "",
  };
}

function isSeason(value: string | null): value is GuideSeason {
  return !!value && (GUIDE_SEASONS as readonly string[]).includes(value);
}

export function formFromGuide(guide: AdminSeasonalGuide): GuideFormState {
  return {
    id: guide.id,
    title: guide.title,
    slug: guide.slug,
    season: isSeason(guide.season) ? guide.season : "summer",
    description: guide.description ?? "",
    cover_image: guide.cover_image ?? "",
    sectionsText: sectionsToText(guide.content?.sections),
    is_published: guide.is_published === true,
    publish_date: guide.publish_date ? guide.publish_date.slice(0, 10) : "",
    seo_title: guide.seo_title ?? "",
    seo_description: guide.seo_description ?? "",
  };
}

export function absoluteHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/** row is null exactly when errors has an entry. */
export interface BuiltGuideRow {
  row: GuideRow | null;
  errors: GuideFormErrors;
}

/** Validate the form and build the row to write, or return per-field errors. */
export function buildGuideRow(form: GuideFormState): BuiltGuideRow {
  const errors: GuideFormErrors = {};
  const title = form.title.trim();
  const slug = form.slug.trim();
  if (!title) errors.title = "Title is required.";
  if (!slug) errors.slug = "Slug is required.";
  else if (!SLUG_RE.test(slug)) {
    errors.slug = "Use lowercase letters, numbers and single hyphens, e.g. winter-2026.";
  }
  if (!isSeason(form.season)) errors.season = "Pick a season.";
  const cover = form.cover_image.trim();
  if (cover && !absoluteHttpUrl(cover)) {
    errors.cover_image = "Use a full https:// image URL, or leave it empty.";
  }
  const date = form.publish_date.trim();
  if (date && (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
    errors.publish_date = "Use a date like 2026-12-01.";
  }
  const parsed = parseSectionsText(form.sectionsText);
  if (parsed.error) errors.sectionsText = parsed.error;
  else if (form.is_published && parsed.sections.length === 0) {
    errors.sectionsText = "A published guide needs at least one section.";
  }

  if (Object.keys(errors).length > 0) return { row: null, errors };

  return {
    errors,
    row: {
      title,
      slug,
      season: form.season,
      description: orNull(form.description),
      cover_image: cover || null,
      content: { sections: parsed.sections },
      is_published: form.is_published,
      publish_date: date || null,
      seo_title: orNull(form.seo_title),
      seo_description: orNull(form.seo_description),
    },
  };
}
