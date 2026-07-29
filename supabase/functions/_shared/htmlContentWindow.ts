/**
 * Reduce a scraped page to the slice most likely to contain its event list,
 * within the character budget the LLM prompt allows.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * Both crawlers did the equivalent of `content.substring(0, 15000)` — they kept
 * the FIRST 15k characters. On a modern site those characters are `<head>`
 * (preload/meta/inline-CSS soup), the cookie banner, the nav and the hero; the
 * event list starts well past them. Claude was routinely asked to find events in
 * markup that contained none, and the crawl reported "no events found on the
 * website" for pages that were full of them.
 *
 * The fix is in two parts:
 *   1. strip the chrome that never carries event data, and scope to the page's
 *      semantic content region;
 *   2. if the result still exceeds the budget, slide a window over it and keep
 *      the densest run of event signals rather than the front.
 *
 * Shared by ai-crawler and firecrawl-scraper so the two paths can't drift again.
 */

/** Default prompt budgets, matching what the two crawlers used before. */
export const DEFAULT_CONTENT_BUDGET = 15_000;
/** Sports schedules list many short rows, so they get more room. */
export const SPORTS_CONTENT_BUDGET = 25_000;

/**
 * Signals that a slice contains event listings: clock times, month and weekday
 * abbreviations, ticket language, and the markup attributes that carry a real
 * start time or per-event link. Counted per window to locate the calendar.
 *
 * Matches markdown as well as HTML, so it works on either representation.
 */
const EVENT_DENSITY_RE =
  /\b(\d{1,2}:\d{2}\s*(?:am|pm)|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun|tickets?|datetime=|\/event|\/shows?\/|vs\.?\s)/gi;

/**
 * Strip everything that never carries event data.
 *
 * `<head>` goes too: JSON-LD there is handled by the separate
 * `extractEventsFromJsonLd` pass over the RAW html, so nothing is lost by
 * removing it from the LLM's copy.
 *
 * Non-semantic attributes are collapsed to buy budget, but `href`, `src`,
 * `datetime` and `content` are deliberately KEPT — those carry the per-event
 * URL, the image and the exact start time.
 */
export function stripPageChrome(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<form\b[\s\S]*?<\/form>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /\s(?:class|style|aria-[a-z-]+|role|tabindex|target|rel)\s*=\s*("[^"]*"|'[^']*')/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Narrow to the page's content region, preferring (in order) `<main>`, a run of
 * sibling `<article>` blocks, then `<body>`. Returns the input unchanged when
 * none of those is substantial, so this can only ever help.
 *
 * Semantic elements rather than class names, deliberately: `class` has already
 * been collapsed by `stripPageChrome`, and semantics generalize across the CMS
 * themes these venues use where class names do not.
 */
export function scopeToContentRegion(html: string): string {
  const MIN_REGION = 500;

  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1] && main[1].length > MIN_REGION) return main[1];

  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)];
  if (articles.length >= 3) {
    // Several <article> siblings is the standard event-card pattern; keeping
    // only them removes marketing copy that dilutes the extraction.
    const joined = articles.map((m) => m[1]).join("\n");
    if (joined.length > MIN_REGION) return joined;
  }

  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body?.[1] && body[1].length > MIN_REGION) return body[1];

  return html;
}

/** How many event signals a slice contains. */
export function eventSignalCount(slice: string): number {
  EVENT_DENSITY_RE.lastIndex = 0;
  return (slice.match(EVENT_DENSITY_RE) || []).length;
}

/**
 * Keep the `budget`-sized window with the most event signals.
 *
 * Sliding by half a window keeps this O(n) and cheap enough for the edge
 * runtime's CPU limit, while guaranteeing the chosen slice is at least as dense
 * as any aligned window — a far better bet than "the first N characters".
 * Returns the input untouched when it already fits.
 */
export function windowOnEventDensity(content: string, budget: number): string {
  if (content.length <= budget) return content;

  const step = Math.max(1, Math.floor(budget / 2));
  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start < content.length; start += step) {
    const score = eventSignalCount(content.substring(start, start + budget));
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
    if (start + budget >= content.length) break;
  }

  return content.substring(bestStart, bestStart + budget);
}

export interface PrepareOptions {
  /** Max characters to hand the model. */
  budget?: number;
  /**
   * Set false when the input is already tag-free (markdown or extracted text),
   * so the HTML-specific stripping and region scoping are skipped and only the
   * density windowing applies.
   */
  isHtml?: boolean;
  /** Label used in the log line, e.g. the URL being crawled. */
  label?: string;
}

/**
 * Full pipeline: strip chrome → scope to the content region → window on event
 * density. Safe on any input; never returns more than `budget` characters.
 */
export function prepareContentForExtraction(
  content: string,
  options: PrepareOptions = {},
): string {
  const budget = options.budget ?? DEFAULT_CONTENT_BUDGET;
  const isHtml = options.isHtml ?? true;
  if (!content) return "";

  const cleaned = isHtml ? scopeToContentRegion(stripPageChrome(content)) : content;
  const windowed = windowOnEventDensity(cleaned, budget);

  const offset = cleaned.length > budget ? cleaned.indexOf(windowed) : 0;
  console.log(
    `📏 Content prepared${options.label ? ` for ${options.label}` : ""}: ` +
      `${windowed.length} chars (raw ${content.length} → cleaned ${cleaned.length}, ` +
      `budget ${budget}, window offset ${offset < 0 ? 0 : offset}, ` +
      `${eventSignalCount(windowed)} event signals)`,
  );
  return windowed;
}
