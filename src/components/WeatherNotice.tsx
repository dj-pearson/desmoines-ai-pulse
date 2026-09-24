/**
 * The visible half of weather-aware ranking (WEB-FEAT-022).
 *
 * The acceptance criteria require the reorder to be explained rather than
 * silent: a list that quietly rearranges itself is indistinguishable from a
 * buggy sort. This renders one line saying what the weather is and what the
 * page did about it.
 *
 * It renders NOTHING when there is no verdict. An unknown forecast must not
 * produce a banner apologising for itself at the top of the page.
 */
import { CloudRain, Snowflake, Sun, Thermometer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWeather, type WeatherSnapshot } from '@/hooks/useWeather';

interface WeatherNoticeProps {
  weather: WeatherSnapshot;
  /** Gate from useWeather(). False renders nothing. */
  hasVerdict: boolean;
  className?: string;
}

function noticeIcon(weather: WeatherSnapshot) {
  const wet =
    typeof weather.precipitationProbabilityPct === 'number' &&
    weather.precipitationProbabilityPct >= 50;
  if (wet) return CloudRain;

  const temp = weather.effectiveTemperatureF;
  if (typeof temp === 'number' && temp < 20) return Snowflake;
  if (typeof temp === 'number' && temp > 95) return Thermometer;
  return Sun;
}

export function WeatherNotice({ weather, hasVerdict, className }: WeatherNoticeProps) {
  if (!hasVerdict) return null;

  const Icon = noticeIcon(weather);

  // The reason sentence from the edge function is already self-contained - it
  // names the temperature or the precipitation chance that drove the decision.
  // Prefixing it with a temperature readout just said the same number twice.
  return (
    // One elevation cue, not two: a surface fill and no border, per the card
    // rules in CLAUDE.md. No left accent bar.
    <div
      className={`flex items-start gap-3 rounded-xl bg-muted px-4 py-3 ${className ?? ''}`}
      // Not a live region: this is present on first paint, and announcing a
      // weather line every time the query refetches would interrupt a screen
      // reader mid-sentence for no new information.
      role="note"
      aria-label="Weather and how it affects the order of this list"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-muted-foreground">{weather.reason}</p>
    </div>
  );
}

export default WeatherNotice;

/**
 * The For You rail's weather slot (Home plan WP2 items 6 and 10).
 *
 * It replaced HomeWeatherNotice, which sat in the page flow and rendered
 * nothing until the forecast landed, so a late weather call inserted a 48px block above the rail
 * and pushed everything below it down. This version lives in the rail header
 * in a slot whose height never changes: while the forecast is loading, or when
 * it has no verdict, the slot is simply empty. A late or failed call changes
 * text, not layout.
 *
 * It states the temperature when the edge function returned one, then links to
 * /events/today, which is already ranked for the current conditions.
 */
export function RailWeatherLine({ className }: { className?: string }) {
  const { weather, hasVerdict } = useWeather();
  const Icon = hasVerdict ? noticeIcon(weather) : null;
  const temp =
    typeof weather.temperatureF === 'number' ? Math.round(weather.temperatureF) : null;

  return (
    <p
      className={`flex h-6 min-w-0 items-center gap-2 text-sm text-muted-foreground ${className ?? ''}`}
      data-rail-weather-line=""
    >
      {hasVerdict && Icon ? (
        <>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {temp !== null ? <>{temp}&deg;F, </> : null}
            {weather.conditions}.{' '}
            <Link
              to="/events/today"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {weather.outdoorFriendly ? 'Outside today' : 'Indoor picks today'}
            </Link>
          </span>
        </>
      ) : null}
    </p>
  );
}
