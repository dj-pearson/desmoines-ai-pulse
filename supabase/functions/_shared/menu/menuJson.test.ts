/**
 * Unit tests for menu JSON recovery.
 * Run with: `deno test --allow-none supabase/functions/_shared/menu/menuJson.test.ts`
 *
 * A reply that hits `max_tokens` arrives as a valid JSON *prefix*. Salvaging
 * the items that did arrive beats discarding the whole response — but the
 * salvage must never invent a half-written item.
 */
import { closingFor, parseMenuJson } from "./menuJson.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEquals(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

Deno.test("well-formed JSON parses", () => {
  const sections = parseMenuJson('{"sections":[{"section_name":"Tacos","items":[{"item_name":"Al Pastor"}]}]}');
  assertEquals(sections?.length, 1, "one section");
  assertEquals(sections?.[0].items.length, 1, "one item");
});

Deno.test("markdown code fences are stripped", () => {
  const sections = parseMenuJson('```json\n{"sections":[{"section_name":"A","items":[]}]}\n```');
  assertEquals(sections?.length, 1, "fenced JSON parsed");
});

Deno.test("prose around the object is tolerated", () => {
  const sections = parseMenuJson(
    'Here is the menu I found:\n{"sections":[{"section_name":"A","items":[{"item_name":"X"}]}]}\nLet me know if you need more.',
  );
  assertEquals(sections?.[0].items[0].item_name, "X", "object extracted from prose");
});

Deno.test("alternate top-level keys are accepted", () => {
  assertEquals(parseMenuJson('{"menu_sections":[{"section_name":"A","items":[]}]}')?.length, 1, "menu_sections");
  assertEquals(parseMenuJson('{"menu":[{"section_name":"A","items":[]}]}')?.length, 1, "menu");
  assertEquals(parseMenuJson('{"menuSections":[{"section_name":"A","items":[]}]}')?.length, 1, "menuSections");
});

Deno.test("a reply truncated mid-array recovers the complete items", () => {
  const truncated =
    '{"sections":[{"section_name":"Burgers","section_sort_order":0,"items":[' +
    '{"item_name":"Barn Burger","price":"$14"},' +
    '{"item_name":"Bacon Cheddar","price":"$15"},' +
    '{"item_name":"Mushroom Swi';

  const sections = parseMenuJson(truncated);
  assert(sections !== null, "recovered something");
  assertEquals(sections![0].items.length, 2, "the two complete items, not the half-written third");
  assertEquals(sections![0].items[1].item_name, "Bacon Cheddar", "second item intact");
});

Deno.test("a reply truncated between sections recovers the finished sections", () => {
  const truncated =
    '{"sections":[' +
    '{"section_name":"Tacos","items":[{"item_name":"Al Pastor"}]},' +
    '{"section_name":"Burritos","items":[{"item_name":"Carnitas"}]},' +
    '{"section_name":"Des';

  const sections = parseMenuJson(truncated);
  assertEquals(sections?.length, 2, "two complete sections recovered");
});

Deno.test("braces inside string values do not confuse the repair", () => {
  const json = '{"sections":[{"section_name":"Odd {name}","items":[{"item_name":"A \\"quoted\\" dish"}]}]}';
  const sections = parseMenuJson(json);
  assertEquals(sections?.[0].section_name, "Odd {name}", "braces in a string preserved");
  assertEquals(sections?.[0].items[0].item_name, 'A "quoted" dish', "escaped quotes preserved");
});

Deno.test("an empty menu is a valid answer, not a failure", () => {
  assertEquals(parseMenuJson('{"sections":[]}'), [], "empty array returned, not null");
});

Deno.test("unrecoverable input returns null", () => {
  assertEquals(parseMenuJson(""), null, "empty string");
  assertEquals(parseMenuJson("I could not find a menu on this page."), null, "prose with no JSON");
  assertEquals(parseMenuJson("{{{{"), null, "garbage braces");
});

Deno.test("closingFor closes containers in the order they nest", () => {
  assertEquals(closingFor('{"a":[1,2'), "]}", "array then object");
  // The shape that matters: separate brace/bracket counters would emit "]]}}".
  assertEquals(closingFor('{"sections":[{"items":[{"a":1'), "}]}]}", "interleaved nesting");
  assertEquals(closingFor('{"a":"has [ and { inside"'), "}", "delimiters inside a string ignored");
  assertEquals(closingFor('{"a":"cut mid-str'), '"}', "an unterminated string is closed first");
  assertEquals(closingFor("{}"), "", "already balanced");
});
