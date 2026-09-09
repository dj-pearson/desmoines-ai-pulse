/**
 * SECURITY: verify_jwt = false
 * Reason: Public read-only weather for the Des Moines area, shown to anonymous
 *   visitors on the homepage and /events/today before any sign-in exists.
 * Alternative measures: no user input reaches the upstream URL (the coordinates
 *   are compile-time constants, so there is no SSRF surface), no secrets are
 *   read, no database is touched, and the response is rate-limited and cached.
 * Risk level: LOW
 *
 * weather - current conditions for Des Moines (WEB-FEAT-022).
 *
 * WHY THE NATIONAL WEATHER SERVICE. api.weather.gov needs no API key, has no
 * quota to exhaust and no bill to run up, and is the authoritative US source.
 * The alternative (OpenWeather et al) would have added the first paid vendor
 * key to a repo whose .env.example holds five variables, for data the
 * government publishes free. NWS asks for a User-Agent identifying the caller;
 * that is the whole of its terms.
 *
 * WHY THE DECISION IS COMPUTED HERE. The indoor/outdoor thresholds are policy.
 * Web, iOS and Android all want the same answer, and three clients
 * re-implementing the same comparison is three chances to disagree about
 * whether it is a nice day. `_shared/weatherPolicy.ts` owns it; this function
 * fetches, normalizes and hands back both the reading and the verdict.
 *
 * FAILING OPEN IS THE POINT. Every error path returns HTTP 200 with
 * `available: false` rather than a 4xx/5xx. A weather outage must degrade the
 * homepage to its normal unweighted list, never to an error state - the same
 * deliberate fail-open as version-check, for the same reason.
 *
 * Request:  GET (no parameters) - POST is accepted and ignored for symmetry
 *           with the other public functions.
 * Response (always 200):
 *   {
 *     available: boolean,
 *     observedAt: string | null,       // ISO8601 of the forecast period start
 *     temperatureF: number | null,
 *     feelsLikeF: number | null,
 *     precipitationProbabilityPct: number | null,
 *     shortForecast: string | null,
 *     isDaytime: boolean | null,
 *     outdoorFriendly: boolean | null, // null = unknown, NOT false
 *     conditions: string,              // facts only, no ranking claim
 *     reason: string,                  // one sentence, shown to the user
 *     effectiveTemperatureF: number | null,
 *   }
 *
 * Backward-compat: additive only. This is a new endpoint, so no shipped binary
 * calls it; future changes must only add response keys.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { instrument } from "../_shared/instrument.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import {
  apparentTemperatureF,
  assessOutdoorConditions,
  parseWindMph,
  type WeatherReading,
} from "../_shared/weatherPolicy.ts";

/**
 * Downtown Des Moines. A constant, not a parameter: accepting caller-supplied
 * coordinates on a verify_jwt=false function would turn this into an open
 * proxy, and the product only ever asks about one metro.
 */
const DES_MOINES_LAT = 41.5868;
const DES_MOINES_LON = -93.625;

/** NWS asks every client to identify itself with a contact address. */
const NWS_USER_AGENT =
  "DesMoinesInsider/1.0 (https://desmoinesinsider.com; mailto:admin@desmoinesinsider.com)";

const NWS_POINTS_URL =
  `https://api.weather.gov/points/${DES_MOINES_LAT},${DES_MOINES_LON}`;

/** Weather does not move fast enough to justify a fetch per pageview. */
const FORECAST_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** The grid point for a fixed coordinate effectively never changes. */
const GRID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const UPSTREAM_TIMEOUT_MS = 8_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Module-scope memo. Edge instances are recycled, so this is a best-effort
 * warm cache rather than a guarantee; the Cache-Control header below is what
 * actually spares the upstream on a traffic spike.
 */
let gridCache: CacheEntry<string> | null = null;
let forecastCache: CacheEntry<WeatherPayload> | null = null;

interface WeatherPayload extends WeatherReading {
  available: boolean;
  observedAt: string | null;
  outdoorFriendly: boolean | null;
  /** Facts only, no ranking claim - for surfaces that display but do not sort. */
  conditions: string;
  reason: string;
  effectiveTemperatureF: number | null;
}

const UNAVAILABLE: WeatherPayload = {
  available: false,
  observedAt: null,
  temperatureF: null,
  feelsLikeF: null,
  precipitationProbabilityPct: null,
  shortForecast: null,
  isDaytime: null,
  outdoorFriendly: null,
  conditions: "Weather is unavailable right now",
  reason: "Weather is unavailable right now.",
  effectiveTemperatureF: null,
};

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && entry.expiresAt > Date.now();
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent": NWS_USER_AGENT,
          // NWS versions its payloads through this Accept type.
          Accept: "application/geo+json",
        },
      },
      UPSTREAM_TIMEOUT_MS,
    );
    if (!response.ok) {
      console.error(`weather: upstream ${url} returned ${response.status}`);
      return null;
    }
    return await response.json() as Record<string, unknown>;
  } catch (error) {
    console.error(`weather: upstream ${url} failed`, error);
    return null;
  }
}

/**
 * Resolve the hourly-forecast URL for the fixed coordinate. NWS makes this a
 * two-hop lookup: /points returns the grid office and cell, and the cell has
 * its own forecast URL.
 */
async function resolveHourlyForecastUrl(): Promise<string | null> {
  if (isFresh(gridCache)) return gridCache.value;

  const points = await fetchJson(NWS_POINTS_URL);
  const properties = points?.properties as Record<string, unknown> | undefined;
  const hourly = properties?.forecastHourly;
  if (typeof hourly !== "string" || hourly.length === 0) {
    console.error("weather: /points response carried no forecastHourly URL");
    return null;
  }
  gridCache = { value: hourly, expiresAt: Date.now() + GRID_TTL_MS };
  return hourly;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Convert an NWS temperature to Fahrenheit. The hourly endpoint returns F for
 * US grid points, but the unit is part of the payload and assuming it would be
 * the kind of silent wrongness that only shows up as absurd advice.
 */
function toFahrenheit(value: unknown, unit: unknown): number | null {
  const numeric = toNumberOrNull(value);
  if (numeric === null) return null;
  if (unit === "C") return (numeric * 9) / 5 + 32;
  return numeric;
}

async function loadWeather(): Promise<WeatherPayload> {
  if (isFresh(forecastCache)) return forecastCache.value;

  const forecastUrl = await resolveHourlyForecastUrl();
  if (!forecastUrl) return UNAVAILABLE;

  const forecast = await fetchJson(forecastUrl);
  const properties = forecast?.properties as Record<string, unknown> | undefined;
  const periods = properties?.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    console.error("weather: hourly forecast carried no periods");
    return UNAVAILABLE;
  }

  // The first hourly period is the closest thing NWS publishes to "now".
  const current = periods[0] as Record<string, unknown>;
  const precipContainer = current.probabilityOfPrecipitation as
    | Record<string, unknown>
    | undefined;

  const humidityContainer = current.relativeHumidity as Record<string, unknown> | undefined;
  const temperatureF = toFahrenheit(current.temperature, current.temperatureUnit);

  // NWS does NOT publish `apparentTemperature` on hourly forecast periods -
  // verified against gridpoints/DMX/73,49 - but it does publish temperature,
  // relativeHumidity and windSpeed. Deriving feels-like from those costs no
  // extra request and is the difference between calling a 93F/52% afternoon
  // (heat index 102F) a nice day and correctly steering indoors.
  const reading: WeatherReading = {
    temperatureF,
    feelsLikeF: apparentTemperatureF(
      temperatureF,
      toNumberOrNull(humidityContainer?.value),
      parseWindMph(current.windSpeed),
    ),
    precipitationProbabilityPct: toNumberOrNull(precipContainer?.value),
    shortForecast: typeof current.shortForecast === "string" ? current.shortForecast : null,
    isDaytime: typeof current.isDaytime === "boolean" ? current.isDaytime : null,
  };

  const assessment = assessOutdoorConditions(reading);
  const payload: WeatherPayload = {
    available: true,
    observedAt: typeof current.startTime === "string" ? current.startTime : null,
    ...reading,
    outdoorFriendly: assessment.outdoorFriendly,
    conditions: assessment.conditions,
    reason: assessment.reason,
    effectiveTemperatureF: assessment.effectiveTemperatureF,
  };

  forecastCache = { value: payload, expiresAt: Date.now() + FORECAST_TTL_MS };
  return payload;
}

serve(instrument("weather", async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin") ?? undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Generous, because this is one call per pageview at most and the answer is
  // cached; the limit exists to stop a single client hammering NWS through us.
  const rateLimit = checkRateLimit(req, {
    endpoint: "weather",
    windowMs: 60_000,
    max: 120,
    message: "Too many weather requests. Please try again shortly.",
  });
  if (!rateLimit.success && rateLimit.response) {
    const headers = new Headers(rateLimit.response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    return new Response(rateLimit.response.body, {
      status: rateLimit.response.status,
      headers,
    });
  }

  // Never throws past here: loadWeather swallows upstream failure into
  // UNAVAILABLE, and this catch covers anything unforeseen. A weather outage
  // degrades the page, it does not break it.
  let payload: WeatherPayload;
  try {
    payload = await loadWeather();
  } catch (error) {
    console.error("weather: unexpected failure", error);
    payload = UNAVAILABLE;
  }

  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // Let the CDN and the browser absorb the repeat traffic. `stale-while-
      // revalidate` means a cache miss during an upstream blip still serves the
      // last good reading instead of an unavailable one.
      "Cache-Control": payload.available
        ? "public, max-age=900, stale-while-revalidate=1800"
        : "public, max-age=60",
    },
  });
  return addRateLimitHeaders(response, rateLimit);
}));
