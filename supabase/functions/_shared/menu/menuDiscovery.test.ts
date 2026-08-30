/**
 * Unit tests for menu candidate discovery.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuDiscovery.test.ts`
 *
 * The regressions these pin:
 *   - image discovery required a positive score, so a JPEG of the whole menu
 *     with a hashed CDN filename and empty alt text was discarded — the single
 *     most common way a small restaurant publishes a menu;
 *   - only `src` was read, so on any lazy-loading site (Squarespace, Wix, most
 *     WordPress themes) the "image" found was a 1x1 placeholder;
 *   - iframe-embedded menu widgets were invisible entirely.
 */
import {
  discoverMenuEmbeds,
  discoverMenuImages,
  discoverMenuLinks,
  isMenuishUrl,
  isPdfUrl,
  mergeCandidates,
  menuUrlsFromSitemap,
} from "./menuDiscovery.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

const HOME = "https://example.com/";

function urls(candidates: Array<{ url: string }>): string[] {
  return candidates.map((c) => c.url);
}

// ─── URL classification ─────────────────────────────────────────────────────

Deno.test("PDF URLs are recognised with and without query strings", () => {
  assert(isPdfUrl("https://x.com/menu.pdf"), "plain");
  assert(isPdfUrl("https://x.com/menu.pdf?v=3"), "query string");
  assert(isPdfUrl("https://x.com/pdfs/dinner"), "pdf directory");
  assert(!isPdfUrl("https://x.com/pdf-viewer-page"), "not a false positive on a slug");
});

Deno.test("menu-ish paths are recognised beyond the literal word 'menu'", () => {
  for (const path of ["/menu", "/menus/dinner", "/food", "/eat", "/tap-list", "/brunch", "/drinks"]) {
    assert(isMenuishUrl(`https://example.com${path}`), `${path} is menu-ish`);
  }
  assert(!isMenuishUrl("https://example.com/about"), "about is not");
  assert(!isMenuishUrl("https://example.com/careers"), "careers is not");
});

// ─── Links ──────────────────────────────────────────────────────────────────

Deno.test("menu links outrank ordinary navigation", () => {
  const html = `
    <a href="/about">About Us</a>
    <a href="/blog">Blog</a>
    <a href="/menu">See Our Menu</a>
    <a href="/hours">Hours</a>`;

  const found = discoverMenuLinks(html, HOME);
  assertEquals(found[0].url, "https://example.com/menu", "the menu link ranks first");
});

Deno.test("chrome links are dropped entirely", () => {
  const html = `
    <a href="/gift-cards">Gift Cards</a>
    <a href="/login">Sign In</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/careers">Careers</a>
    <a href="#top">Back to top</a>
    <a href="mailto:hi@example.com">Email us</a>
    <a href="/menu">Menu</a>`;

  const found = urls(discoverMenuLinks(html, HOME));
  assertEquals(found, ["https://example.com/menu"], "only the menu link survived");
});

Deno.test("a PDF is a strong candidate even with an opaque filename", () => {
  const html = `<a href="/files/8f3a91c.pdf">Download</a>`;
  const found = discoverMenuLinks(html, HOME);
  assertEquals(found.length, 1, "kept");
  assertEquals(found[0].kind, "pdf", "classified as a PDF");
  assert(found[0].score >= 8, `earns a floor score, got ${found[0].score}`);
});

Deno.test("food-category links are flagged as sections of one split menu", () => {
  const html = `
    <a href="/burgers">Burgers</a>
    <a href="/tacos">Tacos</a>
    <a href="/desserts">Desserts</a>
    <a href="/tap-list">On Tap</a>`;

  const found = discoverMenuLinks(html, HOME);
  assertEquals(found.length, 4, "all four kept");
  assert(found.every((c) => c.isSection), "all marked as sections");
});

Deno.test("a third-party ordering platform is recognised and scored up", () => {
  const html = `<a href="https://order.toasttab.com/online/bandit-burrito">Order Online</a>`;
  const found = discoverMenuLinks(html, HOME);
  assertEquals(found[0].platform, "toast", "platform identified");
  assert(found[0].score > 0, "kept as a candidate");
});

Deno.test("an unrelated off-site link is penalised out of contention", () => {
  const html = `<a href="https://someblog.example.org/food-review">A review of our food</a>`;
  assertEquals(discoverMenuLinks(html, HOME).length, 0, "off-site non-platform link dropped");
});

Deno.test("aria-label supplies the label when the anchor wraps only an icon", () => {
  const html = `<a href="/x" aria-label="View our menu"><svg></svg></a>`;
  const found = discoverMenuLinks(html, HOME);
  assertEquals(found.length, 1, "found via aria-label");
});

// ─── Images ─────────────────────────────────────────────────────────────────

Deno.test("a lazy-loaded menu image is found via data-src, not the placeholder", () => {
  const html = `<img src="data:image/gif;base64,R0lGOD" data-src="https://cdn.example.com/8f3a91c.jpg" alt="">`;
  const found = discoverMenuImages(html, "https://example.com/menu");
  assertEquals(urls(found), ["https://cdn.example.com/8f3a91c.jpg"], "real URL taken from data-src");
});

Deno.test("on a menu page, a large unlabeled image is kept", () => {
  // This is the case the old scorer dropped for having nothing menu-ish in the
  // filename or alt text.
  const html = `<img src="https://cdn.example.com/a1b2c3.jpg" alt="" width="1200" height="1600">`;
  assertEquals(
    discoverMenuImages(html, "https://example.com/menu").length,
    1,
    "kept on a menu page",
  );
  assertEquals(
    discoverMenuImages(html, "https://example.com/about").length,
    0,
    "not kept on an unrelated page",
  );
});

Deno.test("logos, icons and social badges are never menu images", () => {
  const html = `
    <img src="/logo.png" alt="Logo" width="1200" height="1200">
    <img src="/icons/facebook.svg" alt="Facebook">
    <img src="/x.jpg" alt="Site Icon">
    <img src="/menu-page-1.jpg" alt="Menu page 1">`;

  const found = urls(discoverMenuImages(html, "https://example.com/menu"));
  assertEquals(found, ["https://example.com/menu-page-1.jpg"], "only the menu image kept");
});

Deno.test("srcset picks the largest entry", () => {
  const html = `<img srcset="/small.jpg 400w, /large.jpg 1600w" src="/small.jpg" alt="menu">`;
  assertEquals(
    urls(discoverMenuImages(html, "https://example.com/menu")),
    ["https://example.com/large.jpg"],
    "highest width descriptor wins",
  );
});

Deno.test("SVGs are excluded because Claude Vision cannot read them", () => {
  const html = `<img src="/menu.svg" alt="menu">`;
  assertEquals(discoverMenuImages(html, "https://example.com/menu").length, 0, "svg skipped");
});

// ─── Embeds ─────────────────────────────────────────────────────────────────

Deno.test("an iframe-embedded menu widget is discovered", () => {
  const html = `<iframe src="https://order.toasttab.com/online/bandit-burrito"></iframe>`;
  const found = discoverMenuEmbeds(html, HOME);
  assertEquals(found.length, 1, "found");
  assertEquals(found[0].platform, "toast", "platform identified");
});

Deno.test("video and map embeds are not mistaken for menus", () => {
  const html = `
    <iframe src="https://www.youtube.com/embed/abc?title=our-food"></iframe>
    <iframe src="https://www.google.com/maps/embed?q=food"></iframe>`;
  assertEquals(discoverMenuEmbeds(html, HOME).length, 0, "both excluded");
});

// ─── Sitemap ────────────────────────────────────────────────────────────────

Deno.test("the sitemap surfaces menu URLs no pattern list would guess", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://example.com/about-our-story</loc></url>
    <url><loc>https://example.com/what-were-pouring/tap-list</loc></url>
    <url><loc>https://example.com/files/dinner.pdf</loc></url>
    <url><loc>https://example.com/careers</loc></url>
  </urlset>`;

  const found = menuUrlsFromSitemap(xml);
  assert(found.includes("https://example.com/what-were-pouring/tap-list"), "tap list found");
  assert(found.includes("https://example.com/files/dinner.pdf"), "PDF found");
  assert(!found.includes("https://example.com/careers"), "chrome path excluded");
  assert(!found.includes("https://example.com/about-our-story"), "about page excluded");
});

// ─── Merging ────────────────────────────────────────────────────────────────

Deno.test("the same URL found twice is tried once, at its best score", () => {
  const merged = mergeCandidates(
    [{ url: "https://example.com/menu", score: 5, kind: "page", label: "a", isSection: false }],
    [{ url: "https://example.com/menu/", score: 20, kind: "page", label: "b", isSection: false }],
  );
  assertEquals(merged.length, 1, "deduplicated across trailing slash");
  assertEquals(merged[0].score, 20, "kept the higher score");
});
