/**
 * Unit tests for schema.org menu extraction.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuJsonLd.test.ts`
 *
 * The regression this pins: the old scraper never looked at structured data, so
 * on every site whose platform already publishes an exact machine-readable menu
 * it threw that away and asked an LLM to guess from flattened text instead.
 */
import { extractJsonLdBlocks, extractMenuFromJsonLd } from "./menuJsonLd.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

function page(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

const BASE = "https://example.com/menu";

Deno.test("a Restaurant with an inline Menu yields sections, items and prices", () => {
  const html = page({
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: "Bandit Burrito",
    hasMenu: {
      "@type": "Menu",
      hasMenuSection: [
        {
          "@type": "MenuSection",
          name: "Burritos",
          hasMenuItem: [
            {
              "@type": "MenuItem",
              name: "Carnitas Burrito",
              description: "slow-roasted pork",
              offers: { "@type": "Offer", price: "11.00", priceCurrency: "USD" },
            },
            {
              "@type": "MenuItem",
              name: "Veggie Burrito",
              offers: { "@type": "Offer", price: "9.00", priceCurrency: "USD" },
              suitableForDiet: "https://schema.org/VegetarianDiet",
            },
          ],
        },
      ],
    },
  });

  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assert(extraction !== null, "a menu was found");
  assertEquals(extraction!.method, "jsonld", "method recorded");
  assertEquals(extraction!.sections.length, 1, "one section");
  assertEquals(extraction!.sections[0].section_name, "Burritos", "section name");

  const [carnitas, veggie] = extraction!.sections[0].items;
  assertEquals(carnitas.item_name, "Carnitas Burrito", "item name");
  assertEquals(carnitas.price, "$11.00", "USD price gets a dollar sign");
  assertEquals(carnitas.item_description, "slow-roasted pork", "description");
  assertEquals(veggie.dietary_tags, ["vegetarian"], "suitableForDiet mapped");
});

Deno.test("nested sections are flattened with their parent name kept", () => {
  const html = page({
    "@type": "Menu",
    name: "Drinks",
    hasMenuSection: [
      {
        "@type": "MenuSection",
        name: "Beer",
        hasMenuSection: [
          {
            "@type": "MenuSection",
            name: "On Tap",
            hasMenuItem: [
              { "@type": "MenuItem", name: "Hazy IPA" },
              { "@type": "MenuItem", name: "Barn Lager" },
            ],
          },
        ],
      },
    ],
  });

  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assert(extraction !== null, "menu found");
  assertEquals(extraction!.sections[0].section_name, "Beer — On Tap", "nesting preserved in the name");
  assertEquals(extraction!.sections[0].items.length, 2, "both beers");
});

Deno.test("items directly on the Menu need no section", () => {
  const html = page({
    "@type": "Menu",
    hasMenuItem: [
      { "@type": "MenuItem", name: "Queso", offers: { price: 7 } },
      { "@type": "MenuItem", name: "Guac", offers: { price: 6 } },
    ],
  });
  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assertEquals(extraction!.sections[0].section_name, "Main Menu", "generic fallback name");
  assertEquals(extraction!.sections[0].items.length, 2, "both items");
});

Deno.test("every offer shape yields a price", () => {
  const html = page({
    "@type": "Menu",
    hasMenuItem: [
      { "@type": "MenuItem", name: "A", offers: { price: "5.00", priceCurrency: "USD" } },
      { "@type": "MenuItem", name: "B", offers: [{ price: "6.00" }] },
      {
        "@type": "MenuItem",
        name: "C",
        offers: { priceSpecification: { price: "7.00", priceCurrency: "USD" } },
      },
    ],
  });
  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assertEquals(
    extraction!.sections[0].items.map((i) => i.price),
    ["$5.00", "$6.00", "$7.00"],
    "direct, array and priceSpecification forms",
  );
});

Deno.test("a hasMenu URL is surfaced as a place to look", () => {
  const html = page({
    "@type": "Restaurant",
    name: "Bix & Co",
    hasMenu: "/menus/breakfast.pdf",
  });
  const { extraction, menuUrls } = extractMenuFromJsonLd(html, "https://example.com/");
  assertEquals(extraction, null, "no inline menu");
  assertEquals(menuUrls, ["https://example.com/menus/breakfast.pdf"], "relative URL resolved");
});

Deno.test("@graph documents are walked", () => {
  const html = page({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Site" },
      {
        "@type": "Restaurant",
        hasMenu: {
          "@type": "Menu",
          hasMenuSection: [
            {
              "@type": "MenuSection",
              name: "Tacos",
              hasMenuItem: [
                { "@type": "MenuItem", name: "Al Pastor" },
                { "@type": "MenuItem", name: "Carnitas" },
              ],
            },
          ],
        },
      },
    ],
  });
  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assert(extraction !== null, "found inside @graph");
  assertEquals(extraction!.sections[0].items.length, 2, "both tacos");
});

Deno.test("array-valued @type is matched", () => {
  const html = page({
    "@type": ["Menu", "CreativeWork"],
    hasMenuItem: [
      { "@type": ["MenuItem"], name: "A" },
      { "@type": ["MenuItem"], name: "B" },
    ],
  });
  assert(extractMenuFromJsonLd(html, BASE).extraction !== null, "array @type handled");
});

Deno.test("the same Menu emitted twice is not duplicated", () => {
  const menu = {
    "@type": "Menu",
    hasMenuSection: [
      {
        "@type": "MenuSection",
        name: "Tacos",
        hasMenuItem: [{ "@type": "MenuItem", name: "Al Pastor" }],
      },
    ],
  };
  const html =
    `<script type="application/ld+json">${JSON.stringify(menu)}</script>` +
    `<script type="application/ld+json">${JSON.stringify(menu)}</script>`;

  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assertEquals(extraction!.sections.length, 1, "deduplicated across blocks");
});

Deno.test("malformed JSON-LD is survivable and does not lose the good block", () => {
  const html =
    `<script type="application/ld+json">{ this is not json </script>` +
    `<script type="application/ld+json">{"@type":"Menu","hasMenuItem":[{"@type":"MenuItem","name":"Queso"},{"@type":"MenuItem","name":"Guac"}],}</script>`;

  const { extraction } = extractMenuFromJsonLd(html, BASE);
  assert(extraction !== null, "trailing comma repaired and the bad block skipped");
  assertEquals(extraction!.sections[0].items.length, 2, "both items");
});

Deno.test("a page with no structured data returns nothing rather than throwing", () => {
  const result = extractMenuFromJsonLd("<html><body><p>Tacos $4</p></body></html>", BASE);
  assertEquals(result.extraction, null, "no menu");
  assertEquals(result.menuUrls, [], "no URLs");
});

Deno.test("ld+json blocks are located regardless of attribute order", () => {
  const html =
    `<script data-x="1" type="application/ld+json" defer>{"a":1}</script>` +
    `<script type='application/ld+json'>{"b":2}</script>`;
  assertEquals(extractJsonLdBlocks(html).length, 2, "both blocks found");
});
