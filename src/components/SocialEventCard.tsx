import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useEventSocial } from '@/hooks/useEventSocial';
import { Event } from '@/lib/types';
import {
  Users,
  MessageCircle,
  MapPin,
  Calendar,
  Clock,
  TrendingUp,
  UserCheck,
  Heart,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';

interface SocialEventCardProps {
  event: Event;
  onViewDetails: (event: Event) => void;
  onViewSocial?: (eventId: string) => void;
  showSocialPreview?: boolean;
}

export function SocialEventCard({ 
  event, 
  onViewDetails, 
  onViewSocial,
  showSocialPreview = true 
}: SocialEventCardProps) {
  const { liveStats, attendees, discussions, isLoading } = useEventSocial(event.id);

  const formatEventDate = (date: string | Date) => {
    try {
      const eventDate = new Date(date);
      return format(eventDate, "MMM d, yyyy 'at' h:mm a");
    } catch {
      return "Date TBA";
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onViewDetails(event);
  };

  const handleSocialClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewSocial) {
      onViewSocial(event.id);
    }
  };

  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] bg-card border-border"
      onClick={handleCardClick}
    >
      <CardContent className="p-0">
        {/* Event Image */}
        {event.image_url && (
          <div className="relative h-48 overflow-hidden rounded-t-lg">
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
            
            {/* Live Activity Indicator */}
            {liveStats && liveStats.total_checkins > 0 && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-green-500 text-white animate-pulse">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  LIVE
                </Badge>
              </div>
            )}

            {/* Category Badge */}
            <div className="absolute top-3 left-3">
              <Badge variant="secondary" className="bg-black/50 text-white">
                {event.category}
              </Badge>
            </div>
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Event Title & Basic Info */}
          <div>
            <h3 className="font-bold text-lg text-foreground mb-2 group-hover:text-primary transition-colors">
              {event.title}
            </h3>
            
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2" />
                <span>{formatEventDate(event.date)}</span>
              </div>
              
              {event.location && (
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{event.location}</span>
                </div>
              )}
              
              {event.price && (
                <div className="flex items-center">
                  <span className="font-medium text-primary">{event.price}</span>
                </div>
              )}
            </div>
          </div>

          {/* Social Preview */}
          {showSocialPreview && !isLoading && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">Live Activity</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSocialClick}
                  className="h-6 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View All
                </Button>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <div className="flex items-center justify-center">
                    <Users className="h-4 w-4 text-primary mr-1" />
                    <span className="text-sm font-bold text-primary">
                      {liveStats?.current_attendees || 0}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Going</p>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-center">
                    <UserCheck className="h-4 w-4 text-green-600 mr-1" />
                    <span className="text-sm font-bold text-green-600">
                      {liveStats?.total_checkins || 0}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Checked In</p>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-blue-600 mr-1" />
                    <span className="text-sm font-bold text-blue-600">
                      {discussions.length}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Comments</p>
                </div>
              </div>

              {/* Recent Attendees Preview */}
              {attendees.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {attendees.slice(0, 3).map((attendee, index) => (
                        <Avatar key={attendee.id} className="h-6 w-6 border-2 border-background">
                          <AvatarFallback className="text-xs">
                            {index + 1}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                    
                    <span className="text-xs text-muted-foreground">
                      {attendees.length > 3 
                        ? `and ${attendees.length - 3} others are going`
                        : `${attendees.length} ${attendees.length === 1 ? 'person is' : 'people are'} going`
                      }
                    </span>
                  </div>
                </div>
              )}

              {/* Latest Discussion Preview */}
              {discussions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Latest:</div>
                  <div className="bg-background/50 rounded p-2">
                    <p className="text-xs text-foreground line-clamp-2">
                      {discussions[0].message}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">Just now</span>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Heart className="h-3 w-3 mr-1" />
                        {discussions[0].likes_count}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {event.enhanced_description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {event.enhanced_description}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={handleCardClick}
            >
              View Details
            </Button>
            
            {showSocialPreview && (
              <Button 
                variant="outline" 
                onClick={handleSocialClick}
                className="flex items-center"
              >
                <Users className="h-4 w-4 mr-1" />
                Social
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}