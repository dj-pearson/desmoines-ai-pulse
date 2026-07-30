/**
 * Unit tests for menu content preparation.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuContent.test.ts`
 *
 * The two regressions these pin, both inherited from the old scraper:
 *   1. `html.replace(/<[^>]+>/g, ' ')` flattened every item, description and
 *      price onto one line, destroying the association the layout encoded;
 *   2. `content.substring(0, 25000)` kept the FRONT of the page — head, nav and
 *      hero — and cut the menu off.
 */
import {
  chunkMenuText,
  decodeHtmlEntities,
  htmlToStructuredText,
  menuSignalCount,
  prepareMenuContent,
  stripMenuChrome,
  windowOnMenuDensity,
} from "./menuContent.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

Deno.test("each menu item lands on its own line with its own price", () => {
  const html = `
    <div class="menu">
      <div class="item"><h4>Carnitas Burrito</h4><p>slow-roasted pork, pinto beans</p><span>$11</span></div>
      <div class="item"><h4>Veggie Burrito</h4><span>$9</span></div>
    </div>`;

  const text = htmlToStructuredText(html);
  const lines = text.split("\n").filter(Boolean);

  // The invariant that matters: each price stays inside its own item's block,
  // in reading order. Flattening put every name, description and price on one
  // line, which is what made the association unrecoverable.
  assert(lines.length >= 3, `structure preserved, got ${lines.length} line(s)`);
  const carnitasAt = text.indexOf("Carnitas Burrito");
  const veggieAt = text.indexOf("Veggie Burrito");
  const elevenAt = text.indexOf("$11");
  const nineAt = text.indexOf("$9");

  assert(carnitasAt >= 0 && veggieAt > carnitasAt, "both items present, in order");
  assert(elevenAt > carnitasAt && elevenAt < veggieAt, "$11 sits inside the carnitas block");
  assert(nineAt > veggieAt, "$9 sits inside the veggie block");

  const veggieLine = lines.find((l) => l.includes("Veggie Burrito"))!;
  assert(veggieLine.includes("$9"), "a price with no description rejoins its item name");
  assert(!veggieLine.includes("Carnitas"), "items did not merge into one line");
});

Deno.test("prices pushed onto their own line by block markup are re-attached", () => {
  const html = `<p>Carnitas Burrito</p><p>$11</p><p>Veggie Burrito</p><p>$9</p>`;
  const lines = htmlToStructuredText(html).split("\n");
  assertEquals(lines.length, 2, "two items, not four fragments");
  assert(lines[0].includes("Carnitas Burrito") && lines[0].includes("$11"), "first pair joined");
  assert(lines[1].includes("Veggie Burrito") && lines[1].includes("$9"), "second pair joined");
});

Deno.test("headings survive as section markers", () => {
  const html = `<h2>Appetizers</h2><div>Queso $7</div><h2>Tacos</h2><div>Al Pastor $4</div>`;
  const text = htmlToStructuredText(html);
  assert(text.includes("## Appetizers"), "first section heading kept");
  assert(text.includes("## Tacos"), "second section heading kept");
  assert(text.indexOf("## Appetizers") < text.indexOf("Queso"), "heading precedes its items");
});

Deno.test("table rows keep the dish and its price on one line", () => {
  const html = `<table><tr><td>Nachos</td><td>$9.50</td></tr><tr><td>Wings</td><td>$12</td></tr></table>`;
  const lines = htmlToStructuredText(html).split("\n").filter(Boolean);
  assert(lines[0].includes("Nachos") && lines[0].includes("$9.50"), "row one intact");
  assert(lines[1].includes("Wings") && lines[1].includes("$12"), "row two intact");
});

Deno.test("inline markup inside an item does not break the line", () => {
  const html = `<div><strong>Queso</strong> <em>house-made</em> <a href="/x">(GF)</a> <span>$7</span></div>`;
  const lines = htmlToStructuredText(html).split("\n").filter(Boolean);
  assertEquals(lines.length, 1, "spans/em/strong/a stayed inline");
  assert(lines[0].includes("(GF)") && lines[0].includes("$7"), "dietary marker and price kept together");
});

Deno.test("nav, header, footer, script and style are removed", () => {
  const html = `
    <head><title>x</title></head>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <header><a href="/gift-cards">Gift Cards</a></header>
    <script>var menu = "fake";</script>
    <style>.menu { color: red }</style>
    <main><h2>Tacos</h2><div>Al Pastor $4</div></main>
    <footer><a href="/privacy">Privacy Policy</a></footer>`;

  const text = htmlToStructuredText(html);
  assert(text.includes("Al Pastor"), "real content kept");
  assert(!text.includes("Gift Cards"), "header chrome gone");
  assert(!text.includes("Privacy Policy"), "footer chrome gone");
  assert(!text.includes("var menu"), "script gone");
  assert(!text.includes("color: red"), "style gone");
});

Deno.test("forms are KEPT because ordering pages wrap every item in one", () => {
  const html = `<form><div>Carnitas Burrito $11</div><div>Veggie Burrito $9</div></form>`;
  const text = stripMenuChrome(html);
  assert(text.includes("Carnitas Burrito"), "form content survives chrome stripping");
});

Deno.test("entities decode so prices and accented dish names read correctly", () => {
  assertEquals(decodeHtmlEntities("Entr&eacute;es"), "Entrées", "named entity");
  assertEquals(decodeHtmlEntities("Mac &amp; Cheese"), "Mac & Cheese", "ampersand");
  assertEquals(decodeHtmlEntities("&#36;12"), "$12", "numeric entity");
  assertEquals(decodeHtmlEntities("&#x24;12"), "$12", "hex entity");
  assertEquals(decodeHtmlEntities("&notarealentity;"), "&notarealentity;", "unknown left alone");
});

Deno.test("windowing lands on the menu, not the front of the page", () => {
  // The exact shape the old substring(0, N) got wrong: a long chrome preamble
  // followed by the actual menu.
  const chrome = "Welcome to our restaurant, a neighborhood institution. ".repeat(400);
  const menu = Array.from(
    { length: 60 },
    (_, i) => `Dish ${i} — house-made, served with fries — $${10 + (i % 9)}.00`,
  ).join("\n");

  const windowed = windowOnMenuDensity(`${chrome}\n${menu}`, 4_000);
  assert(windowed.length <= 4_000, "budget respected");
  assert(windowed.includes("$1"), "landed on priced content");
  assert(!windowed.includes("neighborhood institution"), "did not keep the chrome preamble");
});

Deno.test("content that already fits is returned untouched", () => {
  const text = "## Tacos\nAl Pastor $4\nCarnitas $4";
  assertEquals(windowOnMenuDensity(text, 10_000), text, "no windowing needed");
});

Deno.test("menu signals count prices and menu vocabulary", () => {
  assert(menuSignalCount("Al Pastor $4.00 — served with cilantro") >= 2, "price + phrasing");
  assert(menuSignalCount("Our story began in 1987 when two friends") === 0, "about copy scores zero");
});

Deno.test("a single oversized line does not break windowing", () => {
  const giant = "x".repeat(50_000);
  const result = windowOnMenuDensity(giant, 1_000);
  assert(result.length > 0, "returned something rather than throwing or emptying");
});

Deno.test("empty and tiny inputs are handled without throwing", () => {
  assertEquals(prepareMenuContent(""), "", "empty string");
  assert(prepareMenuContent("<div>Tacos $4</div>").includes("Tacos"), "tiny page");
});

Deno.test("long menus are chunked at blank-line boundaries so replies cannot truncate", () => {
  const section = (name: string) =>
    `## ${name}\n` + Array.from({ length: 60 }, (_, i) => `${name} item ${i} — $${10 + i}`).join("\n");
  const text = [section("Burgers"), section("Tacos"), section("Drinks"), section("Desserts")].join(
    "\n\n",
  );

  const chunks = chunkMenuText(text, 4_000);
  assert(chunks.length > 1, "split into multiple chunks");
  for (const chunk of chunks) {
    assert(chunk.length <= 4_000 + 2, `chunk within budget, got ${chunk.length}`);
  }
  const rejoined = chunks.join("\n");
  for (const name of ["Burgers", "Tacos", "Drinks", "Desserts"]) {
    assert(rejoined.includes(`## ${name}`), `${name} section survived chunking`);
  }
});

Deno.test("short content is a single chunk", () => {
  assertEquals(chunkMenuText("Tacos $4"), ["Tacos $4"], "no unnecessary splitting");
});

Deno.test("image alt text is preserved because it names items on graphic menus", () => {
  const html = `<div><img src="/x.jpg" alt="Breakfast Burrito - $8"></div>`;
  assert(htmlToStructuredText(html).includes("Breakfast Burrito"), "alt text kept");
});
