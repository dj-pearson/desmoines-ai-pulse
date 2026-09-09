/**
 * Weather policy for outdoor-vs-indoor recommendations (WEB-FEAT-022).
 *
 * The site had no weather signal at all: the word appeared only inside
 * LLM-generated SEO prose. That is the one input a Des Moines outing decision
 * actually turns on, so /events/today could recommend an outdoor festival
 * during a thunderstorm.
 *
 * The DECISION lives here, on the server, rather than in the client. Two
 * reasons. The thresholds are policy, not presentation, and duplicating them
 * across the web app, iOS and Android is how three surfaces end up disagreeing
 * about whether it is a nice day. And the client should not have to hold a
 * second copy of the National Weather Service response shape to re-derive an
 * answer the function already computed.
 *
 * Everything here is pure. No fetch, no Deno globals, no dates read from the
 * clock - the caller passes the observation in. That is what makes it testable
 * without a network and what keeps `npm run type-check:edge` clean.
 */

/** Fahrenheit floor for a comfortable outdoor recommendation. */
export const MIN_COMFORTABLE_F = 20;
/** Fahrenheit ceiling for a comfortable outdoor recommendation. */
export const MAX_COMFORTABLE_F = 95;
/** Precipitation probability (percent) at or above which outdoor is discouraged. */
export const WET_PROBABILITY_PCT = 50;

/**
 * A normalized weather reading. Every field is optional because the National
 * Weather Service omits values routinely - `probabilityOfPrecipitation.value`
 * is null in most daytime periods, and the apparent-temperature grid is not
 * published for every grid point. A missing field must never read as zero.
 */
export interface WeatherReading {
  /** Air temperature in Fahrenheit. */
  temperatureF?: number | null;
  /** Apparent ("feels like") temperature in Fahrenheit, when published. */
  feelsLikeF?: number | null;
  /** Precipitation probability, 0-100. */
  precipitationProbabilityPct?: number | null;
  /** NWS short forecast text, e.g. "Slight Chance Rain Showers". */
  shortForecast?: string | null;
  /** NWS daytime flag for the period. */
  isDaytime?: boolean | null;
}

/**
 * The recommendation. `outdoorFriendly` is deliberately a three-state value:
 * `null` means we do not know, which is different from "no". An unknown must
 * render the normal unweighted list, never a pessimistic one.
 */
export interface OutdoorAssessment {
  outdoorFriendly: boolean | null;
  /**
   * A short phrase describing conditions, with NO claim about ranking -
   * "72F and sunny", "80% chance of rain showers likely".
   *
   * `reason` asserts that a list was reordered, which is false on any surface
   * that only displays the weather (the homepage renders personalized rails and
   * deliberately does not reorder them). A surface that does not rank needs the
   * facts without the consequence clause, and deriving it by string-trimming
   * `reason` on each client would be worse than publishing it.
   */
  conditions: string;
  /**
   * One short sentence, shown to the user. The acceptance criteria require the
   * adjustment to be visible and explained rather than a silent reshuffle, so
   * this string is part of the contract, not a debug field.
   */
  reason: string;
  /** The temperature the decision actually used, after the feels-like fallback. */
  effectiveTemperatureF: number | null;
}

/**
 * Heat index (NWS Rothfusz regression), Fahrenheit.
 *
 * Only meaningful in the heat; below 80F the regression diverges from reality,
 * which is why NWS itself does not publish a heat index there. Returns null
 * outside its valid range so the caller falls back to air temperature rather
 * than to a number the formula did not mean.
 *
 * This is not academic for Des Moines. A 93F afternoon at 52% humidity carries
 * a 102F heat index: reading the air temperature alone would have called that
 * a fine day for an outdoor festival.
 */
export function heatIndexF(temperatureF: number, relativeHumidityPct: number): number | null {
  if (temperatureF < 80 || relativeHumidityPct < 40) return null;
  const t = temperatureF;
  const r = relativeHumidityPct;
  return (
    -42.379 +
    2.04901523 * t +
    10.14333127 * r -
    0.22475541 * t * r -
    0.00683783 * t * t -
    0.05481717 * r * r +
    0.00122874 * t * t * r +
    0.00085282 * t * r * r -
    0.00000199 * t * t * r * r
  );
}

/**
 * Wind chill (NWS 2001 formula), Fahrenheit.
 *
 * Valid at or below 50F with wind above 3 mph; null elsewhere, for the same
 * reason as the heat index.
 */
export function windChillF(temperatureF: number, windMph: number): number | null {
  if (temperatureF > 50 || windMph <= 3) return null;
  const v = Math.pow(windMph, 0.16);
  return 35.74 + 0.6215 * temperatureF - 35.75 * v + 0.4275 * temperatureF * v;
}

/**
 * What the air actually feels like, from the fields the National Weather
 * Service hourly forecast does publish.
 *
 * NWS omits `apparentTemperature` from the hourly forecast periods (it exists
 * only in the raw gridpoint time series, in a far more awkward shape), but it
 * does publish temperature, relative humidity and wind speed in the same
 * payload. Deriving it here costs no extra request.
 */
export function apparentTemperatureF(
  temperatureF: number | null | undefined,
  relativeHumidityPct?: number | null,
  windMph?: number | null,
): number | null {
  if (typeof temperatureF !== "number" || !Number.isFinite(temperatureF)) return null;

  if (typeof relativeHumidityPct === "number" && Number.isFinite(relativeHumidityPct)) {
    const heat = heatIndexF(temperatureF, relativeHumidityPct);
    if (heat !== null) return heat;
  }
  if (typeof windMph === "number" && Number.isFinite(windMph)) {
    const chill = windChillF(temperatureF, windMph);
    if (chill !== null) return chill;
  }
  return temperatureF;
}

/**
 * Parse an NWS wind speed string into mph.
 *
 * The field is human text, not a number: "9 mph" and "5 to 10 mph" are both
 * normal. Take the highest number present, since the gustier end is the one
 * that drives wind chill.
 */
export function parseWindMph(windSpeed: unknown): number | null {
  if (typeof windSpeed !== "string") return null;
  const numbers = windSpeed.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const parsed = numbers.map(Number).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return null;
  return Math.max(...parsed);
}

/**
 * The temperature a person experiences. Prefer the apparent temperature; fall
 * back to air temperature. Returns null when neither is published rather than
 * defaulting to a number, because a fabricated 0F would read as "too cold".
 */
export function effectiveTemperature(reading: WeatherReading): number | null {
  if (typeof reading.feelsLikeF === "number" && Number.isFinite(reading.feelsLikeF)) {
    return reading.feelsLikeF;
  }
  if (typeof reading.temperatureF === "number" && Number.isFinite(reading.temperatureF)) {
    return reading.temperatureF;
  }
  return null;
}

function describeTemperature(tempF: number): string {
  return `it feels like ${Math.round(tempF)}F out there`;
}

/** Sentence-case a conditions phrase for use at the start of a sentence. */
function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

const INDOOR_CLAUSE = "so indoor picks are first";
const OUTDOOR_CLAUSE = "so outdoor picks are first";

/**
 * Decide whether to favour indoor picks.
 *
 * Order matters: precipitation is checked first because rain rules out an
 * outdoor plan at any temperature, and the reason string should name the thing
 * a person would actually notice.
 */
export function assessOutdoorConditions(reading: WeatherReading): OutdoorAssessment {
  const tempF = effectiveTemperature(reading);
  const precip = reading.precipitationProbabilityPct;
  const hasPrecip = typeof precip === "number" && Number.isFinite(precip);
  const forecast = reading.shortForecast?.trim();

  // Nothing usable. Unknown, not unfavourable - the caller must fall through to
  // the normal list.
  if (!hasPrecip && tempF === null) {
    return {
      outdoorFriendly: null,
      conditions: "Weather is unavailable right now",
      reason: "Weather is unavailable right now.",
      effectiveTemperatureF: null,
    };
  }

  // `reason` is always `conditions` plus the consequence clause, built in one
  // place so the two can never describe different weather.
  const verdict = (
    outdoorFriendly: boolean,
    conditions: string,
  ): OutdoorAssessment => ({
    outdoorFriendly,
    conditions: capitalize(conditions),
    reason: `${capitalize(conditions)}, ${outdoorFriendly ? OUTDOOR_CLAUSE : INDOOR_CLAUSE}.`,
    effectiveTemperatureF: tempF,
  });

  if (hasPrecip && (precip as number) >= WET_PROBABILITY_PCT) {
    const detail = forecast ? forecast.toLowerCase() : "wet weather";
    return verdict(
      false,
      `there is a ${Math.round(precip as number)}% chance of precipitation (${detail})`,
    );
  }

  if (tempF !== null && (tempF < MIN_COMFORTABLE_F || tempF > MAX_COMFORTABLE_F)) {
    return verdict(false, describeTemperature(tempF));
  }

  // Comfortable on every axis we can measure. If temperature is missing but
  // precipitation is low, that is still enough to favour outdoors.
  const label = forecast ? forecast.toLowerCase() : "clear conditions";
  return verdict(
    true,
    tempF === null ? `low chance of rain (${label})` : `${Math.round(tempF)}F and ${label}`,
  );
}

/**
 * Stable sort that moves matching items ahead of non-matching ones without
 * dropping anything.
 *
 * Two properties the acceptance criteria depend on. Nothing is filtered out, so
 * a weather-driven reorder can never empty a list. And items whose
 * `is_outdoor` is null (unclassified) keep their original position relative to
 * each other and are never pushed below a known-bad match, because "unknown" is
 * not "wrong".
 */
export function reorderByOutdoorPreference<T>(
  items: readonly T[],
  isOutdoor: (item: T) => boolean | null | undefined,
  preferOutdoor: boolean,
): T[] {
  const rank = (item: T): number => {
    const value = isOutdoor(item);
    if (value === null || value === undefined) return 1; // unknown sits in the middle
    return value === preferOutdoor ? 0 : 2;
  };
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => (a.rank - b.rank) || (a.index - b.index))
    .map((entry) => entry.item);
}
