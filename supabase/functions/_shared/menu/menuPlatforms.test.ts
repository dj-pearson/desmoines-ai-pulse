/**
 * Unit tests for platform detection and embedded-state extraction.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuPlatforms.test.ts`
 *
 * The regression this pins: the old scraper gave third-party platform links a
 * scoring BONUS and then tried to read them with a plain fetch and a tag strip.
 * Those platforms render client-side, so it steered itself toward exactly the
 * pages it could not read, and reported "no menu content found".
 */
import {
  detectMenuPlatform,
  extractMenuFromEmbeddedState,
  looksClientRendered,
} from "./menuPlatforms.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

// ─── Detection ──────────────────────────────────────────────────────────────

Deno.test("platforms are identified from the host", () => {
  assertEquals(detectMenuPlatform("https://order.toasttab.com/x").platform, "toast", "toast");
  assertEquals(detectMenuPlatform("https://foo.popmenu.com/x").platform, "popmenu", "popmenu");
  assertEquals(detectMenuPlatform("https://bandit.square.site").platform, "square", "square");
  assertEquals(detectMenuPlatform("https://www.doordash.com/store/1").platform, "doordash", "doordash");
});

Deno.test("platforms embedded in the restaurant's own site are identified from markup", () => {
  assertEquals(
    detectMenuPlatform("https://example.com/", '<script src="https://popmenu.com/embed.js"></script>')
      .platform,
    "popmenu",
    "popmenu script tag",
  );
  assertEquals(
    detectMenuPlatform("https://example.com/", '<img src="https://images.getbento.com/x.jpg">').platform,
    "bentobox",
    "bentobox CDN",
  );
  assertEquals(
    detectMenuPlatform("https://example.com/", "<script>Static.SQUARESPACE_CONTEXT = {}</script>")
      .platform,
    "squarespace",
    "squarespace context",
  );
});

Deno.test("client-rendered platforms are flagged for JS rendering, server-rendered ones are not", () => {
  assert(detectMenuPlatform("https://order.toasttab.com/x").requiresJs, "toast needs JS");
  assert(detectMenuPlatform("https://foo.popmenu.com/x").requiresJs, "popmenu needs JS");
  assert(
    !detectMenuPlatform("https://example.com/", "<script>Static.SQUARESPACE_CONTEXT={}</script>")
      .requiresJs,
    "squarespace renders its menu server-side, so no headless browser is spent on it",
  );
});

Deno.test("an ordinary site is not attributed to a platform", () => {
  const info = detectMenuPlatform("https://example.com/menu", "<html><body><h1>Menu</h1></body></html>");
  assertEquals(info.platform, null, "no platform");
  assertEquals(info.requiresJs, false, "no render needed");
});

// ─── Empty-shell detection ──────────────────────────────────────────────────

Deno.test("an app shell with no visible text is detected as client-rendered", () => {
  const html = `<html><body><div id="root"></div>${"<script>x</script>".repeat(400)}</body></html>`;
  assert(looksClientRendered(html, "Loading"), "shell detected");
});

Deno.test("a page with real prices is never treated as an empty shell", () => {
  const html = `<html><body>${"<div>Taco $4</div>".repeat(200)}</body></html>`;
  const text = "Taco $4 Burrito $9 Quesadilla $8 ".repeat(50);
  assert(!looksClientRendered(html, text), "priced content is not a shell");
});

// ─── Embedded state ─────────────────────────────────────────────────────────

function nextData(payload: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

Deno.test("a Next.js menu payload is read without an LLM call", () => {
  const html = nextData({
    props: {
      pageProps: {
        restaurant: {
          menus: [
            {
              name: "Dinner",
              groups: [
                {
                  name: "Tacos",
                  items: [
                    { name: "Al Pastor", description: "pineapple", price: 4.5 },
                    { name: "Carnitas", description: "pork", price: 4.5 },
                    { name: "Barbacoa", description: "beef", price: 5 },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  });

  const extraction = extractMenuFromEmbeddedState(html, "https://order.toasttab.com/x");
  assert(extraction !== null, "menu extracted");
  assertEquals(extraction!.method, "platform", "method recorded");
  assertEquals(extraction!.sections[0].section_name, "Tacos", "section name");
  assertEquals(extraction!.sections[0].items.length, 3, "all items");
  assertEquals(extraction!.sections[0].items[0].price, "$4.50", "decimal price formatted");
});

Deno.test("integer cents are converted rather than published as dollars", () => {
  // A platform storing 1299 cents must not become a $1,299 burrito.
  const html = nextData({
    menu: {
      sections: [
        {
          name: "Burritos",
          items: [
            { name: "Carnitas", basePrice: 1299, description: "pork" },
            { name: "Veggie", basePrice: 999, description: "beans" },
          ],
        },
      ],
    },
  });

  const extraction = extractMenuFromEmbeddedState(html, "https://example.com/");
  assertEquals(
    extraction!.sections[0].items.map((i) => i.price),
    ["$12.99", "$9.99"],
    "cents converted to dollars",
  );
});

Deno.test("money objects are unwrapped", () => {
  const html = nextData({
    categories: [
      {
        name: "Drinks",
        items: [
          { name: "Cold Brew", price: { amount: "4.50", currency: "USD" }, description: "iced" },
          { name: "Latte", price: { amount: "5.00", currency: "USD" }, description: "hot" },
        ],
      },
    ],
  });
  const extraction = extractMenuFromEmbeddedState(html, "https://example.com/");
  assertEquals(
    extraction!.sections[0].items.map((i) => i.price),
    ["$4.50", "$5.00"],
    "amount read out of the money object",
  );
});

Deno.test("window.__INITIAL_STATE__ payloads are read too", () => {
  const state = {
    menu: {
      sections: [
        {
          name: "Sandwiches",
          items: [
            { title: "Pork Eggroll Sando", desc: "house sauce", price: "14.00" },
            { title: "French Onion Melt", desc: "gruyere", price: "15.00" },
          ],
        },
      ],
    },
  };
  const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script>`;
  const extraction = extractMenuFromEmbeddedState(html, "https://example.com/");
  assert(extraction !== null, "read from __INITIAL_STATE__");
  assertEquals(extraction!.sections[0].items[0].item_name, "Pork Eggroll Sando", "title key used");
  assertEquals(extraction!.sections[0].items[0].item_description, "house sauce", "desc key used");
});

Deno.test("a JSON payload containing </script> inside a string is not truncated", () => {
  const html = nextData({
    sections: [
      {
        name: "Notes",
        items: [
          { name: "Item A", description: "see </script> for details", price: "1.00" },
          { name: "Item B", description: "plain", price: "2.00" },
        ],
      },
    ],
  });
  const extraction = extractMenuFromEmbeddedState(html, "https://example.com/");
  assert(extraction !== null, "brace balancing recovered the whole object");
  assertEquals(extraction!.sections[0].items.length, 2, "both items");
});

Deno.test("a non-menu accordion is not mistaken for a menu section", () => {
  // Name-only children are exactly what a nav or FAQ tree looks like.
  const html = nextData({
    nav: { name: "Main", items: [{ name: "Home" }, { name: "About" }, { name: "Contact" }] },
  });
  assertEquals(
    extractMenuFromEmbeddedState(html, "https://example.com/"),
    null,
    "items with no price and no description are not a menu",
  );
});

Deno.test("a page with no embedded state returns null rather than throwing", () => {
  assertEquals(
    extractMenuFromEmbeddedState("<html><body><p>Tacos $4</p></body></html>", "https://example.com/"),
    null,
    "nothing found",
  );
});

Deno.test("unparseable state does not throw", () => {
  const html = `<script id="__NEXT_DATA__" type="application/json">{not json</script>`;
  assertEquals(extractMenuFromEmbeddedState(html, "https://example.com/"), null, "handled");
});
