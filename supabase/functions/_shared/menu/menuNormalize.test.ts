/**
 * Unit tests for menu normalization, quality scoring and merging.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuNormalize.test.ts`
 *
 * The regressions these pin:
 *   - the only quality check used to be `totalItems < 2`, so a parsed nav bar
 *     was published as a menu;
 *   - the first non-empty extraction won unconditionally, so a 6-item homepage
 *     teaser beat the full menu found one link later;
 *   - multi-page menus were never combined, so two thirds of a split menu was
 *     silently discarded.
 */
import {
  countItems,
  isJunkItemName,
  mergeExtractions,
  normalizeDietaryTags,
  normalizeExtraction,
  parsePriceNumeric,
  passesQualityGate,
  rankExtractions,
  scoreExtraction,
} from "./menuNormalize.ts";
import type { MenuExtraction, MenuItem } from "./types.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

function item(name: string, extra: Partial<MenuItem> = {}): MenuItem {
  return {
    item_name: name,
    item_description: null,
    price: null,
    price_numeric: null,
    dietary_tags: [],
    is_popular: false,
    ...extra,
  };
}

function extraction(
  sections: Array<{ section_name: string; items: MenuItem[] }>,
  overrides: Partial<MenuExtraction> = {},
): MenuExtraction {
  return {
    sections: sections.map((s, i) => ({ ...s, section_sort_order: i })),
    method: "html_text",
    source_url: "https://example.com/menu",
    raw_text: "",
    ...overrides,
  };
}

// ─── Price parsing ──────────────────────────────────────────────────────────

Deno.test("prices parse to the lower bound of whatever shape they take", () => {
  assertEquals(parsePriceNumeric("$12.99"), 12.99, "plain price");
  assertEquals(parsePriceNumeric("12.99"), 12.99, "no symbol");
  assertEquals(parsePriceNumeric("$10-15"), 10, "range takes the low end");
  assertEquals(parsePriceNumeric("$10 - $15"), 10, "spaced range");
  assertEquals(parsePriceNumeric("Sm $5 / Lg $9"), 5, "sized options take the low end");
  // Thousands separators are read as one number, then rejected as implausible
  // for a menu — a four-figure "price" is a phone number or a year.
  assertEquals(parsePriceNumeric("$1,299"), null, "implausible price rejected");
  assertEquals(parsePriceNumeric("$8.5"), 8.5, "single decimal place");
  assertEquals(parsePriceNumeric("Free"), 0, "free is zero, not null");
});

Deno.test("non-numeric prices stay null rather than becoming zero", () => {
  // A "Market Price" lobster stored as 0 sorts as the cheapest item on the site.
  assertEquals(parsePriceNumeric("Market Price"), null, "market price");
  assertEquals(parsePriceNumeric("MP"), null, "MP abbreviation");
  assertEquals(parsePriceNumeric("Seasonal"), null, "seasonal");
  assertEquals(parsePriceNumeric(null), null, "null input");
  assertEquals(parsePriceNumeric(""), null, "empty input");
});

Deno.test("a model-reported price_numeric of 0 for Market Price is not trusted", () => {
  const result = normalizeExtraction(
    extraction([
      {
        section_name: "Seafood",
        items: [
          item("Lobster", { price: "Market Price", price_numeric: 0 }),
          item("Shrimp", { price: "$18", price_numeric: 18 }),
          item("Oysters", { price: "$3 each", price_numeric: 3 }),
        ],
      },
    ]),
  );
  const lobster = result.sections[0].items.find((i) => i.item_name === "Lobster")!;
  assertEquals(lobster.price_numeric, null, "market price has no numeric value");
});

// ─── Junk filtering ─────────────────────────────────────────────────────────

Deno.test("site chrome is rejected as menu items", () => {
  for (const junk of [
    "Home",
    "About Us",
    "Contact",
    "Order Online",
    "Gift Cards",
    "Privacy Policy",
    "Follow us on Instagram",
    "View Our Menu",
    "(515) 555-1234",
    "https://example.com",
    "Mon-Fri 11am-9pm",
    "$12.99",
    "1234 Grand Ave",
    "—",
  ]) {
    assert(isJunkItemName(junk), `"${junk}" should be junk`);
  }
});

Deno.test("real dishes that merely contain chrome words survive", () => {
  // Substring matching on "home"/"about"/"order" would delete all of these,
  // which is why the junk patterns are anchored.
  for (const dish of [
    "Home Fries",
    "About Thyme Salad",
    "Order of Wings",
    "Contact Grill Burger",
    "Newsletter Nachos",
    "Hometown Hero Sandwich",
  ]) {
    assert(!isJunkItemName(dish), `"${dish}" should NOT be junk`);
  }
});

Deno.test("a nav bar parsed as a menu does not survive normalization", () => {
  const nav = normalizeExtraction(
    extraction([
      {
        section_name: "Main Menu",
        items: [item("Home"), item("About"), item("Order Online"), item("Contact Us")],
      },
    ]),
  );
  assertEquals(countItems(nav), 0, "every nav entry filtered out");
  assert(!passesQualityGate(scoreExtraction(nav)), "empty result cannot be published");
});

// ─── Dietary tags ───────────────────────────────────────────────────────────

Deno.test("menu shorthand becomes dietary tags", () => {
  assert(normalizeDietaryTags([], "Falafel Wrap (V)", null).includes("vegetarian"), "(V)");
  assert(normalizeDietaryTags([], "Buddha Bowl (VG)", null).includes("vegan"), "(VG)");
  assert(
    normalizeDietaryTags([], "Grilled Chicken", "served on a (GF) bun").includes("gluten-free"),
    "(GF) in the description",
  );
});

Deno.test("vegan implies vegetarian, and invented tags are dropped", () => {
  const tags = normalizeDietaryTags(["vegan", "keto", "paleo"], "Tofu Scramble", null);
  assert(tags.includes("vegan"), "reported vegan kept");
  assert(tags.includes("vegetarian"), "vegan implies vegetarian");
  assert(!tags.includes("keto"), "keto is not in the stored vocabulary");
  assert(!tags.includes("paleo"), "paleo is not in the stored vocabulary");
});

// ─── Deduplication ──────────────────────────────────────────────────────────

Deno.test("duplicate items within a section merge, keeping the richer record", () => {
  const result = normalizeExtraction(
    extraction([
      {
        section_name: "Tacos",
        items: [
          item("Al Pastor"),
          item("al  pastor", { price: "$4", item_description: "pineapple, cilantro" }),
          item("Carnitas", { price: "$4" }),
          item("Barbacoa", { price: "$5" }),
        ],
      },
    ]),
  );
  assertEquals(countItems(result), 3, "the duplicate collapsed");
  const pastor = result.sections[0].items[0];
  assertEquals(pastor.price, "$4", "price came from the richer duplicate");
  assertEquals(pastor.item_description, "pineapple, cilantro", "description too");
});

// ─── Quality gating ─────────────────────────────────────────────────────────

Deno.test("a brewery tap list with no prices still publishes", () => {
  // Real menus of this shape exist and must not be rejected for lacking prices.
  const taps = normalizeExtraction(
    extraction([
      {
        section_name: "On Tap",
        items: Array.from({ length: 12 }, (_, i) => item(`Barn Town IPA ${i + 1}`)),
      },
    ]),
  );
  const quality = scoreExtraction(taps);
  assert(passesQualityGate(quality), `tap list should pass, scored ${quality.score}`);
  assert(quality.warnings.includes("no prices found"), "but the missing prices are flagged");
});

Deno.test("a two-item fragment does not publish", () => {
  const fragment = normalizeExtraction(
    extraction([{ section_name: "Featured", items: [item("Burrito", { price: "$9" })] }]),
  );
  assert(!passesQualityGate(scoreExtraction(fragment)), "single item is not a menu");
});

Deno.test("a full priced menu scores far above the gate", () => {
  const full = normalizeExtraction(
    extraction([
      {
        section_name: "Burritos",
        items: Array.from({ length: 8 }, (_, i) =>
          item(`Burrito ${i + 1}`, { price: `$${9 + i}`, item_description: "rice, beans" }),
        ),
      },
      {
        section_name: "Tacos",
        items: Array.from({ length: 6 }, (_, i) =>
          item(`Taco ${i + 1}`, { price: "$4", item_description: "corn tortilla" }),
        ),
      },
      {
        section_name: "Drinks",
        items: Array.from({ length: 5 }, (_, i) => item(`Drink ${i + 1}`, { price: "$3" })),
      },
    ]),
  );
  const quality = scoreExtraction(full);
  assert(quality.score > 0.7, `expected a high score, got ${quality.score}`);
  assert(passesQualityGate(quality), "publishes");
});

// ─── Ranking ────────────────────────────────────────────────────────────────

Deno.test("the full menu outranks the teaser that used to win by arriving first", () => {
  const teaser = normalizeExtraction(
    extraction(
      [
        {
          section_name: "Main Menu",
          items: [
            item("Featured Burrito", { price: "$9" }),
            item("Featured Taco", { price: "$4" }),
            item("Featured Bowl", { price: "$11" }),
          ],
        },
      ],
      { source_url: "https://example.com/" },
    ),
  );
  const full = normalizeExtraction(
    extraction(
      [
        {
          section_name: "Burritos",
          items: Array.from({ length: 10 }, (_, i) => item(`Burrito ${i}`, { price: "$9" })),
        },
        {
          section_name: "Tacos",
          items: Array.from({ length: 10 }, (_, i) => item(`Taco ${i}`, { price: "$4" })),
        },
      ],
      { source_url: "https://example.com/menu" },
    ),
  );

  // Deliberately teaser-first: this is the order the old code would have taken.
  const ranked = rankExtractions(
    [teaser, full].map((e) => ({ extraction: e, quality: scoreExtraction(e) })),
  );
  assertEquals(ranked[0].extraction.source_url, "https://example.com/menu", "full menu wins");
});

Deno.test("exact structured data breaks ties against guessed text extraction", () => {
  const shape = [
    { section_name: "Food", items: Array.from({ length: 10 }, (_, i) => item(`Dish ${i}`, { price: "$10" })) },
  ];
  const text = normalizeExtraction(extraction(shape, { method: "html_text" }));
  const jsonld = normalizeExtraction(extraction(shape, { method: "jsonld" }));

  const ranked = rankExtractions(
    [text, jsonld].map((e) => ({ extraction: e, quality: scoreExtraction(e) })),
  );
  assertEquals(ranked[0].extraction.method, "jsonld", "structured data preferred at equal score");
});

// ─── Merging ────────────────────────────────────────────────────────────────

Deno.test("a menu split across pages is reassembled", () => {
  const food = extraction(
    [{ section_name: "Burgers", items: [item("Barn Burger", { price: "$14" })] }],
    { source_url: "https://example.com/food" },
  );
  const brunch = extraction(
    [{ section_name: "Brunch", items: [item("Biscuits & Gravy", { price: "$12" })] }],
    { source_url: "https://example.com/brunch" },
  );
  const taps = extraction([{ section_name: "On Tap", items: [item("Hazy IPA")] }], {
    source_url: "https://example.com/tap-list",
  });

  const merged = mergeExtractions(mergeExtractions(food, brunch), taps);
  assertEquals(countItems(merged), 3, "all three pages contributed");
  assertEquals(
    merged.sections.map((s) => s.section_name),
    ["Burgers", "Brunch", "On Tap"],
    "each page kept its own section name",
  );
  assertEquals(merged.method, "merged", "method reflects the combination");
});

Deno.test("merging never duplicates an item the base already has", () => {
  const base = extraction([
    { section_name: "Burritos", items: [item("Carnitas Burrito", { price: "$11" })] },
  ]);
  // The homepage teaser lists the same dish under a different section name.
  const teaser = extraction(
    [{ section_name: "Main Menu", items: [item("carnitas burrito"), item("Churros")] }],
    { source_url: "https://example.com/" },
  );

  const merged = mergeExtractions(base, teaser);
  assertEquals(countItems(merged), 2, "only the genuinely new item was added");
  const names = merged.sections.flatMap((s) => s.items.map((i) => i.item_name));
  assert(names.includes("Carnitas Burrito"), "the priced original survived");
  assert(names.includes("Churros"), "the new item was added");
});

Deno.test("merging into a matching section name extends it rather than duplicating it", () => {
  const base = extraction([{ section_name: "Tacos", items: [item("Al Pastor")] }]);
  const more = extraction([{ section_name: "tacos", items: [item("Barbacoa")] }], {
    source_url: "https://example.com/tacos",
  });

  const merged = mergeExtractions(base, more);
  assertEquals(merged.sections.length, 1, "one Tacos section, not two");
  assertEquals(countItems(merged), 2, "both items present");
});

Deno.test("section sort orders stay contiguous after merging", () => {
  const a = extraction([
    { section_name: "A", items: [item("a1")] },
    { section_name: "B", items: [item("b1")] },
  ]);
  const b = extraction([{ section_name: "C", items: [item("c1")] }], {
    source_url: "https://example.com/c",
  });
  const merged = mergeExtractions(a, b);
  assertEquals(
    merged.sections.map((s) => s.section_sort_order),
    [0, 1, 2],
    "renumbered in order",
  );
});
