import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { applyEventVisibility } from "@/lib/eventQuery";
import { eventTimeLabel, isEventOver } from "@/lib/eventTiming";
import { handleError } from "@/lib/errorHandler";
import {
  buildSlides,
  MAX_EVENT_SLIDES,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  slideFileName,
  wrapText,
  type Slide,
  type SlideshowEvent,
} from "@/lib/slideshow";
import { centralWindow } from "@/lib/timezone";

const NAVY = "#071e64";
const RED = "#c40e32";
const INK = "#0b1530";
const SUBTLE = "#3d4a6b";
const PAPER = "#ffffff";
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PAD = 88;

const COLUMNS =
  "id, title, date, event_start_utc, event_start_local, end_date, time_tbd, source_url, venue, location, price, image_url, category, is_featured, popularity_score";

type Row = SlideshowEvent & { is_featured?: boolean | null; popularity_score?: number | null };

/** Today's events in Central time that are not over, soonest first. */
function useTonightEvents() {
  return useQuery({
    queryKey: ["admin-slideshow-tonight"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Row[]> => {
      const now = new Date();
      const w = centralWindow("today", now);
      const { data, error } = await applyEventVisibility(
        supabase.from("events").select(COLUMNS).gte("date", w.start).lte("date", w.end),
      )
        .order("date", { ascending: true })
        .limit(150);
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).filter((e) => !isEventOver(e, now));
    },
  });
}

/** Six by default: featured first, then the most popular, kept in time order. */
function defaultPick(rows: Row[]): string[] {
  const ranked = [...rows].sort(
    (a, b) =>
      Number(!!b.is_featured) - Number(!!a.is_featured) ||
      Number(!!b.image_url) - Number(!!a.image_url) ||
      (b.popularity_score ?? 0) - (a.popularity_score ?? 0),
  );
  const ids = new Set(ranked.slice(0, MAX_EVENT_SLIDES).map((r) => r.id));
  return rows.filter((r) => ids.has(r.id)).map((r) => r.id);
}

/**
 * Load an image for drawing. crossOrigin="anonymous" or the canvas becomes
 * "tainted" and refuses to export a PNG. Hosts that do not send CORS headers
 * fail here, and the slide is drawn without a photo instead of failing to
 * download.
 */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number): number {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, color: string) {
  ctx.font = `700 44px ${FONT}`;
  const w = ctx.measureText(text).width + 64;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 84, 42);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 32, y + 44);
  ctx.textBaseline = "alphabetic";
}

function brandFooter(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("Des Moines Insider", PAD, SLIDE_HEIGHT - PAD);
}

/** Draw one slide. Pure apart from the canvas: same slide, same pixels. */
function renderSlide(canvas: HTMLCanvasElement, slide: Slide, img: HTMLImageElement | null) {
  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const maxW = SLIDE_WIDTH - PAD * 2;
  const measure = (s: string) => ctx.measureText(s).width;

  if (slide.kind === "cover" || slide.kind === "outro") {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    ctx.fillStyle = RED;
    ctx.fillRect(PAD, 520, 160, 16);
    ctx.fillStyle = PAPER;
    ctx.font = `800 132px ${FONT}`;
    let y = drawLines(ctx, wrapText(slide.heading, maxW, 3, measure), PAD, 720, 148);
    ctx.font = `500 60px ${FONT}`;
    if (slide.kind === "cover") {
      y = drawLines(ctx, [slide.dateLine], PAD, y + 60, 72);
      pill(ctx, slide.countLine, PAD, y + 40, RED, PAPER);
    } else {
      drawLines(ctx, wrapText(slide.urlLine, maxW, 2, measure), PAD, y + 60, 72);
    }
    brandFooter(ctx, PAPER);
    return;
  }

  // Event slide: photo on top, words on paper below.
  const photoH = 1060;
  if (img) {
    drawCover(ctx, img, 0, 0, SLIDE_WIDTH, photoH);
  } else {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, SLIDE_WIDTH, photoH);
    if (slide.category) {
      ctx.fillStyle = PAPER;
      ctx.font = `800 120px ${FONT}`;
      drawLines(ctx, wrapText(slide.category, maxW, 2, measure), PAD, photoH / 2, 136);
    }
  }
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, photoH, SLIDE_WIDTH, SLIDE_HEIGHT - photoH);

  ctx.fillStyle = RED;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(`${slide.index} of ${slide.total}`, PAD, photoH + 96);

  ctx.fillStyle = INK;
  ctx.font = `800 80px ${FONT}`;
  let y = drawLines(ctx, wrapText(slide.title, maxW, 3, measure), PAD, photoH + 196, 92);

  ctx.fillStyle = NAVY;
  ctx.font = `700 52px ${FONT}`;
  y = drawLines(ctx, [slide.timeLine], PAD, y + 28, 64);
  if (slide.placeLine) {
    ctx.fillStyle = SUBTLE;
    ctx.font = `500 46px ${FONT}`;
    y = drawLines(ctx, wrapText(slide.placeLine, maxW, 2, measure), PAD, y + 8, 58);
  }
  if (slide.priceLine) {
    pill(ctx, slide.free ? "Free" : slide.priceLine, PAD, Math.min(y + 32, SLIDE_HEIGHT - 260), slide.free ? RED : NAVY, PAPER);
  }
  brandFooter(ctx, NAVY);
}

function downloadCanvas(canvas: HTMLCanvasElement, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Slide could not be encoded"));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve();
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * The daily "Tonight in Des Moines" story (growth roadmap #13). Pick up to six
 * of today's events, see the slides, download them as 1080x1920 PNGs and post
 * them to TikTok, Reels or Shorts as a photo slideshow. Drawn on a canvas in
 * the browser: no server job, no image service, nothing posted for you.
 */
export function SlideshowBuilder() {
  const { data: rows, isLoading, error, refetch } = useTonightEvents();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [images, setImages] = useState<Record<string, HTMLImageElement | null>>({});
  const [busy, setBusy] = useState(false);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const now = useMemo(() => new Date(), []);

  const selected = useMemo(() => {
    if (!rows) return [];
    const ids = picked ?? defaultPick(rows);
    return rows.filter((r) => ids.includes(r.id));
  }, [rows, picked]);

  const slides = useMemo(() => buildSlides(selected, now), [selected, now]);

  // Load photos for the chosen events once each.
  useEffect(() => {
    let cancelled = false;
    for (const e of selected) {
      if (e.id in images) continue;
      void loadImage(e.image_url ?? null).then((img) => {
        if (!cancelled) setImages((m) => ({ ...m, [e.id]: img }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selected, images]);

  // Redraw every slide whenever the pick or a photo changes.
  useEffect(() => {
    slides.forEach((slide, i) => {
      const canvas = canvases.current[i];
      if (!canvas) return;
      const img = slide.kind === "event" ? images[selected[slide.index - 1]?.id] ?? null : null;
      renderSlide(canvas, slide, img);
    });
  }, [slides, images, selected]);

  const toggle = (id: string) => {
    const current = picked ?? (rows ? defaultPick(rows) : []);
    if (current.includes(id)) setPicked(current.filter((x) => x !== id));
    else if (current.length < MAX_EVENT_SLIDES) setPicked([...current, id]);
  };

  const downloadAll = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        const canvas = canvases.current[i];
        if (canvas) await downloadCanvas(canvas, slideFileName(now, i));
        // Browsers drop rapid-fire downloads; a short gap keeps all of them.
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (e) {
      handleError(e, { component: "SlideshowBuilder", action: "downloadAll" });
    } finally {
      setBusy(false);
    }
  };

  const missingPhotos = selected.filter((e) => images[e.id] === null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tonight in Des Moines slideshow</CardTitle>
        <CardDescription>
          Pick up to {MAX_EVENT_SLIDES} of today's events. Download the slides and post them as a photo slideshow on
          TikTok, Instagram Reels or YouTube Shorts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div role="status" aria-label="Loading" className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : error ? (
          <ErrorState compact error={error} title="Today's events didn't load" onRetry={() => void refetch()} />
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing left on today. Try again tomorrow afternoon.</p>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Events ({selected.length} of {MAX_EVENT_SLIDES} picked)
              </legend>
              <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                {rows.map((r) => {
                  const on = selected.some((s) => s.id === r.id);
                  const id = `slide-pick-${r.id}`;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        id={id}
                        checked={on}
                        disabled={!on && selected.length >= MAX_EVENT_SLIDES}
                        onCheckedChange={() => toggle(r.id)}
                      />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="block truncate text-muted-foreground">
                          {eventTimeLabel(r)}
                          {r.venue ? ` - ${r.venue}` : ""}
                        </span>
                      </label>
                      {!r.image_url && <ImageOff className="h-4 w-4 text-muted-foreground" aria-label="No photo" />}
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" className="min-h-11" disabled={busy || selected.length === 0} onClick={downloadAll}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {busy ? "Downloading..." : `Download ${slides.length} slides`}
              </Button>
              {missingPhotos > 0 && (
                <p className="text-sm text-muted-foreground">
                  {missingPhotos} photo{missingPhotos === 1 ? "" : "s"} couldn't be used (the image host blocks it), so
                  {missingPhotos === 1 ? " that slide shows" : " those slides show"} the category instead.
                </p>
              )}
            </div>

            <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-2" aria-label="Slide previews">
              {slides.map((slide, i) => (
                <canvas
                  key={`${slide.kind}-${i}`}
                  ref={(el) => (canvases.current[i] = el)}
                  className="h-80 w-auto shrink-0 rounded-lg border"
                  style={{ aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}` }}
                  role="img"
                  aria-label={
                    slide.kind === "event"
                      ? `Slide ${i + 1}: ${slide.title}, ${slide.timeLine}`
                      : `Slide ${i + 1}: ${slide.heading}`
                  }
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
