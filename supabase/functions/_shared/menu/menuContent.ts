/**
 * Turn a menu page into text an LLM can actually read, and keep the part that
 * matters when the page is too big for the prompt.
 *
 * TWO BUGS THIS REPLACES
 * ----------------------
 * 1. STRUCTURE DESTRUCTION. The old scraper flattened pages with
 *
 *        html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
 *
 *    which turns
 *
 *        <div class="item"><h4>Carnitas Burrito</h4>
 *          <p>slow-roasted pork, pinto beans</p><span>$11</span></div>
 *        <div class="item"><h4>Veggie Burrito</h4><span>$9</span></div>
 *
 *    into "Carnitas Burrito slow-roasted pork, pinto beans $11 Veggie Burrito
 *    $9" — one unbroken line where nothing marks where an item ends. Claude
 *    then has to guess whether "$11" belongs to the burrito or the next dish,
 *    and descriptions routinely got welded onto the wrong item. Menus are the
 *    worst possible content for tag-stripping because they are almost entirely
 *    structure: the layout *is* the name/description/price association.
 *
 * 2. PREFIX TRUNCATION. It then did `content.substring(0, 25000)` — the FIRST
 *    25k characters. This is exactly the bug `htmlContentWindow.ts` documents
 *    and fixes for the event crawlers, which the menu path never got. On a
 *    long single-page site the first 25k is head, nav, hero and an about
 *    section, and the menu begins after the cut.
 *
 * The fix mirrors the event-side one: preserve block structure as line breaks,
 * then window on MENU signal density (prices, dietary markers, section words)
 * instead of keeping the front.
 */

/** Default prompt budget for menu extraction, in characters. */
export const DEFAULT_MENU_BUDGET = 32_000;

/**
 * Signals that a slice of text is menu content: prices in any common notation,
 * dietary shorthand, portion and preparation language, and section headings.
 *
 * Prices dominate deliberately — they are the single most reliable marker, and
 * the one thing site chrome never has.
 */
const MENU_DENSITY_RE = new RegExp(
  [
    "\\$\\s?\\d", // $12, $ 12
    "\\b\\d{1,3}\\.\\d{2}\\b", // 12.99 with no symbol
    "\\((?:gf|v|vg|df|ve)\\)", // dietary shorthand
    "\\b(?:served\\s+with|choice\\s+of|topped\\s+with|comes\\s+with|add\\s+\\$?\\d)",
    "\\b(?:appetizers?|starters?|entr[ée]es?|sandwich(?:es)?|burgers?|tacos?|burritos?)\\b",
    "\\b(?:salads?|soups?|sides?|desserts?|drinks?|beverages?|cocktails?|beers?|wines?)\\b",
    "\\b(?:breakfast|brunch|lunch|dinner|happy\\s+hour|on\\s+tap|small\\s+plates?)\\b",
  ].join("|"),
  "gi",
);

/** Count menu signals in a slice. Used to locate the menu within a long page. */
export function menuSignalCount(text: string): number {
  const matches = text.match(MENU_DENSITY_RE);
  return matches ? matches.length : 0;
}

/**
 * Remove markup that never carries menu data.
 *
 * `<form>` is deliberately KEPT, unlike the event-side equivalent: online
 * ordering pages wrap every item in a form with a quantity input, so stripping
 * forms would delete the menu on exactly the sites that are hardest to read.
 *
 * `<nav>` and `<header>` are removed because their "Menu / About / Contact"
 * links are the direct source of the junk items the normalizer otherwise has
 * to filter out downstream.
 */
export function stripMenuChrome(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Named entities common in menu copy, plus numeric escapes. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  deg: "°",
  reg: "®",
  trade: "™",
  cent: "¢",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (whole, name) => {
      const mapped = NAMED_ENTITIES[String(name).toLowerCase()];
      return mapped ?? whole;
    });
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

function stripTags(fragment: string): string {
  return decodeHtmlEntities(fragment.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** A line that is nothing but a price — "$11", "11.00", "$9 / $14". */
const ORPHAN_PRICE_RE = /^\$?\s?\d{1,3}(?:[.,]\d{2})?\s*(?:[-–—/]\s*\$?\s?\d{1,3}(?:[.,]\d{2})?)?\s*$/;

/**
 * Re-attach prices that block-level markup pushed onto their own line.
 *
 * `<p>Carnitas Burrito</p><p>$11</p>` becomes two lines during conversion,
 * which loses the association just as badly as flattening does. Any line that
 * is only a price is folded back onto the line above it.
 */
function rejoinOrphanPrices(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (
      out.length > 0 &&
      line.length <= 24 &&
      ORPHAN_PRICE_RE.test(line) &&
      !out[out.length - 1].startsWith("#")
    ) {
      out[out.length - 1] = `${out[out.length - 1]} — ${line}`;
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * Convert menu HTML to line-structured text.
 *
 * Headings become markdown `#` lines so section names survive as section
 * names; list items get a leading `-`; table cells are joined with `|` so a
 * price column stays on the same line as its dish. Everything else that is a
 * block boundary becomes a newline, and inline elements (`<span>`, `<em>`,
 * `<strong>`, `<a>`) deliberately do NOT break the line, because that is where
 * per-item name/description/price markup lives.
 */
export function htmlToStructuredText(html: string): string {
  let text = stripMenuChrome(html);

  // Image alt text carries item names on graphic-heavy menus.
  text = text.replace(
    /<img\b[^>]*\balt\s*=\s*["']([^"']{3,140})["'][^>]*>/gi,
    (_, alt) => ` ${alt} `,
  );

  // h1–h3 → markdown headings, so SECTION structure reaches the model
  // explicitly. h4–h6 become plain lines instead: inside a menu card those are
  // the ITEM name, and marking them as headings blocks the orphan-price rejoin
  // below, leaving "Veggie Burrito" and "$9" as two unrelated lines.
  text = text.replace(
    /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,
    (_, level: string, inner: string) => {
      const content = stripTags(inner);
      return content ? `\n\n${"#".repeat(Number(level))} ${content}\n` : "\n";
    },
  );
  text = text.replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]\s*>/gi, (_, inner: string) => {
    const content = stripTags(inner);
    return content ? `\n${content}\n` : "\n";
  });

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/t[dh]\s*>/gi, " | ")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(
      /<\/(?:div|p|section|article|dd|dt|ul|ol|table|tbody|figcaption|blockquote|main|aside|li|label|fieldset)\s*>/gi,
      "\n",
    )
    .replace(
      /<(?:div|p|section|article|dd|dt|table|figcaption|blockquote|hr)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text);

  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0\u200b]+/g, " ").trim())
    .filter((line) => line.length > 0);

  return rejoinOrphanPrices(lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Keep the densest `budget` characters of menu content.
 *
 * Windows are aligned to line boundaries so an item is never cut in half, and
 * the scan is coarse (a fraction of the budget per step) because menu content
 * arrives in large contiguous runs — fine-grained scanning would cost more
 * without moving the window anywhere useful.
 */
export function windowOnMenuDensity(text: string, budget = DEFAULT_MENU_BUDGET): string {
  if (text.length <= budget) return text;

  const lines = text.split("\n");
  const lineScores = lines.map((line) => menuSignalCount(line));
  const lineLengths = lines.map((line) => line.length + 1);

  // Prefix sums make every candidate window O(1) to evaluate.
  const cumulativeScore: number[] = [0];
  const cumulativeLength: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    cumulativeScore.push(cumulativeScore[i] + lineScores[i]);
    cumulativeLength.push(cumulativeLength[i] + lineLengths[i]);
  }

  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = -1;
  let end = 0;

  for (let start = 0; start < lines.length; start++) {
    // A single line longer than the budget can leave `end` behind `start`.
    if (end < start) end = start;
    while (end < lines.length && cumulativeLength[end + 1] - cumulativeLength[start] <= budget) {
      end++;
    }
    const score = cumulativeScore[end] - cumulativeScore[start];
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
      bestEnd = end;
    }
    // Once the window reaches the last line, moving `start` only shrinks it.
    if (end >= lines.length) break;
  }

  return lines.slice(bestStart, Math.max(bestEnd, bestStart + 1)).join("\n");
}

/**
 * Longest input sent in one request. Above this the text is split, so the
 * reply cannot run out of `max_tokens` mid-menu. Leaves headroom for the
 * prompt wrapped around it.
 */
export const CHUNK_SIZE = 14_000;

/**
 * Split prepared menu text into chunks that each fit comfortably in one reply.
 *
 * A 90-item menu does not fit in one `max_tokens` response. The old scraper
 * detected that (`stop_reason === 'max_tokens'`), logged a warning, salvaged
 * whatever parsed, and published the partial menu as though it were complete.
 * Splitting the input instead means the tail of a big menu is read rather than
 * guessed at.
 *
 * Splits on blank lines so a section is not cut in half, and truncates a
 * single oversized block rather than emitting a chunk that cannot fit.
 */
export function chunkMenuText(text: string, chunkSize = CHUNK_SIZE): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const block of text.split(/\n{2,}/)) {
    const piece = block.length > chunkSize ? block.slice(0, chunkSize) : block;
    if (current && current.length + piece.length + 2 > chunkSize) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Full preparation pipeline: HTML in, prompt-ready text out.
 *
 * Callers should pass the RAW html. Passing already-flattened text works too
 * (the tag replacements simply find nothing), which keeps this safe to use on
 * markdown returned by Firecrawl.
 */
export function prepareMenuContent(html: string, budget = DEFAULT_MENU_BUDGET): string {
  return windowOnMenuDensity(htmlToStructuredText(html), budget);
}
