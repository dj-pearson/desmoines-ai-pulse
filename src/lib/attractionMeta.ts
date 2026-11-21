import { BRAND } from "@/lib/brandConfig";
import { restaurantLocality } from "@/lib/restaurantMeta";

/**
 * <title> and meta description for an attraction page (WEB-SEO-053).
 *
 * AttractionDetails built both inline. The title was
 * `${name} - ${type} in Des Moines, Iowa` for every row, so Adventureland
 * Resort (Altoona) and Altoona Aquatics Park were titled as being in Des
 * Moines. That is the locality defect SEO-007 fixed for events and WEB-SEO-024
 * fixed in this page's own JSON-LD; the <title> kept it. The description was
 * `description.slice(0, 160)`, which on this table is mostly two or three
 * words: "Dog park", "Brewery", "Golf course".
 *
 * Both now read only the row: the city its address names, or "the Des Moines
 * area" when the address names none (public.attractions has no city column).
 */

/** Before SEOHead's brand suffix, the same budget restaurant titles use. */
export const ATTRACTION_TITLE_BUDGET = 60;

/** Roughly where a result truncates a meta description. */
export const ATTRACTION_DESCRIPTION_BUDGET = 155;

export interface AttractionMetaInput {
  name: string;
  type?: string | null;
  location?: string | null;
  description?: string | null;
  is_free?: boolean | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Whole words up to `max` characters, with "..." when anything was cut. */
function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const room = max - 3;
  const cut = t.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.-]+$/, "")}...`;
}

/**
 * The city an attraction's address names, or null.
 *
 * "4700 Grand Ave, Des Moines, Iowa" and "3200 Adventureland Drive, Altoona,
 * IA 50009" parse through the restaurant reader. "1330 Grand Avenue, Des
 * Moines" has no state, so it is read here: a street (starts with a digit)
 * then one place-name segment. "7700 University Avenue, Suite C" is a street
 * and a unit, not a city, and "Historic Court District, Des Moines" has no
 * street, so nothing says the last segment is a city rather than a district.
 */
export function attractionLocality(location: string | null | undefined): string | null {
  const fromAddress = restaurantLocality({ city: null, location: location ?? null });
  if (fromAddress) return fromAddress;
  const parts = (location ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2 || !/^\d/.test(parts[0])) return null;
  const last = parts[1];
  if (!/^[A-Za-z .'-]+$/.test(last) || /^(suite|ste|unit|apt|floor|fl|building|bldg)\b/i.test(last)) return null;
  return last;
}

/** "in Altoona, Iowa", or "in the Des Moines area" when the address names no city. */
function inPlace(locality: string | null, capitalArea: boolean): string {
  if (locality) return `in ${locality}, ${BRAND.state}`;
  return `in the ${BRAND.city} ${capitalArea ? "Area" : "area"}`;
}

/** The row's type, unless the name already says it ("Blank Park Zoo", "Zoo"). */
function typeWorthSaying(name: string, type: string | null | undefined): string | null {
  const t = (type ?? "").trim();
  if (!t) return null;
  return ` ${norm(name)} `.includes(` ${norm(t)} `) ? null : t;
}

/**
 * The <title> before SEOHead appends the brand: the longest of these that fits
 * ATTRACTION_TITLE_BUDGET.
 *   "Des Moines Art Center: Museum in Des Moines, Iowa"
 *   "Blank Park Zoo in Des Moines, Iowa"            (the name already says Zoo)
 *   "Altoona Aquatics Park in the Des Moines Area"   (the address names no city)
 */
export function attractionPageTitle(row: AttractionMetaInput): string {
  const name = row.name.trim();
  const locality = attractionLocality(row.location);
  const type = typeWorthSaying(name, row.type);
  const where = inPlace(locality, true);
  const candidates = [
    type ? `${name}: ${type} ${where}` : `${name} ${where}`,
    locality ? `${name}, ${locality}` : null,
    type ? `${name}: ${type}` : null,
  ].filter((c): c is string => !!c);
  return candidates.find((c) => c.length <= ATTRACTION_TITLE_BUDGET) ?? clip(name, ATTRACTION_TITLE_BUDGET);
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** First letter up, one closing period. */
function sentence(text: string): string {
  const t = text.trim().replace(/\s+/g, " ").replace(/[\s.]+$/, "");
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : "";
}

/**
 * The meta description: what and where from the row, then the row's own
 * description when it says more than the name and type already do, then
 * "Free admission." only when is_free says so, then what the page offers.
 */
export function attractionMetaDescription(row: AttractionMetaInput): string {
  const name = row.name.trim();
  const locality = attractionLocality(row.location);
  const typeText = (row.type ?? "").trim().toLowerCase() || "attraction";
  const head = `${name} is ${article(typeText)} ${typeText} ${inPlace(locality, false)}.`;

  const about = (row.description ?? "").trim();
  // "Dog park" on 17th Avenue Dog Park adds nothing the head did not say.
  const aboutAddsSomething = about.length > 0 && !` ${norm(head)} `.includes(` ${norm(about)} `);

  let text = head;
  const add = (part: string) => {
    if (part && `${text} ${part}`.length <= ATTRACTION_DESCRIPTION_BUDGET) text = `${text} ${part}`;
  };

  if (aboutAddsSomething) {
    const room = ATTRACTION_DESCRIPTION_BUDGET - head.length - 1;
    if (room >= 30) text = `${head} ${clip(sentence(about), room)}`;
  }
  if (row.is_free === true) add("Free admission.");
  add("Hours, directions and events nearby.");
  return clip(text, ATTRACTION_DESCRIPTION_BUDGET);
}
