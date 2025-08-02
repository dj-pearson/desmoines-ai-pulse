import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  MapPin, 
  Users, 
  Calendar,
  Star,
  ThumbsUp,
  Camera
} from "lucide-react";
import { useSocialFeatures } from "@/hooks/useSocialFeatures";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Event {
  id: string;
  title: string;
  description?: string;
  date: string;
  venue?: string;
  location: string;
  image_url?: string;
  latitude?: number;
  longitude?: number;
  category: string;
  price?: string;
}

interface SocialEventCardProps {
  event: Event;
  onViewDetails: (eventId: string) => void;
  showSocialFeatures?: boolean;
}

export function SocialEventCard({ 
  event, 
  onViewDetails,
  showSocialFeatures = true 
}: SocialEventCardProps) {
  const { user } = useAuth();
  const { 
    updateEventAttendance, 
    getEventAttendance,
    getEventUGC,
    getFriendsNearEvent
  } = useSocialFeatures();
  
  const [attendanceData, setAttendanceData] = useState({
    going: 0,
    interested: 0,
    maybe: 0,
    total: 0
  });
  const [userAttendance, setUserAttendance] = useState<string | null>(null);
  const [friendsNearby, setFriendsNearby] = useState<any[]>([]);
  const [ugcData, setUgcData] = useState({
    tips: [],
    reviews: [],
    photos: []
  });
  const [socialBuzz, setSocialBuzz] = useState(0);

  useEffect(() => {
    if (showSocialFeatures) {
      loadSocialData();
    }
  }, [event.id, showSocialFeatures]);

  const loadSocialData = async () => {
    try {
      const [attendance, ugc] = await Promise.all([
        getEventAttendance(event.id),
        getEventUGC(event.id)
      ]);
      
      setAttendanceData(attendance);
      setUgcData(ugc);
      
      // Calculate social buzz score
      const buzzScore = 
        (attendance.going * 3) + 
        (attendance.interested * 1) + 
        (ugc.reviews.length * 2) + 
        (ugc.tips.length * 1) + 
        (ugc.photos.length * 1.5);
      setSocialBuzz(Math.round(buzzScore));
      
      // Load friends nearby if location is available
      if (event.latitude && event.longitude && user) {
        const nearby = await getFriendsNearEvent(
          event.latitude, 
          event.longitude, 
          25 // 25km radius
        );
        setFriendsNearby(nearby);
      }
    } catch (error) {
      console.error('Failed to load social data:', error);
    }
  };

  const handleAttendanceUpdate = async (status: 'interested' | 'going' | 'maybe' | 'not_going') => {
    if (!user) {
      toast.error('Please log in to update your attendance');
      return;
    }

    try {
      await updateEventAttendance(event.id, status);
      setUserAttendance(status);
      await loadSocialData(); // Refresh attendance data
      
      toast.success(`Marked as ${status === 'not_going' ? 'not going' : status}`);
    } catch (error) {
      toast.error('Failed to update attendance');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: `Check out this event: ${event.title}`,
          url: window.location.href
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback for browsers that don't support Web Share API
      navigator.clipboard.writeText(window.location.href);
      toast.success('Event link copied to clipboard!');
    }
  };

  const getTrendingBadge = () => {
    if (socialBuzz > 50) return { label: "🔥 Trending", variant: "destructive" as const };
    if (socialBuzz > 20) return { label: "⭐ Popular", variant: "default" as const };
    if (socialBuzz > 10) return { label: "📈 Rising", variant: "secondary" as const };
    return null;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const trendingBadge = getTrendingBadge();

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden">
      {event.image_url && (
        <div className="relative h-48 overflow-hidden">
          <img 
            src={event.image_url} 
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {trendingBadge && (
            <Badge 
              variant={trendingBadge.variant}
              className="absolute top-3 left-3 animate-pulse"
            >
              {trendingBadge.label}
            </Badge>
          )}
          
          {showSocialFeatures && ugcData.photos.length > 0 && (
            <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-full text-xs">
              <Camera className="w-3 h-3" />
              {ugcData.photos.length}
            </div>
          )}
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
              {event.title}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(event.date)}
              </div>
              {event.venue && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate">{event.venue}</span>
                </div>
              )}
            </div>
          </div>
          
          <Badge variant="outline" className="ml-2">
            {event.category}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {event.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {event.description}
          </p>
        )}

        {showSocialFeatures && (
          <div className="space-y-4">
            {/* Friends Nearby */}
            {friendsNearby.length > 0 && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm">
                  {friendsNearby.length} friend{friendsNearby.length !== 1 ? 's' : ''} nearby
                </span>
                <div className="flex -space-x-1 ml-auto">
                  {friendsNearby.slice(0, 3).map((friend, index) => (
                    <Avatar key={friend.friend_id} className="w-6 h-6 border-2 border-white">
                      <AvatarFallback className="text-xs">
                        {friend.friend_name?.charAt(0) || '?'}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {friendsNearby.length > 3 && (
                    <div className="w-6 h-6 bg-muted rounded-full border-2 border-white flex items-center justify-center text-xs">
                      +{friendsNearby.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social Proof */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                {attendanceData.going > 0 && (
                  <div className="flex items-center gap-1 text-green-600">
                    <Heart className="w-4 h-4 fill-current" />
                    <span>{attendanceData.going} going</span>
                  </div>
                )}
                {attendanceData.interested > 0 && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <Star className="w-4 h-4" />
                    <span>{attendanceData.interested} interested</span>
                  </div>
                )}
                {ugcData.reviews.length > 0 && (
                  <div className="flex items-center gap-1 text-orange-600">
                    <MessageCircle className="w-4 h-4" />
                    <span>{ugcData.reviews.length} reviews</span>
                  </div>
                )}
              </div>
              
              {socialBuzz > 5 && (
                <div className="text-xs text-muted-foreground">
                  Buzz: {socialBuzz}
                </div>
              )}
            </div>

            {/* User-Generated Content Preview */}
            {ugcData.tips.length > 0 && (
              <div className="p-2 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <div className="flex items-center gap-1 mb-1">
                  <ThumbsUp className="w-3 h-3 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">Top Tip</span>
                </div>
                <p className="text-xs text-blue-700 line-clamp-2">
                  {ugcData.tips[0].tip_text}
                </p>
              </div>
            )}

            {/* Attendance Actions */}
            {user && (
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  variant={userAttendance === 'going' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAttendanceUpdate('going')}
                  className="text-xs"
                >
                  Going
                </Button>
                <Button 
                  variant={userAttendance === 'interested' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAttendanceUpdate('interested')}
                  className="text-xs"
                >
                  Interested
                </Button>
                <Button 
                  variant={userAttendance === 'maybe' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleAttendanceUpdate('maybe')}
                  className="text-xs"
                >
                  Maybe
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <Button 
            onClick={() => onViewDetails(event.id)}
            variant="default"
            size="sm"
            className="flex-1 mr-2"
          >
            View Details
          </Button>
          
          {showSocialFeatures && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleShare}
              className="px-3"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}