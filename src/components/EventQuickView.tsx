import { Link } from "react-router-dom";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { isCapacitor, nativeShare, openExternalUrl } from "@/lib/capacitorUtils";
import { getDirectionsUrl } from "@/lib/directions";
import { handleError } from "@/lib/errorHandler";
import { isFreePrice } from "@/lib/eventPrice";
import {
  createEventSlugWithCentralTime,
  formatEventDate,
  hasSpecificTime,
} from "@/lib/timezone";
import type { Event } from "@/lib/types";

// The Home page event quick view (WP0 moved it out of Index.tsx, WP6 of
// docs/page-plans/home.md fixed it).
//
// Time. The old local formatter ran new Date(event.date) through date-fns in
// the READER'S zone and printed the 19:31:58 no-time marker as "7:31 PM".
// formatEventDate formats in Central and drops the time when the row has none
// (time_tbd or the marker), so a Los Angeles reader sees the card's clock time.
//
// Phone. Below sm the dialog is a bottom sheet: the body scrolls and View
// details / Save / Share sit in a footer that never scrolls away.

export interface EventQuickViewProps {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The Central-time date line, with "CT" when a clock time is shown. */
function eventWhen(event: Event): string {
  const formatted = formatEventDate(event);
  return hasSpecificTime(event) && formatted.includes(" at ")
    ? `${formatted} CT`
    : formatted;
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Share feedback renders INSIDE the dialog. A toast would not do: the toaster
 * sits outside the modal, which Radix marks aria-hidden and makes inert while
 * the dialog is open, so a link in a toast could be seen but not selected, and
 * a screen reader heard nothing.
 */
type ShareStatus = { kind: "idle" } | { kind: "copied" } | { kind: "manual"; url: string };

export function EventQuickView({ event, open, onOpenChange }: EventQuickViewProps) {
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ kind: "idle" });
  const manualInputRef = useRef<HTMLInputElement>(null);

  // A different event, or reopening, starts with no stale share message.
  useEffect(() => {
    setShareStatus({ kind: "idle" });
  }, [event?.id, open]);

  useEffect(() => {
    if (shareStatus.kind === "manual") manualInputRef.current?.select();
  }, [shareStatus]);

  const showCopyFallback = (url: string) => setShareStatus({ kind: "manual", url });

  const handleShareEvent = async (target: Event) => {
    const shareUrl = `${window.location.origin}/events/${createEventSlugWithCentralTime(target.title, target)}`;
    const place = target.venue || target.location;
    const shareData = {
      title: target.title,
      text: [target.title, eventWhen(target), place].filter(Boolean).join(" - "),
      url: shareUrl,
    };

    try {
      // canShare is missing from Firefox desktop and older Safari; calling it
      // unguarded threw a TypeError before any fallback ran.
      const webShareOk =
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare(shareData));

      if (isCapacitor() || webShareOk) {
        // nativeShare returns false on any failure, including a cancel, so a
        // cancelled sheet falls through to the clipboard copy below.
        if (await nativeShare(shareData)) return;
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareStatus({ kind: "copied" });
          return;
        } catch {
          // Permission denied or insecure context: show the link instead.
        }
      }
      showCopyFallback(shareUrl);
    } catch (error) {
      handleError(error, { component: "EventQuickView", action: "share" });
      showCopyFallback(shareUrl);
    }
  };

  if (!event) return null;

  const when = eventWhen(event);
  const free = isFreePrice(event.price) === true;
  const showVenue = Boolean(event.venue) && !sameText(event.venue, event.location);
  const hasCoords = event.latitude != null && event.longitude != null;
  const directionsUrl =
    hasCoords || event.location || event.venue
      ? getDirectionsUrl({
          latitude: event.latitude,
          longitude: event.longitude,
          address: [event.venue, event.location].filter(Boolean).join(", "),
        })
      : null;
  const detailsHref = `/events/${createEventSlugWithCentralTime(event.title, event)}`;
  const description = event.enhanced_description || event.original_description;
  const srSummary = [
    when,
    event.venue || event.location,
    free ? "Free" : event.price ? `Price: ${event.price}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  const openDirections = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!directionsUrl) return;
    e.preventDefault();
    openExternalUrl(directionsUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-quick-view=""
        className={[
          "flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0",
          // Bottom sheet below sm.
          "max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none",
          "max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0",
          "max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-bottom-full",
          "max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-bottom-full",
          "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100",
        ].join(" ")}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-12 text-xl font-bold leading-snug sm:text-2xl">
              {event.title}
            </DialogTitle>
            <DialogDescription className="sr-only">{srSummary}</DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {event.image_url && (
              <div className="overflow-hidden rounded-lg">
                {/* WEB-PERF-037. OptimizedImage renders its own "Image
                    unavailable" panel in the same box when the load fails. */}
                <OptimizedImage
                  src={event.image_url}
                  alt={event.title}
                  className="object-cover"
                  containerClassName="w-full h-40 sm:h-64"
                  sizes="(max-width: 640px) 100vw, 512px"
                />
              </div>
            )}

            <dl className="space-y-2 text-sm sm:text-base">
              <div className="flex items-start gap-2">
                <dt className="sr-only">When</dt>
                <SpriteIcon name="calendar" className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <dd data-quick-view-when="">{when}</dd>
              </div>
              {(event.location || showVenue) && (
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Where</dt>
                  <SpriteIcon name="map-pin" className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <dd>
                    {showVenue && <span className="block font-medium">{event.venue}</span>}
                    {event.location && (
                      <span className={showVenue ? "text-muted-foreground" : undefined}>
                        {event.location}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {event.price && (
                <div className="flex items-start gap-2">
                  <dt className="sr-only">Price</dt>
                  <SpriteIcon name="ticket" className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <dd>
                    {free ? (
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-sm font-semibold text-secondary-foreground">
                        Free
                      </span>
                    ) : (
                      event.price
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {description && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">About this event</h3>
                <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground sm:line-clamp-none">
                  {description}
                </p>
                {event.is_enhanced && (
                  <p className="mt-2 flex items-center text-xs text-muted-foreground">
                    <SpriteIcon name="sparkles" className="mr-1 h-3 w-3" />
                    Enhanced with AI
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {directionsUrl && (
                <Button asChild variant="outline" className="min-h-11 w-full">
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={openDirections}
                  >
                    <SpriteIcon name="map-pin" className="mr-2 h-4 w-4" />
                    Directions
                  </a>
                </Button>
              )}

              {/* WEB-FEAT-026: Google, Outlook or Apple calendar. */}
              <AddToCalendarButton event={event} variant="outline" fullWidth />

              {event.source_url && (
                <Button
                  variant="outline"
                  className="min-h-11 w-full sm:col-span-2"
                  onClick={() => openExternalUrl(event.source_url!)}
                >
                  <SpriteIcon name="external-link" className="mr-2 h-4 w-4" />
                  Event website
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t bg-background p-4 sm:px-6">
          <Button asChild className="min-h-11 w-full">
            <Link to={detailsHref} onClick={() => onOpenChange(false)}>
              View details
              <SpriteIcon name="arrow-right" className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <FavoriteButton
              eventId={event.id}
              size="default"
              variant="outline"
              className="min-h-11 w-full"
              itemName={event.title}
              showText
            />

            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => handleShareEvent(event)}
            >
              <SpriteIcon name="share-2" className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>

          <div role="status" aria-live="polite">
            {shareStatus.kind === "copied" && (
              <p className="text-sm text-muted-foreground">Link copied to your clipboard.</p>
            )}
            {shareStatus.kind === "manual" && (
              <div className="space-y-1">
                <label htmlFor="quick-view-share-url" className="text-sm font-medium">
                  Copy this link to share
                </label>
                <input
                  id="quick-view-share-url"
                  ref={manualInputRef}
                  readOnly
                  value={shareStatus.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
