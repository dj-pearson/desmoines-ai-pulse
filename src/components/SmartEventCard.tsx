import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClockIcon, MapPinIcon, SparklesIcon, CheckIcon, AlertTriangleIcon, Share2Icon, NavigationIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useSmartCalendar } from '@/hooks/useSmartCalendar';
import { useNativeShare, createEventShareData } from '@/hooks/use-native-share';
import { useIsMobile } from '@/hooks/use-mobile';
import { Link } from 'react-router-dom';

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  category: string;
  price?: string;
  image_url?: string;
  venue?: string;
  slug?: string;
  description?: string;
}

interface SmartEventCardProps {
  event: Event;
  className?: string;
}

export function SmartEventCard({ event, className = '' }: SmartEventCardProps) {
  const { checkConflicts, addManualEvent } = useSmartCalendar();
  const { share, isSupported: isShareSupported } = useNativeShare();
  const isMobile = useIsMobile();
  const [checking, setChecking] = useState(false);
  const [hasConflicts, setHasConflicts] = useState<boolean | null>(null);

  const handleCheckSchedule = async () => {
    setChecking(true);
    try {
      const eventDate = new Date(event.date);
      const startTime = eventDate.toISOString();
      const endTime = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours later
      
      const conflicts = await checkConflicts(startTime, endTime);
      setHasConflicts(conflicts.count > 0);
      
      if (conflicts.count === 0) {
        toast.success('You\'re free during this time!');
      } else {
        toast.warning(`${conflicts.count} calendar conflict(s) found`);
      }
    } catch (error) {
      toast.error('Failed to check calendar conflicts');
    } finally {
      setChecking(false);
    }
  };

  const handleAddToCalendar = async () => {
    try {
      const eventDate = new Date(event.date);
      const endTime = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
      
      await addManualEvent({
        title: event.title,
        description: `${event.category} event at ${event.venue || event.location}`,
        start_time: eventDate.toISOString(),
        end_time: endTime.toISOString(),
        location: event.location,
      });
      
      toast.success('Event added to your calendar!');
    } catch (error) {
      toast.error('Failed to add event to calendar');
    }
  };

  const getConflictIcon = () => {
    if (checking) return <ClockIcon className="w-4 h-4 animate-pulse" />;
    if (hasConflicts === null) return <CalendarIcon className="w-4 h-4" />;
    if (hasConflicts) return <AlertTriangleIcon className="w-4 h-4 text-amber-500" />;
    return <CheckIcon className="w-4 h-4 text-green-500" />;
  };

  const getConflictText = () => {
    if (checking) return 'Checking...';
    if (hasConflicts === null) return 'Check Schedule';
    if (hasConflicts) return 'Has Conflicts';
    return 'Schedule Free';
  };

  const handleShare = async () => {
    if (event.slug) {
      await share(createEventShareData({
        title: event.title,
        description: event.description || `${event.category} event at ${event.venue || event.location}`,
        slug: event.slug,
      }));
    } else {
      toast.error('Unable to share this event');
    }
  };

  const handleGetDirections = () => {
    if (event.location) {
      const encodedLocation = encodeURIComponent(event.location);
      const url = `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
      window.open(url, '_blank');
    }
  };

  const CardWrapper = event.slug ? Link : 'div';
  const cardProps = event.slug ? { to: `/events/${event.slug}` } : {};

  return (
    <Card className={`group card-mobile-interactive border-l-4 border-l-blue-500 ${className}`}>
      <CardContent className="p-4 md:p-6">
        <CardWrapper
          {...cardProps}
          className="flex flex-col md:flex-row md:items-start gap-4"
        >
          {event.image_url && (
            <div className="relative w-full md:w-24 h-48 md:h-24 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={event.image_url}
                alt={event.title}
                className="w-full h-full object-cover img-mobile"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-col gap-2 mb-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="heading-mobile line-clamp-2 group-hover:text-primary transition-colors flex-1">
                  {event.title}
                </h3>
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleShare();
                    }}
                    className="btn-mobile-icon flex-shrink-0"
                    aria-label="Share event"
                  >
                    <Share2Icon className="h-5 w-5" />
                  </Button>
                )}
              </div>
              <div className="inline-mobile">
                <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white chip-mobile">
                  <SparklesIcon className="w-3 h-3" />
                  <span className="ml-1">Smart</span>
                </Badge>
                {event.category && (
                  <Badge variant="outline" className="chip-mobile">
                    {event.category}
                  </Badge>
                )}
                {event.price && (
                  <Badge variant="outline" className="chip-mobile text-green-600 border-green-600">
                    {event.price}
                  </Badge>
                )}
              </div>
            </div>

            <div className="stack-mobile-sm mb-4">
              <div className="flex items-center gap-2 caption-mobile">
                <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                <span className="mobile-text-wrap">
                  {format(parseISO(event.date), isMobile ? 'MMM d, h:mm a' : 'MMM d, yyyy h:mm a')}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 caption-mobile">
                  <MapPinIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="line-clamp-2 mobile-text-wrap flex-1">
                    {event.location}
                  </span>
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        handleGetDirections();
                      }}
                      className="touch-feedback p-2 h-auto"
                      aria-label="Get directions"
                    >
                      <NavigationIcon className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className={isMobile ? "stack-mobile-sm" : "flex items-center justify-between"}>
              <div className={isMobile ? "inline-mobile" : "flex items-center space-x-2"}>
                <Button
                  variant="outline"
                  size={isMobile ? "default" : "sm"}
                  onClick={(e) => {
                    e.preventDefault();
                    handleCheckSchedule();
                  }}
                  disabled={checking}
                  className={`${isMobile ? 'btn-mobile flex-1' : ''} ${
                    hasConflicts === false
                      ? 'border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950'
                      : hasConflicts === true
                      ? 'border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950'
                      : ''
                  }`}
                >
                  {getConflictIcon()}
                  <span className="ml-2">{isMobile ? getConflictText() : getConflictText()}</span>
                </Button>

                {hasConflicts === false && (
                  <Button
                    size={isMobile ? "default" : "sm"}
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddToCalendar();
                    }}
                    className={`${isMobile ? 'btn-mobile flex-1' : ''} bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700`}
                  >
                    <CalendarIcon className="w-4 h-4" />
                    <span className="ml-2">{isMobile ? 'Add' : 'Add to Calendar'}</span>
                  </Button>
                )}

                {!isMobile && !isShareSupported && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleShare();
                    }}
                    aria-label="Share event"
                  >
                    <Share2Icon className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {!isMobile && (
                <div className="flex items-center space-x-2">
                  <div className="text-xs text-muted-foreground">
                    AI-powered scheduling
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardWrapper>
      </CardContent>
    </Card>
  );
}