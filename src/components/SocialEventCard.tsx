import React from 'react';
import { OptimizedImage } from '@/components/OptimizedImage';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AddToCalendarButton } from '@/components/AddToCalendarButton';
import ShareDialog from '@/components/ShareDialog';
import { useEventSocial } from '@/hooks/useEventSocial';
import { BatchEventSocialData } from '@/hooks/useBatchEventSocial';
import { Event } from '@/lib/types';
import { SpriteIcon } from '@/components/ui/SpriteIcon';
import { createEventSlugWithCentralTime, formatInCentralTime } from '@/lib/timezone';
import {
  eventRunLabel,
  eventStart,
  eventTimeLabel,
  eventTiming,
  isRunningFromEarlierDay,
} from '@/lib/eventTiming';
import { formatNearMeDistance } from '@/lib/nearMeOrigins';
import { isPrerender } from '@/lib/isPrerender';
import { Link } from 'react-router-dom';
import { getEventCategoryStyle, STATUS_BADGE } from '@/lib/categoryStyles';
import { SponsoredBadge } from '@/components/SponsoredBadge';
import { isSponsoredActive, logSponsoredClick } from '@/lib/sponsored';
import { useSponsoredImpression } from '@/hooks/useSponsoredImpression';
import { useRef, useState } from 'react';
import { isFreePrice } from '@/lib/eventPrice';
import { EVENT_AREAS, isInBBox } from '@/lib/eventAreas';

const METERS_TO_MILES = 0.000621371;

interface SocialEventCardProps {
  event: Event;
  onViewDetails: (event: Event) => void;
  onViewSocial?: (eventId: string) => void;
  showSocialPreview?: boolean;
  socialData?: BatchEventSocialData;
  /**
   * True while the parent's batch social query is still in flight. Without it
   * this card cannot tell "the batch has not arrived yet" from "the batch has
   * nothing for this event", so on first render it falls back to its own
   * per-event fetch — and every card in the list does the same. Measured on
   * /events: 40 cards produced 113 REST requests (34 each to event_attendees,
   * event_discussions and event_live_stats) despite the batch hook being
   * wired up correctly (WEB-PERF-024).
   */
  socialDataPending?: boolean;
  /**
   * True for the cards above the fold on first paint. The image then loads
   * eagerly at high fetch priority instead of lazily.
   *
   * WEB-PERF-040. This card renders every event listing on the site - /events,
   * /events/today, /events/free, /events/kids, /events/date-night,
   * /events/this-weekend, /events/in/:location - and its image was
   * unconditionally loading="lazy" with no way to opt out. The LCP element on
   * every one of those pages was therefore lazily loaded, which is the one
   * thing Chrome's own guidance says not to do: the browser will not start the
   * fetch until layout has run, so the largest paint waits on work that has
   * already finished for every other element.
   */
  priority?: boolean;
  /**
   * Where the distance badge measures from, when it isn't the viewer: near
   * me's picked origin ("1.2 mi from Downtown"). Omitted, it reads "away".
   */
  distanceOriginLabel?: string;
  featured?: boolean;
  /**
   * Optional lead line such as "Starts in 40 min" or "Happening now", for the
   * hub's Tonight strip (docs/page-plans/events.md WP3 item 3). Printed above
   * the time line; the card computes nothing from it.
   */
  relativeStart?: string;
  /**
   * The title's heading level. 3 by default; a list that nests cards under
   * day headings (h3) passes 4 so the outline doesn't skip or flatten
   * (events-pass2 WP2 item 6).
   */
  headingLevel?: 3 | 4;
}

type CardEvent = Event & { distance_meters?: number | null };

/**
 * The district a card names after the venue: a bbox area from eventAreas.ts
 * when the coordinates fall inside one, else the suburb when it isn't Des
 * Moines, else nothing.
 */
function placeLabel(event: CardEvent): string | null {
  const district = EVENT_AREAS.find(
    (area) => area.kind === 'bbox' && isInBBox(event.latitude, event.longitude, area.bbox),
  );
  if (district) return district.label;
  const city = event.city?.trim();
  if (city && city.toLowerCase() !== 'des moines') return city;
  return null;
}

/**
 * The card's one time line. A run under way ("Runs through Sun, Sep 27") and a
 * time range ("7:00 - 10:00 PM CT") replace the start time; a multi-day run
 * that hasn't started keeps it and adds the dates ("10:00 AM CT, Sep 22 -
 * Sep 27").
 */
function leadTimeWords(timeLabel: string, runLabel: string | null): string {
  if (!runLabel) return timeLabel;
  if (runLabel.startsWith('Runs through') || runLabel.endsWith(' CT')) return runLabel;
  return `${timeLabel}, ${runLabel}`;
}

function SocialEventCardComponent({
  event,
  showSocialPreview = true,
  socialData,
  socialDataPending = false,
  featured = false,
  priority = false,
  distanceOriginLabel,
  relativeStart,
  headingLevel = 3,
}: SocialEventCardProps) {
  // Passing '' disables the hook (it early-returns on a falsy id). Skip the
  // individual fetch both when batch data has arrived AND while it is pending.
  const individualFetch = useEventSocial(socialData || socialDataPending ? '' : event.id);

  const liveStats = socialData ? socialData.liveStats : individualFetch.liveStats;
  const attendeeCount =
    (socialData ? socialData.attendeeCount : individualFetch.attendees.length) ||
    liveStats?.current_attendees ||
    0;

  // WEB-PERF-023. The imageless panel below used to render on EVERY card and be
  // hidden with a class, because the img's onError reached for its next sibling
  // and needed it already in the DOM. Measured in the built HTML, that was six
  // wasted elements on 31 of 33 cards on /events. React state does the same job
  // with nothing rendered until it is needed, and it also stops the error
  // handler baking inline styles into prerendered HTML that hydration will not
  // clean up.
  const [imageFailed, setImageFailed] = useState(false);
  // Held in a const so the truthiness check below NARROWS it. `Boolean(x)`
  // tells TypeScript nothing about x at the JSX, which is why
  // OptimizedImage's `src: string` was being handed `string | undefined`.
  const imageUrl = event.image_url;
  const showImage = !imageFailed && Boolean(imageUrl);

  const categoryStyle = getEventCategoryStyle(event.category);

  // One clock per render. The card is memoised, so this re-reads whenever the
  // list re-renders, which is often enough for "is it on now".
  const now = new Date();
  const timing = eventTiming(event, now);
  // Day 2 of a festival sits under today's header; its badge says today too
  // (events-pass2 WP2 item 5). Not in prerendered HTML, where "today" would be
  // frozen at build time: the static card keeps the start date.
  const runningFromEarlierDay = !isPrerender() && isRunningFromEarlierDay(event, now);

  const getDateParts = () => {
    const start = eventStart(event);
    if (!start) return { month: 'TBA', day: '--', weekday: '' };
    const badgeDate = runningFromEarlierDay ? now : start;
    return {
      month: formatInCentralTime(badgeDate, 'MMM').toUpperCase(),
      day: formatInCentralTime(badgeDate, 'd'),
      weekday: formatInCentralTime(badgeDate, 'EEE'),
    };
  };

  // The lead time words come from eventTiming.ts, the same helper detail and
  // the map use (events-pass2 WP2 item 1). An unknown time says so; "All day"
  // is only for a row whose end_date runs past its start day.
  const timeLabel = eventTimeLabel(event);
  const runLabel = eventRunLabel(event, now);
  const leadTime = leadTimeWords(timeLabel, runLabel);

  const dateParts = getDateParts();
  const Heading = headingLevel === 4 ? 'h4' : 'h3';
  const eventSlug = createEventSlugWithCentralTime(event.title, event);
  const eventUrl = `/events/${eventSlug}`;

  // Unknown price is unknown, not free (WP3 item 1). A row with no price used
  // to get the green Free badge here and in the hub's filter.
  const free = isFreePrice(event.price);
  // LIVE means now (events-pass2 WP2 item 4). total_checkins is all-time, so a
  // check-in alone put LIVE on next week's show.
  const checkins = liveStats?.total_checkins ?? 0;
  const isLive = checkins > 0 && timing.isHappeningNow;
  const cardEvent = event as CardEvent;
  const distanceMeters = cardEvent.distance_meters;
  const venueName = event.venue || event.location;
  const place = placeLabel(cardEvent);

  // Sponsored listing (WEB-FEAT-005): active only while not expired.
  const sponsoredActive = isSponsoredActive(event);
  const cardRef = useRef<HTMLDivElement>(null);

  // Mirrors the four conditions inside the stack below. Kept adjacent to them
  // so a fifth badge cannot be added without this going false for it.
  const hasTopRightBadge = Boolean(
    sponsoredActive || isLive || (!sponsoredActive && event.is_featured) || distanceMeters != null,
  );
  useSponsoredImpression(cardRef, 'event', event.id, sponsoredActive);

  // STRETCHED LINK (WP3 item 2). The whole card used to be one <a> with the
  // Favorite, Calendar and Share buttons inside it, which is nested
  // interactive content, and an aria-label that replaced everything the card
  // says. Now the link is the title; its ::after covers the card so the whole
  // surface still clicks through, and the buttons sit above it (z-20) as
  // siblings. Decorative overlays are pointer-events-none so they don't eat
  // clicks meant for the link underneath. `isolate` keeps those z-indexes
  // inside the card; without it the z-20 buttons painted over the hub's
  // sticky z-20 day headers as the list scrolled under them.
  return (
    <Card
      ref={cardRef}
      className={`group relative isolate overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card ${
        featured ? 'md:col-span-2 md:row-span-2' : ''
      } ${sponsoredActive ? 'ring-2 ring-amber-400' : ''}`}
    >
      <CardContent className="p-0">
        {/* Image Section with Overlay */}
        <div className={`relative overflow-hidden ${featured ? 'h-64 md:h-80' : 'h-52'}`}>
          {showImage && imageUrl ? (
            // Converted to OptimizedImage in WEB-PERF-041 once the component
            // stopped gating the img element on an IntersectionObserver. The
            // element always renders and only the fetch is deferred.
            //
            // onError drives the designed category fallback below rather than
            // OptimizedImage's own "Image unavailable" panel.
            <OptimizedImage
              src={imageUrl}
              // Decorative: the title link names the event (events-pass2 WP2
              // item 6), and repeating it here made screen readers say it twice.
              alt=""
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              containerClassName="w-full h-full"
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              onError={() => setImageFailed(true)}
            />
          ) : null}
          {/* Designed fallback when the event has no image (WEB-QA-006): a
              category-tinted panel with a dot texture and the category set as
              type, so an imageless card looks intentional. */}
          {!showImage && (
            <div
              className={`relative w-full h-full overflow-hidden items-center justify-center flex-col gap-3 flex ${categoryStyle.icon}`}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                }}
              />
              <div className={`relative rounded-2xl px-3 py-3 ${categoryStyle.bg} shadow-sm`}>
                <SpriteIcon name="calendar" className="h-7 w-7 text-white" />
              </div>
              <span className={`relative text-sm font-semibold ${categoryStyle.text}`}>
                {event.category}
              </span>
            </div>
          )}

          {/* Bottom scrim so the badges stay readable over any poster */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {/* Date Badge - Calendar Style */}
          <div className="pointer-events-none absolute top-3 left-3 z-10 bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden text-center w-14">
            <div className={`${categoryStyle.bg} text-white text-[10px] font-bold py-0.5 tracking-wider`}>
              {dateParts.month}
            </div>
            <div className="py-1">
              <div className="text-xl font-bold leading-none text-foreground">{dateParts.day}</div>
              <div className="text-[10px] text-muted-foreground">{dateParts.weekday}</div>
            </div>
          </div>

          {/* Top Right Badges, rendered only when one applies. */}
          {hasTopRightBadge && (
            <div className="pointer-events-none absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
              {sponsoredActive && <SponsoredBadge className="shadow-lg" />}
              {isLive && (
                <Badge className="bg-green-700 text-white border-0 shadow-lg text-[10px] px-2">
                  <SpriteIcon name="trending-up" className="h-3 w-3 mr-1" />
                  LIVE
                </Badge>
              )}
              {!sponsoredActive && event.is_featured && (
                <Badge className={`${STATUS_BADGE.featured} border-0 shadow-lg text-[10px] px-2`}>
                  <SpriteIcon name="sparkles" className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              {distanceMeters != null ? (
                <Badge className="bg-white/90 text-slate-800 border-0 shadow-lg text-[10px] px-2">
                  <SpriteIcon name="map-pin" className="h-3 w-3 mr-1" />
                  {formatNearMeDistance(distanceMeters * METERS_TO_MILES, distanceOriginLabel)}
                </Badge>
              ) : null}
            </div>
          )}

          {/* Category and price over the poster */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-4 z-10">
            <div className="flex items-center gap-2">
              <Badge className={`${categoryStyle.bg} text-white border-0 text-[11px] font-medium`}>
                {event.category}
              </Badge>
              {free === true ? (
                <Badge className={`${STATUS_BADGE.free} border-0 text-[11px] font-medium`}>Free</Badge>
              ) : free === false ? (
                <Badge className="bg-black/60 text-white border-0 text-[11px]">
                  <SpriteIcon name="ticket" className="h-3 w-3 mr-1" />
                  {event.price}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4 space-y-2">
          {relativeStart && (
            <p className="text-sm font-semibold text-foreground">{relativeStart}</p>
          )}

          {/* Time and place first, the way a local reads a listing:
              "7:30 PM CT - Wooly's - East Village" (WP3 item 3). */}
          <p className="flex min-w-0 items-center text-sm text-muted-foreground">
            <SpriteIcon name="clock" className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
            <span className="flex-shrink-0 font-medium text-foreground">{leadTime}</span>
            {venueName && (
              <>
                <span aria-hidden="true" className="mx-1.5 flex-shrink-0">&middot;</span>
                <span className="truncate">{venueName}</span>
              </>
            )}
            {place && (
              <>
                <span aria-hidden="true" className="mx-1.5 flex-shrink-0">&middot;</span>
                <span className="flex-shrink-0">{place}</span>
              </>
            )}
          </p>

          <Heading className="text-lg font-bold leading-tight text-foreground line-clamp-2">
            <Link
              to={eventUrl}
              data-testid="event-card-link"
              className="rounded-sm after:absolute after:inset-0 after:z-[1] after:rounded-xl after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2"
              onClick={() => {
                if (sponsoredActive) logSponsoredClick('event', event.id);
              }}
            >
              {sponsoredActive && <span className="sr-only">Sponsored: </span>}
              {event.title}
            </Link>
          </Heading>

          {/* Description Preview */}
          {(event.enhanced_description || event.original_description) && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {event.enhanced_description || event.original_description}
            </p>
          )}

          {/* Social Proof Bar */}
          {showSocialPreview && (attendeeCount > 0 || checkins > 0) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
              {attendeeCount > 0 && (
                <div className="flex items-center gap-1">
                  <SpriteIcon name="users" className="h-3.5 w-3.5" />
                  <span className="font-medium">{attendeeCount}</span>
                  <span>interested</span>
                </div>
              )}
              {checkins > 0 && (
                <div className="flex items-center gap-1">
                  {isLive && <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-green-600" />}
                  <span>{checkins} checked in</span>
                </div>
              )}
            </div>
          )}

          {/* Actions sit above the stretched link, outside it. */}
          <div className="relative z-20 flex items-center justify-end gap-1 pt-1">
            <FavoriteButton eventId={event.id} itemName={event.title} variant="ghost" size="icon" />
            <AddToCalendarButton event={event} variant="ghost" iconOnly />
            <ShareDialog
              title={event.title}
              description={
                event.enhanced_description ||
                event.original_description ||
                `Check out ${event.title} in Des Moines`
              }
              url={`${window.location.origin}${eventUrl}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const SocialEventCard = React.memo(SocialEventCardComponent);
