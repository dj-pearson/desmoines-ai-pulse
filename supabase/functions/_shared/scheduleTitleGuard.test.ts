/**
 * SEO-031. Run with: `deno test supabase/functions/_shared/scheduleTitleGuard.test.ts`
 */
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { checkEventTitle, isPageLabelTitle, namesBothSides } from "./scheduleTitleGuard.ts";

Deno.test("the two production rows from milb.com/iowa are refused", () => {
  // Titles of events 57564c69 and 4e190bd2, both dated 2026-09-26.
  assertFalse(checkEventTitle("Schedule", true).ok);
  assertFalse(checkEventTitle("Iowa Cubs", true).ok);
});

Deno.test("a page label is refused on any source", () => {
  for (const t of ["Schedule", " schedule ", "Full Schedule", "Tickets", "Calendar:", "Untitled Event", "EVENTS"]) {
    assert(isPageLabelTitle(t), t);
    assertFalse(checkEventTitle(t, false).ok, t);
  }
});

Deno.test("titles the sports adapters and the model actually write are kept", () => {
  // Shapes taken from rows in production on 2026-09-30.
  for (const t of [
    "Iowa Cubs vs Omaha",
    "Iowa Cubs vs Omaha/Dog Days of Summer",
    "Hawkeyes vs. Boilermakers - Des Moines Series",
    "Wisconsin vs Iowa",
    "Iowa Barnstormers vs Opponent TBD",
    "Grand View University x Baker University",
    "Iowa @ Omaha",
    "Iowa Wild at Milwaukee Admirals",
  ]) {
    assert(namesBothSides(t), t);
    assertEquals(checkEventTitle(t, true), { ok: true }, t);
  }
});

Deno.test("the opponent rule applies only to team-schedule sources", () => {
  assertEquals(checkEventTitle("Des Moines Arts Festival", false), { ok: true });
  assertFalse(checkEventTitle("Des Moines Arts Festival", true).ok);
});

Deno.test("a word that merely contains a separator is not a matchup", () => {
  assertFalse(namesBothSides("Xtreme Saturday"));
  assertFalse(namesBothSides("Iowa Cubs Fireworks"));
  assertFalse(namesBothSides("vs Omaha"));
});

Deno.test("no title is refused", () => {
  assertFalse(checkEventTitle("", false).ok);
  assertFalse(checkEventTitle(undefined, false).ok);
  assertFalse(checkEventTitle("   ", true).ok);
});
