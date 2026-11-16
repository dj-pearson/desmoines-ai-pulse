/**
 * WEB-SEO-071: pages that write their own Helmet must still publish
 * og:title, og:description, og:url and twitter text.
 *
 * index.html marks its og/twitter text with data-rh, so react-helmet-async
 * deletes it as soon as a page renders any meta. Venue, team, trail,
 * hotels-near-venue and event-series pages wrote a title and description only,
 * so they ended up with no share text at all.
 *
 * Two layers: the Helmet behaviour against a shell-shaped head (which is the
 * reproduction), and a scan of src/pages so a new page cannot ship the same way.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, waitFor, cleanup } from "@testing-library/react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { ShareMeta } from "@/components/seo/ShareMeta";

const PAGES = join(__dirname, "..", "..", "pages");

/** The data-rh tags index.html ships, in the same shape. */
function installShellHead() {
  const tags: Array<[string, string, string]> = [
    ["property", "og:title", "Things to Do in Des Moines"],
    ["property", "og:description", "Shell description"],
    ["name", "twitter:title", "Des Moines Insider"],
    ["name", "twitter:description", "Shell twitter description"],
  ];
  for (const [attr, key, content] of tags) {
    const m = document.createElement("meta");
    m.setAttribute("data-rh", "true");
    m.setAttribute(attr, key);
    m.setAttribute("content", content);
    document.head.appendChild(m);
  }
}

function metas(selector: string): string[] {
  return Array.from(document.head.querySelectorAll<HTMLMetaElement>(selector)).map(
    (m) => m.getAttribute("content") ?? "",
  );
}

async function settled() {
  await waitFor(() => {
    if (!document.title) throw new Error("Helmet not committed yet");
  });
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.title = "";
  installShellHead();
});

afterEach(() => {
  cleanup();
});

describe("Helmet and the shell's data-rh tags", () => {
  it("a page with only title and description is left with no share text (the defect)", async () => {
    render(
      <HelmetProvider>
        <Helmet>
          <title>Raccoon River Valley Trail - Trail Guide</title>
          <meta name="description" content="A paved rail trail." />
        </Helmet>
      </HelmetProvider>,
    );
    await settled();
    expect(metas('meta[property="og:title"]')).toEqual([]);
    expect(metas('meta[name="twitter:title"]')).toEqual([]);
    expect(metas('meta[property="og:url"]')).toEqual([]);
  });

  it("ShareMeta publishes the page's own text exactly once", async () => {
    render(
      <HelmetProvider>
        <ShareMeta
          title="Raccoon River Valley Trail - Trail Guide"
          description="A paved rail trail."
          path="/outdoors/raccoon-river-valley-trail"
        />
        <Helmet>
          <title>Raccoon River Valley Trail - Trail Guide</title>
          <meta name="description" content="A paved rail trail." />
        </Helmet>
      </HelmetProvider>,
    );
    await settled();
    await waitFor(() => expect(metas('meta[property="og:url"]')).toHaveLength(1));
    expect(metas('meta[property="og:title"]')).toEqual(["Raccoon River Valley Trail - Trail Guide"]);
    expect(metas('meta[property="og:description"]')).toEqual(["A paved rail trail."]);
    expect(metas('meta[name="twitter:title"]')).toEqual(["Raccoon River Valley Trail - Trail Guide"]);
    expect(metas('meta[name="twitter:description"]')).toEqual(["A paved rail trail."]);
    expect(metas('meta[property="og:url"]')).toEqual([
      "https://desmoinesinsider.com/outdoors/raccoon-river-valley-trail",
    ]);
  });

  it("does not emit the shell tags Helmet leaves in place", () => {
    const src = readFileSync(join(__dirname, "..", "seo", "ShareMeta.tsx"), "utf8");
    for (const key of ["og:type", "og:site_name", "og:image", "twitter:card", "twitter:image"]) {
      expect(src).not.toContain(`"${key}"`);
    }
  });
});

/** Components that already emit og:title, og:url and twitter text. */
const FULL_EMITTERS = /<(SEOHead|ShareMeta|LocalSEO|EnhancedLocalSEO|EnhancedEventSEO|EnhancedAttractionSEO|EnhancedPlaygroundSEO|SEOTools)\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
    return name.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * Pages that are noindex on every render and are never shared: no preview
 * worth having. Named rather than detected, because a detail page's not-found
 * branch also says noindex and must not exempt the page.
 */
const NOINDEX_ONLY = [
  "Unsubscribe.tsx",
  "NewsletterConfirm.tsx",
  "SubscriptionSuccess.tsx",
  "CMSDashboard.tsx",
];

describe("every page that writes a <title> publishes share text", () => {
  it("exempts only pages that really say noindex", () => {
    for (const rel of NOINDEX_ONLY) {
      expect(readFileSync(join(PAGES, rel), "utf8")).toMatch(/name="robots" content="noindex/);
    }
  });

  const offenders: string[] = [];
  const doubled: string[] = [];
  for (const file of walk(PAGES)) {
    const src = readFileSync(file, "utf8");
    if (!/<title[\s>]/.test(src)) continue;
    const rel = relative(PAGES, file);
    if (NOINDEX_ONLY.includes(rel)) continue;
    const literal = /property="og:url"/.test(src) && /name="twitter:title"/.test(src);
    if (!FULL_EMITTERS.test(src) && !literal) offenders.push(rel);
    if (/<ShareMeta\b/.test(src) && /property="og:(title|description|url)"/.test(src)) doubled.push(rel);
  }

  it("has an og:url and twitter:title source", () => {
    expect(offenders).toEqual([]);
  });

  it("does not write og text by hand next to ShareMeta", () => {
    expect(doubled).toEqual([]);
  });
});
