import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/FavoriteButton';
import ShareDialog from '@/components/ShareDialog';
import { useEventSocial } from '@/hooks/useEventSocial';
import { BatchEventSocialData } from '@/hooks/useBatchEventSocial';
import { Event } from '@/lib/types';
import {
  Users,
  MapPin,
  Calendar,
  Clock,
  TrendingUp,
  Ticket,
  ArrowRight,
  ImageOff,
  Sparkles,
} from 'lucide-react';
import {
  createEventSlugWithCentralTime,
  formatInCentralTime,
  hasSpecificTime,
} from '@/lib/timezone';
import { Link } from 'react-router-dom';
import { getEventCategoryStyle } from '@/lib/categoryStyles';
import { SponsoredBadge } from '@/components/SponsoredBadge';
import { isSponsoredActive, logSponsoredClick } from '@/lib/sponsored';
import { useSponsoredImpression } from '@/hooks/useSponsoredImpression';
import { useRef } from 'react';

interface SocialEventCardProps {
  event: Event;
  onViewDetails: (event: Event) => void;
  onViewSocial?: (eventId: string) => void;
  showSocialPreview?: boolean;
  socialData?: BatchEventSocialData;
  featured?: boolean;
}

function SocialEventCardComponent({
  event,
  onViewDetails,
  onViewSocial,
  showSocialPreview = true,
  socialData,
  featured = false,
}: SocialEventCardProps) {
  const individualFetch = useEventSocial(socialData ? '' : event.id);

  const liveStats = socialData?.liveStats ?? individualFetch.liveStats;
  const attendees = socialData?.attendees ?? individualFetch.attendees;

  const categoryStyle = getEventCategoryStyle(event.category);

  const getDateParts = () => {
    try {
      const dateSource = event.event_start_utc || event.event_start_local || event.date;
      const month = formatInCentralTime(dateSource, 'MMM').toUpperCase();
      const day = formatInCentralTime(dateSource, 'd');
      const weekday = formatInCentralTime(dateSource, 'EEE');
      const showTime = hasSpecificTime(event);
      const time = showTime ? formatInCentralTime(dateSource, 'h:mm a') : null;
      // Always provide an explicit time label — never leave the slot blank.
      const timeLabel = time ? `${time} CT` : 'All day';
      return { month, day, weekday, time, timeLabel };
    } catch {
      return { month: 'TBA', day: '--', weekday: '', time: null, timeLabel: 'Time TBA' };
    }
  };

  const dateParts = getDateParts();
  const eventSlug = createEventSlugWithCentralTime(event.title, event);
  const eventUrl = `/events/${eventSlug}`;

  const isFree = !event.price || event.price.toLowerCase().includes('free') || event.price === '$0';
  const isLive = liveStats && liveStats.total_checkins > 0;
  const attendeeCount = attendees?.length || liveStats?.current_attendees || 0;

  // Sponsored listing (WEB-FEAT-005): active only while not expired.
  const sponsoredActive = isSponsoredActive(event);
  const cardRef = useRef<HTMLDivElement>(null);
  useSponsoredImpression(cardRef, 'event', event.id, sponsoredActive);

  return (
    <Card
      ref={cardRef}
      className={`group relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card ${
        featured ? 'md:col-span-2 md:row-span-2' : ''
      } ${sponsoredActive ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
    >
      <Link
        to={eventUrl}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
        aria-label={`${sponsoredActive ? 'Sponsored: ' : ''}View details for ${event.title}`}
        onClick={() => {
          if (sponsoredActive) logSponsoredClick('event', event.id);
        }}
      >
        <CardContent className="p-0">
          {/* Image Section with Overlay */}
          <div className={`relative overflow-hidden ${featured ? 'h-64 md:h-80' : 'h-52'}`}>
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={`${event.title} - ${event.category} event in ${event.city || 'Des Moines'}, Iowa`}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            {/* Designed fallback when the event has no image (WEB-QA-006).
                Previously a flat grey box with a lone calendar glyph, which read
                as a broken/missing image rather than a deliberate treatment.
                Now it is a category-tinted panel — reusing the same WEB-UX-006
                category tokens the date badge uses — with a soft dot texture and
                the category set as a typographic element, so an imageless card
                looks intentional next to cards that do have art. */}
            <div
              className={`relative w-full h-full overflow-hidden items-center justify-center flex-col gap-3 ${categoryStyle.icon} ${
                event.image_url ? 'hidden' : 'flex'
              }`}
            >
              {/* Subtle dot texture so the panel isn't a flat wash of colour */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    'radial-gradient(currentColor 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                }}
              />
              <div
                className={`relative rounded-2xl px-3 py-3 ${categoryStyle.bg} shadow-sm`}
              >
                <Calendar className="h-7 w-7 text-white" />
              </div>
              <span
                className={`relative text-sm font-semibold uppercase tracking-wider ${categoryStyle.text}`}
              >
                {event.category}
              </span>
            </div>

            {/* Bottom gradient for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Date Badge - Calendar Style */}
            <div className="absolute top-3 left-3 z-10">
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden text-center w-14">
                <div className={`${categoryStyle.bg} text-white text-[10px] font-bold py-0.5 tracking-wider`}>
                  {dateParts.month}
                </div>
                <div className="py-1">
                  <div className="text-xl font-bold leading-none text-foreground">{dateParts.day}</div>
                  <div className="text-[10px] text-muted-foreground">{dateParts.weekday}</div>
                </div>
              </div>
            </div>

            {/* Top Right Badges */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
              {sponsoredActive && <SponsoredBadge className="shadow-lg" />}
              {isLive && (
                <Badge className="bg-green-500 text-white border-0 shadow-lg text-[10px] px-2 animate-pulse">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  LIVE
                </Badge>
              )}
              {!sponsoredActive && event.is_featured && (
                <Badge className="bg-amber-500 text-white border-0 shadow-lg text-[10px] px-2">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              {(event as any).distance_meters && (
                <Badge className="bg-white/90 text-slate-800 border-0 shadow-lg text-[10px] px-2">
                  <MapPin className="h-3 w-3 mr-1" />
                  {((event as any).distance_meters * 0.000621371).toFixed(1)} mi
                </Badge>
              )}
            </div>

            {/* Bottom Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`${categoryStyle.bg} text-white border-0 text-[11px] font-medium`}>
                  {event.category}
                </Badge>
                {isFree ? (
                  <Badge className="bg-emerald-500 text-white border-0 text-[11px] font-medium">
                    Free
                  </Badge>
                ) : event.price ? (
                  <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-[11px]">
                    <Ticket className="h-3 w-3 mr-1" />
                    {event.price}
                  </Badge>
                ) : null}
              </div>
              <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-md">
                {event.title}
              </h3>
            </div>
          </div>

          {/* Content Section */}
          <div className="p-4 space-y-3">
            {/* Event Meta Info */}
            <div className="space-y-1.5">
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                <span>{dateParts.timeLabel}</span>
              </div>
              {(event.venue || event.location) && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                  <span className="truncate">{event.venue || event.location}</span>
                  {event.city && event.city !== 'Des Moines' && (
                    <span className="ml-1 text-xs text-muted-foreground/70">
                      &middot; {event.city}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Description Preview */}
            {(event.enhanced_description || event.original_description) && (
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {event.enhanced_description || event.original_description}
              </p>
            )}

            {/* Social Proof Bar */}
            {showSocialPreview && attendeeCount > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-medium">{attendeeCount}</span>
                  <span>interested</span>
                </div>
                {liveStats?.total_checkins > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>{liveStats.total_checkins} checked in</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Row */}
            <div className="flex items-center justify-between pt-1">
              <span
                className={`inline-flex items-center text-sm font-semibold ${categoryStyle.text} group-hover:gap-2 transition-all`}
              >
                View Details
                <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
              </span>
              <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                <FavoriteButton eventId={event.id} itemName={event.title} variant="ghost" size="icon" />
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
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export const SocialEventCard = React.memo(SocialEventCardComponent);
