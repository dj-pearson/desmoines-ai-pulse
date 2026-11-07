/**
 * "Tonight in Des Moines" slides (growth roadmap #13): the words and order of
 * a 5-8 slide vertical story, separate from the canvas that draws them, so the
 * copy and the line-wrapping are unit-tested.
 *
 * Every line on a slide comes from the event row through the helpers the
 * event pages already use (eventTimeLabel, eventPriceLabel), so a slide never
 * says 7 PM where the page says "Time not listed".
 */
import { BRAND } from "./brandConfig";
import { eventPriceLabel, isFreePrice } from "./eventPrice";
import { eventTimeLabel, type EventTimingInput } from "./eventTiming";
import { formatInCentralTime } from "./timezone";

/** 9:16, the size TikTok, Reels and Shorts all take. */
export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1920;

/** Cover + up to six events + closing slide = at most eight. */
export const MAX_EVENT_SLIDES = 6;

export interface SlideshowEvent extends EventTimingInput {
  id: string;
  title: string;
  venue?: string | null;
  location?: string | null;
  price?: string | null;
  image_url?: string | null;
  category?: string | null;
}

export type Slide =
  | { kind: "cover"; heading: string; dateLine: string; countLine: string }
  | {
      kind: "event";
      index: number;
      total: number;
      title: string;
      timeLine: string;
      placeLine: string | null;
      priceLine: string | null;
      free: boolean;
      imageUrl: string | null;
      category: string | null;
    }
  | { kind: "outro"; heading: string; urlLine: string };

/**
 * Build the slide list. `events` are already chosen and ordered by the admin;
 * anything past MAX_EVENT_SLIDES is dropped rather than squeezed in.
 */
export function buildSlides(events: readonly SlideshowEvent[], now: Date = new Date()): Slide[] {
  const picked = events.slice(0, MAX_EVENT_SLIDES);
  const n = picked.length;
  const slides: Slide[] = [
    {
      kind: "cover",
      heading: "Tonight in Des Moines",
      dateLine: formatInCentralTime(now, "EEEE, MMMM d"),
      countLine: n === 1 ? "1 pick for tonight" : `${n} picks for tonight`,
    },
  ];
  picked.forEach((e, i) => {
    const price = e.price?.trim() ? eventPriceLabel(e.price) : null;
    slides.push({
      kind: "event",
      index: i + 1,
      total: n,
      title: e.title.trim(),
      timeLine: eventTimeLabel(e),
      placeLine: e.venue?.trim() || e.location?.trim() || null,
      priceLine: price,
      free: isFreePrice(e.price) === true,
      imageUrl: e.image_url?.trim() || null,
      category: e.category?.trim() || null,
    });
  });
  slides.push({
    kind: "outro",
    heading: "Everything else on tonight",
    urlLine: `${BRAND.baseUrl.replace(/^https?:\/\//, "")}/events/today`,
  });
  return slides;
}

/**
 * Break text into at most `maxLines` lines no wider than `maxWidth`, adding an
 * ellipsis when it had to cut. `measure` is the canvas's measureText width,
 * injected so this runs in a unit test. A single word wider than the line is
 * cut by character rather than left to overflow the slide.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (s: string) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let cut = false;

  const fitChars = (word: string): string => {
    let w = word;
    while (w.length > 1 && measure(w) > maxWidth) w = w.slice(0, -1);
    return w;
  };

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    if (measure(word) > maxWidth) {
      const head = fitChars(word);
      words.splice(i + 1, 0, word.slice(head.length));
      word = head;
    }
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      cut = true;
      break;
    }
  }
  if (!cut && line) {
    if (lines.length < maxLines) lines.push(line);
    else cut = true;
  }

  if (cut && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}...`) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}...`;
  }
  return lines;
}

/** A file name per slide: tonight-dsm-2026-11-07-01.png. */
export function slideFileName(now: Date, index: number): string {
  return `tonight-dsm-${formatInCentralTime(now, "yyyy-MM-dd")}-${String(index + 1).padStart(2, "0")}.png`;
}
