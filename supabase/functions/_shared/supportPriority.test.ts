import { assertEquals } from "jsr:@std/assert@1";
import { priorityForTier } from "./supportPriority.ts";

Deno.test("a VIP ticket moves up one step", () => {
  assertEquals(priorityForTier("low", "vip"), "normal");
  assertEquals(priorityForTier("normal", "vip"), "high");
});

Deno.test("a VIP ticket never becomes urgent on tier alone", () => {
  assertEquals(priorityForTier("high", "vip"), "high");
  assertEquals(priorityForTier("urgent", "vip"), "urgent");
});

Deno.test("other tiers and unknown values are unchanged", () => {
  for (const tier of ["free", "insider", null, undefined]) {
    assertEquals(priorityForTier("normal", tier), "normal");
  }
  assertEquals(priorityForTier("weird", "vip"), "weird");
});
