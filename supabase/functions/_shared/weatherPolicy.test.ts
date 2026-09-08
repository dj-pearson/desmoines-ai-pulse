/**
 * Unit tests for the outdoor-conditions policy (WEB-FEAT-022).
 * Run with: `deno test --allow-none supabase/functions/_shared/weatherPolicy.test.ts`
 *
 * These pin the two behaviours the story's acceptance criteria turn on: the
 * function fails OPEN when the National Weather Service publishes nothing
 * usable, and a reorder never drops an item from the list.
 */
import {
  apparentTemperatureF,
  assessOutdoorConditions,
  effectiveTemperature,
  heatIndexF,
  parseWindMph,
  reorderByOutdoorPreference,
  windChillF,
  MIN_COMFORTABLE_F,
  MAX_COMFORTABLE_F,
  WET_PROBABILITY_PCT,
} from "./weatherPolicy.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertClose(actual: number | null, expected: number, tolerance: number, msg: string): void {
  assert(actual !== null, `${msg}: got null`);
  assert(
    Math.abs((actual as number) - expected) <= tolerance,
    `${msg}: expected ~${expected}, got ${actual}`,
  );
}

Deno.test("heat index matches the NWS regression at a real Des Moines reading", () => {
  // 93F at 52% RH, the live gridpoints/DMX/73,49 reading on 2026-09-08.
  assertClose(heatIndexF(93, 52), 101.9, 0.5, "93F/52%");
});

Deno.test("heat index is null outside its valid range", () => {
  assert(heatIndexF(79, 60) === null, "below 80F has no heat index");
  assert(heatIndexF(95, 30) === null, "below 40% RH has no heat index");
});

Deno.test("wind chill matches the NWS 2001 formula", () => {
  assertClose(windChillF(10, 15), -6.6, 0.5, "10F/15mph");
  assertClose(windChillF(30, 10), 21.2, 0.5, "30F/10mph");
});

Deno.test("wind chill is null outside its valid range", () => {
  assert(windChillF(51, 20) === null, "above 50F has no wind chill");
  assert(windChillF(20, 3) === null, "calm air has no wind chill");
});

Deno.test("apparent temperature applies heat index in summer and wind chill in winter", () => {
  assertClose(apparentTemperatureF(93, 52, 9), 101.9, 0.5, "summer uses heat index");
  assertClose(apparentTemperatureF(10, 40, 15), -6.6, 0.5, "winter uses wind chill");
});

Deno.test("apparent temperature falls back to air temperature in mild conditions", () => {
  assert(apparentTemperatureF(65, 50, 5) === 65, "65F is just 65F");
});

Deno.test("apparent temperature is null without an air temperature", () => {
  assert(apparentTemperatureF(null, 50, 5) === null, "null in, null out");
  assert(apparentTemperatureF(undefined) === null, "undefined in, null out");
});

Deno.test("apparent temperature tolerates missing humidity and wind", () => {
  assert(apparentTemperatureF(93) === 93, "no humidity means no heat index");
  assert(apparentTemperatureF(10) === 10, "no wind means no chill");
});

Deno.test("wind speed parses the NWS text field", () => {
  assert(parseWindMph("9 mph") === 9, "single value");
  assert(parseWindMph("5 to 10 mph") === 10, "range takes the gustier end");
  assert(parseWindMph("Calm") === null, "no number is null");
  assert(parseWindMph(null) === null, "null is null");
  assert(parseWindMph(12) === null, "a non-string is null");
});

Deno.test("a hot humid afternoon steers indoors even though the air is under the ceiling", () => {
  // The regression this whole derivation exists for: 93F reads as comfortable,
  // the 102F heat index does not.
  const naive = assessOutdoorConditions({ temperatureF: 93, precipitationProbabilityPct: 10 });
  assert(naive.outdoorFriendly === true, "air temperature alone looks fine");

  const real = assessOutdoorConditions({
    temperatureF: 93,
    feelsLikeF: apparentTemperatureF(93, 52, 9),
    precipitationProbabilityPct: 10,
  });
  assert(real.outdoorFriendly === false, "the heat index does not");
});

Deno.test("apparent temperature wins over air temperature", () => {
  assert(
    effectiveTemperature({ temperatureF: 40, feelsLikeF: 28 }) === 28,
    "feels-like should win",
  );
});

Deno.test("air temperature is the fallback when feels-like is absent", () => {
  assert(effectiveTemperature({ temperatureF: 40, feelsLikeF: null }) === 40, "air fallback");
  assert(effectiveTemperature({ temperatureF: 40 }) === 40, "air fallback when key missing");
});

Deno.test("a missing temperature is null, never zero", () => {
  assert(effectiveTemperature({}) === null, "no reading is null");
  assert(
    effectiveTemperature({ temperatureF: Number.NaN }) === null,
    "NaN is not a temperature",
  );
});

Deno.test("no usable reading is UNKNOWN, not unfavourable", () => {
  const result = assessOutdoorConditions({});
  assert(result.outdoorFriendly === null, `expected null, got ${result.outdoorFriendly}`);
  assert(result.effectiveTemperatureF === null, "no temperature to report");
});

Deno.test("high precipitation probability discourages outdoors at any temperature", () => {
  const result = assessOutdoorConditions({
    temperatureF: 72,
    precipitationProbabilityPct: WET_PROBABILITY_PCT,
    shortForecast: "Rain Showers Likely",
  });
  assert(result.outdoorFriendly === false, "wet should be false");
  assert(result.reason.includes("%"), `reason should name the chance: ${result.reason}`);
});

Deno.test("precipitation just below the threshold still favours outdoors", () => {
  const result = assessOutdoorConditions({
    temperatureF: 72,
    precipitationProbabilityPct: WET_PROBABILITY_PCT - 1,
    shortForecast: "Partly Sunny",
  });
  assert(result.outdoorFriendly === true, "dry-enough should be true");
});

Deno.test("cold below the floor discourages outdoors", () => {
  const result = assessOutdoorConditions({
    feelsLikeF: MIN_COMFORTABLE_F - 1,
    precipitationProbabilityPct: 0,
  });
  assert(result.outdoorFriendly === false, "too cold");
});

Deno.test("heat above the ceiling discourages outdoors", () => {
  const result = assessOutdoorConditions({
    feelsLikeF: MAX_COMFORTABLE_F + 1,
    precipitationProbabilityPct: 0,
  });
  assert(result.outdoorFriendly === false, "too hot");
});

Deno.test("the comfortable band is inclusive at both ends", () => {
  for (const t of [MIN_COMFORTABLE_F, MAX_COMFORTABLE_F]) {
    const result = assessOutdoorConditions({ feelsLikeF: t, precipitationProbabilityPct: 0 });
    assert(result.outdoorFriendly === true, `boundary ${t} should be friendly`);
  }
});

Deno.test("precipitation alone is enough to decide when temperature is missing", () => {
  const result = assessOutdoorConditions({ precipitationProbabilityPct: 5 });
  assert(result.outdoorFriendly === true, "low rain chance is a decision");
  assert(result.effectiveTemperatureF === null, "and reports no temperature");
});

Deno.test("every branch returns a non-empty user-facing reason", () => {
  const readings = [
    {},
    { precipitationProbabilityPct: 90 },
    { feelsLikeF: -5, precipitationProbabilityPct: 0 },
    { feelsLikeF: 101, precipitationProbabilityPct: 0 },
    { feelsLikeF: 70, precipitationProbabilityPct: 0, shortForecast: "Sunny" },
  ];
  for (const reading of readings) {
    const { reason } = assessOutdoorConditions(reading);
    assert(reason.trim().length > 0, `empty reason for ${JSON.stringify(reading)}`);
  }
});

Deno.test("reorder never drops or duplicates an item", () => {
  const items = [
    { id: "a", outdoor: true },
    { id: "b", outdoor: false },
    { id: "c", outdoor: null },
    { id: "d", outdoor: true },
  ];
  const out = reorderByOutdoorPreference(items, (i) => i.outdoor, true);
  assert(out.length === items.length, "same length");
  assert(
    new Set(out.map((i) => i.id)).size === items.length,
    "no duplicates",
  );
  for (const item of items) {
    assert(out.includes(item), `${item.id} survived`);
  }
});

Deno.test("preferred items lead, unknown sits ahead of the mismatch", () => {
  const items = [
    { id: "indoor", outdoor: false },
    { id: "unknown", outdoor: null },
    { id: "outdoor", outdoor: true },
  ];
  const out = reorderByOutdoorPreference(items, (i) => i.outdoor, true).map((i) => i.id);
  assert(out[0] === "outdoor", `expected outdoor first, got ${out.join(",")}`);
  assert(out[1] === "unknown", `expected unknown second, got ${out.join(",")}`);
  assert(out[2] === "indoor", `expected indoor last, got ${out.join(",")}`);
});

Deno.test("reorder is stable within a rank", () => {
  const items = [
    { id: "o1", outdoor: true },
    { id: "o2", outdoor: true },
    { id: "o3", outdoor: true },
  ];
  const out = reorderByOutdoorPreference(items, (i) => i.outdoor, true).map((i) => i.id);
  assert(out.join(",") === "o1,o2,o3", `stability broken: ${out.join(",")}`);
});

Deno.test("preferring indoor inverts the ranking", () => {
  const items = [
    { id: "outdoor", outdoor: true },
    { id: "indoor", outdoor: false },
  ];
  const out = reorderByOutdoorPreference(items, (i) => i.outdoor, false).map((i) => i.id);
  assert(out[0] === "indoor", `expected indoor first, got ${out.join(",")}`);
});

Deno.test("conditions never claims a list was reordered", () => {
  const readings = [
    {},
    { precipitationProbabilityPct: 90, shortForecast: "Rain Showers Likely" },
    { feelsLikeF: -5, precipitationProbabilityPct: 0 },
    { feelsLikeF: 101, precipitationProbabilityPct: 0 },
    { feelsLikeF: 70, precipitationProbabilityPct: 0, shortForecast: "Sunny" },
    { precipitationProbabilityPct: 5 },
  ];
  for (const reading of readings) {
    const { conditions } = assessOutdoorConditions(reading);
    assert(conditions.trim().length > 0, `empty conditions for ${JSON.stringify(reading)}`);
    assert(
      !/picks are first/.test(conditions),
      `conditions leaked the ranking clause: ${conditions}`,
    );
  }
});

Deno.test("reason is conditions plus the consequence clause", () => {
  const wet = assessOutdoorConditions({
    precipitationProbabilityPct: 80,
    shortForecast: "Rain Showers Likely",
  });
  assert(
    wet.reason.startsWith(wet.conditions),
    `reason should extend conditions: ${wet.conditions} / ${wet.reason}`,
  );
  assert(wet.reason.endsWith("so indoor picks are first."), wet.reason);

  const fine = assessOutdoorConditions({
    temperatureF: 72,
    precipitationProbabilityPct: 0,
    shortForecast: "Sunny",
  });
  assert(fine.reason.startsWith(fine.conditions), fine.reason);
  assert(fine.reason.endsWith("so outdoor picks are first."), fine.reason);
});

Deno.test("conditions reads as a sentence opener", () => {
  const fine = assessOutdoorConditions({
    temperatureF: 72,
    precipitationProbabilityPct: 0,
    shortForecast: "Sunny",
  });
  assert(fine.conditions === "72F and sunny", fine.conditions);

  const cold = assessOutdoorConditions({ feelsLikeF: 5, precipitationProbabilityPct: 0 });
  assert(cold.conditions === "It feels like 5F out there", cold.conditions);
});
