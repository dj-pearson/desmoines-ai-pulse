/**
 * The restaurant detail FAQ (eat-drink pass 2, WP3.1).
 *
 * These answers ship as FAQPage JSON-LD, so each one is a fact read off the
 * row, with its source where it has one. What used to be here and why it went:
 *  - "featured as an editor's pick": nothing editorial writes is_featured on
 *    restaurants; only sponsored rows kept it (20260902000004:20-24).
 *  - "one of the highest-rated", "highly-rated", "Diners appreciate its...":
 *    a rank we never computed and a sentiment nobody measured.
 *  - "one of the most affordable", "an upscale", "a fine dining option" and
 *    the "$15-30 per person" bands: price_range is a Google tier, and the
 *    bands were ours.
 *  - "a popular dining destination": no measure behind it.
 *  - The raw `opening` text pasted into the hours answer: when it doesn't
 *    parse, the answer is left out rather than repeating a string we can't read.
 *
 * geo_faq is AI-written. It comes back separately as `aiFaqs`, for a visible
 * block labelled as AI-assisted, and never enters the FAQPage schema.
 */
import {
  formatClockLabel,
  getOpeningCoverage,
  getOpeningHoursSpecificationFromJson,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { priceTier, readGeoFaq, type FaqItem } from "@/lib/restaurantMeta";

export type RestaurantLifecycle = "closed" | "temporarily_closed" | "not_open_yet" | null;

export interface RestaurantFaqRow {
  name: string;
  cuisine?: string | null;
  location?: string | null;
  phone?: string | null;
  price_range?: string | null;
  rating?: number | null;
  opening?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geo_faq?: unknown;
}

export interface RestaurantFaqContext {
  lifecycle: RestaurantLifecycle;
  /** The address's suburb, from restaurantLocality. */
  locality: string;
  hoursJson?: StoredOpeningHours | null;
  /** Already through safeWebUrl. */
  website?: string | null;
  /** Already through safeWebUrl. */
  menuUrl?: string | null;
  hasCapturedMenu?: boolean;
}

export interface RestaurantFaqs {
  /** Fact-only answers. These, and only these, go into FAQPage JSON-LD. */
  faqs: FaqItem[];
  /** geo_faq pairs not already asked above. Rendered visibly, labelled as AI. */
  aiFaqs: FaqItem[];
}

/** Monday first, the order people read a week in. JS day numbers. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SCHEMA_DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function clockToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes === 23 * 60 + 59 ? 24 * 60 : minutes;
}

function rangeText(open: number, close: number): string {
  if (open === 0 && close === 24 * 60) return "open 24 hours";
  return `${formatClockLabel(open)} to ${formatClockLabel(close)}`;
}

/**
 * Per-day text, Sunday = 0, or null when nothing readable. A day is "closed"
 * only when the source says so; a day the text doesn't mention is null
 * ("not listed"), which the answer says out loud instead of calling it closed.
 */
function weekText(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
): Array<string | null> | null {
  const specs = getOpeningHoursSpecificationFromJson(hoursJson);
  if (specs) {
    // Google's structured hours list every day it is open, so a missing day
    // is a closed day.
    const days: Array<Array<[number, number]>> = DAY_NAMES.map(() => []);
    for (const s of specs) {
      const o = clockToMinutes(s.opens);
      const c = clockToMinutes(s.closes);
      if (o === null || c === null) continue;
      for (const name of s.dayOfWeek) {
        const d = SCHEMA_DAY_INDEX[name];
        if (d !== undefined) days[d].push([o, c]);
      }
    }
    return days.map((ranges) =>
      ranges.length === 0
        ? "closed"
        : ranges
            .sort((a, b) => a[0] - b[0])
            .map(([o, c]) => rangeText(o, c))
            .join(" and "),
    );
  }

  const coverage = getOpeningCoverage(opening);
  if (!coverage || coverage.listedDays.length === 0) return null;
  return coverage.days.map((d) =>
    d.state === "listed"
      ? d.ranges.map((r) => rangeText(r.openMinutes, r.closeMinutes)).join(" and ")
      : d.state === "closed"
        ? "closed"
        : null,
  );
}

/** "Monday to Saturday 11 AM to 10 PM; Sunday closed. Other days aren't listed." */
export function describeWeek(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
): string | null {
  const week = weekText(hoursJson, opening);
  if (!week) return null;

  const groups: Array<{ first: number; last: number; text: string }> = [];
  const unlisted: number[] = [];
  for (const day of WEEK_ORDER) {
    const text = week[day];
    if (text === null) {
      unlisted.push(day);
      continue;
    }
    const prev = groups[groups.length - 1];
    const prevDay = prev ? WEEK_ORDER[WEEK_ORDER.indexOf(prev.last) + 1] : undefined;
    if (prev && prev.text === text && prevDay === day) prev.last = day;
    else groups.push({ first: day, last: day, text });
  }
  if (groups.length === 0) return null;

  const parts = groups.map(({ first, last, text }) => {
    const days =
      first === last
        ? DAY_NAMES[first]
        : WEEK_ORDER.indexOf(last) - WEEK_ORDER.indexOf(first) === 1
          ? `${DAY_NAMES[first]} and ${DAY_NAMES[last]}`
          : `${DAY_NAMES[first]} to ${DAY_NAMES[last]}`;
    return `${days} ${text}`;
  });
  const listed = `${parts.join("; ")}.`;
  if (unlisted.length === 0) return listed;
  const names = unlisted.map((d) => DAY_NAMES[d]);
  const which = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} ${which} ${unlisted.length === 1 ? "isn't" : "aren't"} listed.`;
}

/**
 * The FAQ for one restaurant. Pure: the caller resolves lifecycle, locality
 * and the safe URLs, so the page and a test build the same answers.
 */
export function buildRestaurantFaqs(row: RestaurantFaqRow, ctx: RestaurantFaqContext): RestaurantFaqs {
  const name = row.name.trim();
  const faqs: FaqItem[] = [];
  const shut = ctx.lifecycle === "closed" || ctx.lifecycle === "temporarily_closed";

  if (row.cuisine) {
    faqs.push({
      question: `What type of food does ${name} serve?`,
      answer: `${name} is listed as a ${row.cuisine} restaurant in ${ctx.locality}, Iowa.`,
    });
  }

  if (ctx.lifecycle === "closed") {
    faqs.push({ question: `What are the hours for ${name}?`, answer: `${name} has closed permanently.` });
  } else if (ctx.lifecycle === "temporarily_closed") {
    faqs.push({
      question: `What are the hours for ${name}?`,
      answer: `${name} is temporarily closed. We don't have a reopening date.`,
    });
  } else if (ctx.lifecycle === "not_open_yet") {
    faqs.push({ question: `What are the hours for ${name}?`, answer: `${name} hasn't opened yet.` });
  } else {
    const week = describeWeek(ctx.hoursJson, row.opening);
    if (week) {
      faqs.push({
        question: `What are the hours for ${name}?`,
        answer: `${week} Times are Central. Holiday hours can differ.`,
      });
    }
  }

  const tier = priceTier(row.price_range);
  if (tier) {
    faqs.push({
      question: `How much does it cost to eat at ${name}?`,
      answer: `Google lists ${name} at ${tier} on its one-to-four-dollar-sign scale.`,
    });
  }

  if (row.location) {
    const hasPin = row.latitude != null && row.longitude != null;
    faqs.push({
      question: `Where is ${name} located?`,
      answer: `${name} is at ${row.location}.${hasPin ? " The map on this page shows the spot." : ""}`,
    });
  }

  if (row.phone && !shut) {
    faqs.push({ question: `What is the phone number for ${name}?`, answer: `${row.phone}.` });
  }

  faqs.push({
    // This answered "Yes, the full menu with prices is on this page" for every
    // restaurant, including the ones with no menu captured.
    question: `Does ${name} have an online menu?`,
    answer: ctx.hasCapturedMenu
      ? `Yes. The Menu section on this page has the menu we captured from their site, with the date we captured it.${ctx.menuUrl ? ` Their own menu is at ${ctx.menuUrl}.` : ""}`
      : ctx.menuUrl
        ? `Yes. ${name}'s menu is online at ${ctx.menuUrl}.`
        : ctx.website
          ? `We don't have a menu for ${name}. Their website is ${ctx.website}.`
          : `We don't have a menu or a menu link for ${name}.`,
  });

  if (typeof row.rating === "number" && Number.isFinite(row.rating) && row.rating > 0) {
    faqs.push({
      question: `What is the rating for ${name}?`,
      answer: `Google rating ${row.rating.toFixed(1)} of 5.`,
    });
  }

  const asked = new Set(faqs.map((f) => f.question.toLowerCase()));
  const aiFaqs = readGeoFaq(row.geo_faq).filter((f) => !asked.has(f.question.toLowerCase()));
  return { faqs, aiFaqs };
}
