import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, ClockIcon, MapPinIcon, SparklesIcon, CheckIcon, AlertTriangleIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useSmartCalendar } from '@/hooks/useSmartCalendar';

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  category: string;
  price?: string;
  image_url?: string;
  venue?: string;
}

interface SmartEventCardProps {
  event: Event;
  className?: string;
}

export function SmartEventCard({ event, className = '' }: SmartEventCardProps) {
  const { checkConflicts, addManualEvent } = useSmartCalendar();
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

  return (
    <Card className={`group hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500 ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-start space-x-4">
          {event.image_url && (
            <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={event.image_url}
                alt={event.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
                {event.title}
              </h3>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                  <SparklesIcon className="w-3 h-3 mr-1" />
                  Smart
                </Badge>
                {event.category && (
                  <Badge variant="outline">
                    {event.category}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
              <div className="flex items-center">
                <CalendarIcon className="w-4 h-4 mr-1" />
                {format(parseISO(event.date), 'MMM d, yyyy h:mm a')}
              </div>
              {event.location && (
                <div className="flex items-center">
                  <MapPinIcon className="w-4 h-4 mr-1" />
                  {event.location}
                </div>
              )}
              {event.price && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  {event.price}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCheckSchedule}
                  disabled={checking}
                  className={
                    hasConflicts === false 
                      ? 'border-green-500 text-green-600 hover:bg-green-50' 
                      : hasConflicts === true 
                      ? 'border-amber-500 text-amber-600 hover:bg-amber-50'
                      : ''
                  }
                >
                  {getConflictIcon()}
                  <span className="ml-2">{getConflictText()}</span>
                </Button>

                {hasConflicts === false && (
                  <Button
                    size="sm"
                    onClick={handleAddToCalendar}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                  >
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    Add to Calendar
                  </Button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <div className="text-xs text-muted-foreground">
                  AI-powered scheduling
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}