/**
 * Finding the menu: which URL, which PDF, which image.
 *
 * Restaurants put their menu in wildly different places, and the three failure
 * shapes this module targets are all real:
 *
 *   - the menu is a separate page under a path nobody guesses ("/eat",
 *     "/tap-list", "/breakfast");
 *   - the menu is a PDF, or several PDFs, one per meal service;
 *   - the menu is a photograph or an exported graphic, with a hashed CDN
 *     filename, no "menu" anywhere in the URL, and empty alt text.
 *
 * The previous implementation could only find the first shape, and only when
 * the link text or href contained the literal word "menu". Its image finder
 * required `score > 0` to keep a candidate, which meant a JPEG of the entire
 * menu sitting alone on `/menu` was discarded for having a hashed filename —
 * the single most common way a small restaurant publishes a menu.
 *
 * Regex-based rather than DOM-based, matching the other `_shared` modules, so
 * the tests run with `--allow-none` and no wasm download.
 */

import type { MenuCandidate } from "./types.ts";
import { detectMenuPlatform } from "./menuPlatforms.ts";

// ─── URL classification ─────────────────────────────────────────────────────

export function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.pdf(?:[?#]|$)/.test(lower) || /\/pdfs?\//.test(lower);
}

export function isImageUrl(url: string): boolean {
  return /\.(?:jpe?g|png|gif|webp|avif|heic|bmp|tiff?)(?:[?#]|$)/i.test(url);
}

/** URLs that are never worth fetching, whatever their link text says. */
const DEAD_END_RE =
  /^(?:#|mailto:|tel:|sms:|javascript:|data:|blob:)|\/(?:wp-admin|wp-login|cdn-cgi)\//i;

/**
 * Paths that are site chrome. Matched against the URL path only — link text is
 * scored separately, because "About" in a nav and "About Thyme Salad" on a
 * menu are different things.
 */
const CHROME_PATH_RE =
  /\/(?:gift-?cards?|e-?gift|login|sign-?in|sign-?up|register|account|cart|checkout|careers?|jobs|employment|privacy|terms|accessibility|sitemap|blog|news|press|gallery|photos?|contact|directions|reservations?|book|newsletter|subscribe|faq)\b/i;

/** Words in link text that mean "this is not the menu". */
const CHROME_TEXT_RE =
  /\b(?:gift\s*cards?|log\s*in|sign\s*in|sign\s*up|my\s+account|cart|checkout|careers?|privacy|terms|accessibility|sitemap|newsletter|subscribe|reservations?|book\s+a\s+table|directions|contact\s+us)\b/i;

/**
 * Paths worth probing when link discovery comes up empty, in descending order
 * of how often they are the answer.
 *
 * Tiered so the orchestrator can spend one round-trip each on the likely paths
 * without firing twenty requests at every restaurant. Tier 2 exists for the
 * bar/brewery and breakfast-spot shapes that tier 1 misses entirely.
 */
export const MENU_PATH_PATTERNS: { tier1: string[]; tier2: string[] } = {
  tier1: ["/menu", "/menus", "/our-menu", "/food", "/food-menu"],
  tier2: [
    "/eat",
    "/dine",
    "/dining",
    "/food-and-drink",
    "/drinks",
    "/drink-menu",
    "/beer",
    "/tap-list",
    "/on-tap",
    "/breakfast",
    "/lunch",
    "/dinner",
    "/brunch",
    "/specials",
    "/order-online",
    "/carryout",
    "/takeout",
    "/menu.html",
    "/menu.pdf",
  ],
};

/** True when the URL's own path suggests it is a menu page. */
export function isMenuishUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /(?:^|\/)(?:menus?|food|eat|dine|dining|drinks?|beers?|tap-?list|breakfast|lunch|dinner|brunch|specials?)(?:$|[/.\-_])/.test(
      path,
    );
  } catch {
    return false;
  }
}

// ─── Tiny HTML attribute helpers ────────────────────────────────────────────

/** Read one attribute out of a captured tag-attribute string. */
function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attrs.match(re);
  if (!match) return null;
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  return value.trim() || null;
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";
    return resolved.href;
  } catch {
    return null;
  }
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Same site, allowing for subdomains.
 *
 * Compares the last two labels rather than the full hostname, so a restaurant
 * whose site is `example.com` and whose menu lives at `menus.example.com` or
 * `order.example.com` is still treated as its own.
 */
function sameSite(a: string, b: string): boolean {
  try {
    const registrable = (url: string) => new URL(url).hostname.toLowerCase().split(".").slice(-2).join(".");
    return registrable(a) === registrable(b);
  } catch {
    return false;
  }
}

// ─── Link discovery ─────────────────────────────────────────────────────────

/**
 * Food words that mark a link as one *section* of a multi-page menu.
 *
 * A site with three of these — "Burgers", "Tacos", "Desserts" — is not a site
 * with three menus; it is one menu split across three pages, and every page
 * must be fetched and merged or the published menu is a third of the real one.
 */
const FOOD_SECTION_RE =
  /\b(?:appetizers?|starters?|shareables?|small\s*plates?|salads?|soups?|entr[ée]es?|mains?|pastas?|seafood|steaks?|pizzas?|sandwich(?:es)?|burgers?|wraps?|tacos?|burritos?|bowls?|sushi|wings?|ribs?|bbq|barbecue|desserts?|sweets?|breakfast|brunch|lunch|dinner|drinks?|cocktails?|beers?|wines?|beverages?|sides?|kids?|happy\s*hour|specials?|combos?|platters?|noodles?|rice|curry|ramen|pho|dim\s*sum|sashimi|rolls?|vegan|vegetarian|gluten[\s-]?free|tap\s*list|on\s*tap)\b/i;

/**
 * Rank every link on a page by how likely it leads to menu content.
 *
 * Scores are additive signals rather than a decision tree, so a link can
 * qualify on href alone (a hashed PDF under `/files/`), on text alone
 * ("See what we're pouring"), or on both.
 */
export function discoverMenuLinks(html: string, pageUrl: string): MenuCandidate[] {
  const candidates: MenuCandidate[] = [];
  const seen = new Set<string>();

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html)) !== null) {
    const href = attr(match[1], "href");
    if (!href || DEAD_END_RE.test(href)) continue;

    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) continue;

    const key = resolved.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const linkText = textOf(match[2]).slice(0, 120);
    const ariaLabel = attr(match[1], "aria-label") ?? "";
    const label = linkText || ariaLabel || href;
    const hrefLower = resolved.toLowerCase();
    const isPdf = isPdfUrl(resolved);
    const isImage = isImageUrl(resolved);

    if (CHROME_TEXT_RE.test(label)) continue;
    if (CHROME_PATH_RE.test(hrefLower) && !/menu/i.test(label)) continue;

    let score = 0;
    let isSection = false;

    // ── Link text signals ──
    if (/\b(?:see|view|browse|explore)\s+(?:the\s+|our\s+|full\s+)?menu\b/i.test(label)) score += 16;
    if (/\bfull\s+menus?\b/i.test(label)) score += 13;
    if (/\bdownload\s+(?:the\s+|our\s+)?menu\b/i.test(label)) score += 13;
    if (/\bour\s+menus?\b/i.test(label)) score += 11;
    if (/\bmenus?\b/i.test(label)) score += 9;
    if (/\bfood\s*(?:and|&|\+)\s*drinks?\b/i.test(label)) score += 9;
    if (/\bfood\b/i.test(label)) score += 5;
    if (/\bdining\b/i.test(label)) score += 4;
    if (/\border\s*(?:online|now)?\b/i.test(label)) score += 3;

    if (FOOD_SECTION_RE.test(label)) {
      score += 6;
      isSection = true;
    }

    // ── Href signals ──
    if (/\/menus?(?:$|[/.?#-])/i.test(hrefLower)) score += 9;
    if (/\/(?:food|our-menu|the-menu|food-menu|eat|dine|dining)(?:$|[/.?#-])/i.test(hrefLower)) {
      score += 7;
    }
    if (/\/(?:drinks?|beers?|tap-?list|on-tap|cocktails?|wine)(?:$|[/.?#-])/i.test(hrefLower)) {
      score += 6;
      isSection = true;
    }
    if (/\/(?:breakfast|brunch|lunch|dinner|specials?)(?:$|[/.?#-])/i.test(hrefLower)) {
      score += 6;
      isSection = true;
    }
    const lastSegment = hrefLower.split("?")[0].split("/").filter(Boolean).pop() ?? "";
    if (FOOD_SECTION_RE.test(lastSegment.replace(/[-_]/g, " "))) {
      score += 4;
      isSection = true;
    }

    // ── Asset signals ──
    if (isPdf) {
      // A PDF linked from a restaurant site is a menu far more often than not,
      // so it earns a floor even when nothing else matches.
      score += 8;
      if (/menu/i.test(hrefLower) || /menu/i.test(label)) score += 9;
    }
    if (isImage && (/menu/i.test(hrefLower) || /menu/i.test(label))) score += 8;

    // ── Platform signals ──
    const { platform } = detectMenuPlatform(resolved);
    if (platform) score += 7;

    // An off-site PAGE that is not a known menu platform is a review, a
    // partner, or a press mention — never this restaurant's menu. Disqualified
    // outright rather than merely penalised, because food words in the URL
    // ("/food-review") otherwise carry it back over the threshold. Off-site
    // PDFs and images stay eligible: menus are routinely hosted on a CDN.
    if (!sameSite(resolved, pageUrl) && !platform && !isPdf && !isImage) continue;

    if (score <= 0) continue;

    candidates.push({
      url: resolved,
      score,
      kind: isPdf ? "pdf" : isImage ? "image" : "page",
      label: label.slice(0, 100),
      isSection,
      platform: platform ?? undefined,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 30);
}

// ─── Image discovery ────────────────────────────────────────────────────────

/** Attributes lazy-loading scripts use instead of `src`. */
const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-srcset", "data-image"];

/** Filename/alt fragments that mark an image as decoration, not a menu. */
const NON_MENU_IMAGE_RE =
  /\b(?:logo|icon|favicon|avatar|profile|badge|sprite|spacer|pixel|arrow|chevron|social|facebook|instagram|twitter|tiktok|yelp|tripadvisor|opentable|doordash-badge|app-?store|google-?play)\b/i;

/**
 * Pull an image URL out of a tag, preferring the largest entry in a `srcset`
 * and falling back through the lazy-load attributes.
 *
 * Reading only `src` — which is what the old code did — gets a 1×1 transparent
 * GIF on every lazy-loading site, and Squarespace, Wix and most WordPress
 * themes lazy-load by default. The real URL is in `data-src`.
 */
function bestImageSrc(attrs: string): string | null {
  const srcset = attr(attrs, "srcset") ?? attr(attrs, "data-srcset");
  if (srcset) {
    let bestUrl: string | null = null;
    let bestWidth = -1;
    for (const entry of srcset.split(",")) {
      const [url, descriptor] = entry.trim().split(/\s+/);
      if (!url) continue;
      const width = descriptor?.match(/(\d+)w/) ? Number(descriptor.match(/(\d+)w/)![1]) : 0;
      if (width >= bestWidth) {
        bestWidth = width;
        bestUrl = url;
      }
    }
    if (bestUrl) return bestUrl;
  }

  for (const name of LAZY_SRC_ATTRS) {
    const value = attr(attrs, name);
    // A data-srcset landed here only if the srcset branch above found nothing.
    if (value && !value.includes(",")) return value;
  }

  const src = attr(attrs, "src");
  // Inline placeholders are the lazy-load stub, never the real image.
  if (src && !src.startsWith("data:")) return src;
  return null;
}

/**
 * Find images that might be pictures of the menu.
 *
 * `pageIsMenuish` is the key input: on a page whose URL or heading already
 * says "menu", a large image with a hashed filename and empty alt text is
 * overwhelmingly likely to BE the menu, and is kept. On a homepage the same
 * image is probably a photo of a burger, and is not.
 */
export function discoverMenuImages(
  html: string,
  pageUrl: string,
  pageIsMenuish = isMenuishUrl(pageUrl),
): MenuCandidate[] {
  const candidates: MenuCandidate[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string, score: number, label: string) => {
    const resolved = resolveUrl(rawUrl, pageUrl);
    if (!resolved) return;
    if (/\.svg(?:[?#]|$)/i.test(resolved)) return;
    const key = resolved.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ url: resolved, score, kind: "image", label: label.slice(0, 100), isSection: false });
  };

  const imgRe = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRe.exec(html)) !== null) {
    const attrs = match[1];
    const src = bestImageSrc(attrs);
    if (!src) continue;

    const alt = (attr(attrs, "alt") ?? "").toLowerCase();
    const className = (attr(attrs, "class") ?? "").toLowerCase();
    const title = (attr(attrs, "title") ?? "").toLowerCase();
    const width = Number.parseInt(attr(attrs, "width") ?? "", 10) || null;
    const height = Number.parseInt(attr(attrs, "height") ?? "", 10) || null;

    if (NON_MENU_IMAGE_RE.test(`${alt} ${className} ${title} ${src}`)) continue;

    // Signals that this image is ABOUT a menu, from text a human wrote.
    let textScore = 0;
    if (/menu/i.test(alt)) textScore += 15;
    if (/menu/i.test(title)) textScore += 10;
    if (/menu/i.test(src)) textScore += 10;
    if (/price|\$/i.test(alt)) textScore += 8;
    if (/food|dish|plate|dinner|lunch|breakfast|appetizer|entree|dessert/i.test(alt)) textScore += 4;

    // Signals that this image is SHAPED like a menu. On their own these mean
    // nothing — a hero photo is also big — so they only count once the page
    // has established that it is a menu page.
    let shapeScore = 0;
    if (width && width >= 800) shapeScore += 5;
    if (height && height >= 800) shapeScore += 5;
    if (width && height && height > width * 1.2) shapeScore += 4; // portrait

    // The rule that matters: on a menu page, a large image with a hashed
    // filename and empty alt text is almost certainly the menu itself. That is
    // the candidate the old scorer discarded, and it is the single most common
    // way an independent restaurant publishes a menu.
    if (textScore === 0 && !pageIsMenuish) continue;

    const score = textScore + (pageIsMenuish ? shapeScore + 6 : 0);
    if (score <= 0) continue;
    add(src, score, alt || title || "(no alt)");
  }

  // <picture><source srcset> — the <img> fallback inside is caught above, but
  // the sources often carry the only high-resolution URL.
  const sourceRe = /<source\b([^>]*)>/gi;
  while ((match = sourceRe.exec(html)) !== null) {
    const src = bestImageSrc(match[1]);
    if (!src || !pageIsMenuish) continue;
    if (NON_MENU_IMAGE_RE.test(src)) continue;
    add(src, /menu/i.test(src) ? 12 : 4, "(picture source)");
  }

  // Inline background images — a common way to place a menu graphic.
  const bgRe = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  while ((match = bgRe.exec(html)) !== null) {
    const url = match[1];
    if (NON_MENU_IMAGE_RE.test(url)) continue;
    const score = /menu/i.test(url) ? 12 : pageIsMenuish ? 4 : 0;
    if (score > 0) add(url, score, "(background image)");
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 12);
}

// ─── Embeds ─────────────────────────────────────────────────────────────────

/**
 * Menu widgets embedded in an iframe.
 *
 * Popmenu, Toast, Untappd tap lists and Square ordering are routinely dropped
 * into a page this way. The parent page then contains no menu text at all, so
 * scraping it — however well — returns nothing; the iframe's own URL has to be
 * fetched instead.
 */
export function discoverMenuEmbeds(html: string, pageUrl: string): MenuCandidate[] {
  const candidates: MenuCandidate[] = [];
  const seen = new Set<string>();
  const re = /<(?:iframe|embed)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const src = attr(match[1], "src") ?? attr(match[1], "data-src");
    if (!src) continue;
    const resolved = resolveUrl(src, pageUrl);
    if (!resolved || seen.has(resolved)) continue;

    const { platform } = detectMenuPlatform(resolved);
    const looksMenu = /menu|food|order|taplist|tap-list/i.test(resolved);
    if (!platform && !looksMenu) continue;
    // Video and map embeds match "food" often enough to be worth excluding.
    if (/youtube|vimeo|google\.com\/maps|maps\.google/i.test(resolved)) continue;

    seen.add(resolved);
    candidates.push({
      url: resolved,
      score: platform ? 18 : 10,
      kind: isPdfUrl(resolved) ? "pdf" : "page",
      label: platform ? `${platform} embed` : "menu embed",
      isSection: false,
      platform: platform ?? undefined,
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 6);
}

// ─── Sitemap ────────────────────────────────────────────────────────────────

/**
 * Menu URLs listed in a sitemap.
 *
 * The adaptive fallback for sites whose menu lives at a path no pattern list
 * would guess: the site tells us its own URLs, and we keep the menu-shaped
 * ones. One request, and it costs nothing when the sitemap is absent.
 */
export function menuUrlsFromSitemap(xml: string, limit = 12): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(xml)) !== null && urls.length < limit) {
    const url = match[1].trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (CHROME_PATH_RE.test(url)) continue;
    if (isMenuishUrl(url) || isPdfUrl(url)) urls.push(url);
  }

  return [...new Set(urls)];
}

/**
 * Merge candidate lists, keeping the highest score per URL.
 *
 * Discovery runs over several pages; the same PDF linked from both the
 * homepage and the menu page should be tried once, at its best score.
 */
export function mergeCandidates(...lists: MenuCandidate[][]): MenuCandidate[] {
  const byUrl = new Map<string, MenuCandidate>();
  for (const list of lists) {
    for (const candidate of list) {
      const key = candidate.url.replace(/\/$/, "").toLowerCase();
      const existing = byUrl.get(key);
      if (!existing || candidate.score > existing.score) {
        byUrl.set(key, existing ? { ...candidate, score: Math.max(candidate.score, existing.score) } : candidate);
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => b.score - a.score);
}
