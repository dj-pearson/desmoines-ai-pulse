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

interface SocialEventCardProps {
  event: Event;
  onViewDetails: (event: Event) => void;
  onViewSocial?: (eventId: string) => void;
  showSocialPreview?: boolean;
  socialData?: BatchEventSocialData;
  featured?: boolean;
}

export function SocialEventCard({
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

  const getCategoryStyle = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('music')) return { bg: 'bg-violet-500', text: 'text-violet-500', icon: 'bg-violet-500/10' };
    if (c.includes('food') || c.includes('drink')) return { bg: 'bg-orange-500', text: 'text-orange-500', icon: 'bg-orange-500/10' };
    if (c.includes('sport')) return { bg: 'bg-emerald-500', text: 'text-emerald-500', icon: 'bg-emerald-500/10' };
    if (c.includes('art') || c.includes('culture')) return { bg: 'bg-pink-500', text: 'text-pink-500', icon: 'bg-pink-500/10' };
    if (c.includes('family') || c.includes('kid')) return { bg: 'bg-sky-500', text: 'text-sky-500', icon: 'bg-sky-500/10' };
    if (c.includes('outdoor')) return { bg: 'bg-green-500', text: 'text-green-500', icon: 'bg-green-500/10' };
    if (c.includes('business') || c.includes('network')) return { bg: 'bg-slate-600', text: 'text-slate-600', icon: 'bg-slate-600/10' };
    return { bg: 'bg-primary', text: 'text-primary', icon: 'bg-primary/10' };
  };

  const categoryStyle = getCategoryStyle(event.category);

  const getDateParts = () => {
    try {
      const dateSource = event.event_start_utc || event.event_start_local || event.date;
      const month = formatInCentralTime(dateSource, 'MMM').toUpperCase();
      const day = formatInCentralTime(dateSource, 'd');
      const weekday = formatInCentralTime(dateSource, 'EEE');
      const showTime = hasSpecificTime(event);
      const time = showTime ? formatInCentralTime(dateSource, 'h:mm a') : null;
      return { month, day, weekday, time };
    } catch {
      return { month: 'TBA', day: '--', weekday: '', time: null };
    }
  };

  const dateParts = getDateParts();
  const eventSlug = createEventSlugWithCentralTime(event.title, event);
  const eventUrl = `/events/${eventSlug}`;

  const isFree = !event.price || event.price.toLowerCase().includes('free') || event.price === '$0';
  const isLive = liveStats && liveStats.total_checkins > 0;
  const attendeeCount = attendees?.length || liveStats?.current_attendees || 0;

  return (
    <Card
      className={`group relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card ${
        featured ? 'md:col-span-2 md:row-span-2' : ''
      }`}
    >
      <Link to={eventUrl} className="block" aria-label={`View details for ${event.title}`}>
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
            {/* Fallback when no image */}
            <div
              className={`w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 items-center justify-center flex-col gap-2 ${
                event.image_url ? 'hidden' : 'flex'
              }`}
            >
              <div className={`rounded-full p-4 ${categoryStyle.icon}`}>
                <Calendar className={`h-8 w-8 ${categoryStyle.text}`} />
              </div>
              <span className="text-xs text-muted-foreground mt-1">{event.category}</span>
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
              {isLive && (
                <Badge className="bg-green-500 text-white border-0 shadow-lg text-[10px] px-2 animate-pulse">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  LIVE
                </Badge>
              )}
              {event.is_featured && (
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
              {dateParts.time && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 mr-2 flex-shrink-0" />
                  <span>{dateParts.time} CT</span>
                </div>
              )}
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
                <FavoriteButton eventId={event.id} variant="ghost" size="icon" />
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
