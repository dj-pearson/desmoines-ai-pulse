import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/useFeedback";
import { useAuth } from "@/hooks/useAuth";
import { ThumbsUp, ThumbsDown, Heart, HeartOff, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLogger } from '@/lib/logger';

const log = createLogger('EventFeedback');

interface EventFeedbackProps {
  eventId: string;
  className?: string;
  showStats?: boolean;
}

export default function EventFeedback({ eventId, className, showStats = false }: EventFeedbackProps) {
  const { isAuthenticated } = useAuth();
  const { submitFeedback, removeFeedback, getFeedbackForEvent, getFeedbackStats } = useFeedback();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState({ thumbs_up: 0, thumbs_down: 0, interested: 0, not_interested: 0 });

  const currentFeedback = getFeedbackForEvent(eventId);

  const handleFeedback = async (feedbackType: 'thumbs_up' | 'thumbs_down') => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to rate events and get personalized recommendations.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (currentFeedback?.feedback_type === feedbackType) {
        // Remove feedback if clicking the same button
        await removeFeedback(eventId);
        toast({
          title: "Feedback removed",
          description: "Your rating has been removed.",
        });
      } else {
        // Submit new feedback
        await submitFeedback(eventId, feedbackType);
        toast({
          title: feedbackType === 'thumbs_up' ? "👍 Liked!" : "👎 Disliked",
          description: "Thanks for your feedback! We'll use this to improve your recommendations.",
        });
      }

      // Refresh stats if showing them
      if (showStats) {
        const newStats = await getFeedbackStats(eventId);
        setStats(newStats);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInterestToggle = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save events and get personalized recommendations.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const isCurrentlyInterested = currentFeedback?.feedback_type === 'interested';
      
      if (isCurrentlyInterested) {
        await removeFeedback(eventId);
        toast({
          title: "Removed from interests",
          description: "Event removed from your interested list.",
        });
      } else {
        await submitFeedback(eventId, 'interested');
        toast({
          title: "Added to interests",
          description: "We'll recommend more events like this!",
        });
      }

      if (showStats) {
        const newStats = await getFeedbackStats(eventId);
        setStats(newStats);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update interest. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load stats on component mount if needed
  React.useEffect(() => {
    if (showStats) {
      getFeedbackStats(eventId)
        .then(setStats)
        .catch((error) => {
          log.error('Failed to load feedback stats', { action: 'loadStats', metadata: { error } });
          // Set default stats on error to avoid UI issues
          setStats({ thumbs_up: 0, thumbs_down: 0, interested: 0, not_interested: 0 });
        });
    }
  }, [eventId, showStats, getFeedbackStats]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Interest/Save Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleInterestToggle}
        disabled={isSubmitting}
        className={cn(
          "p-2 h-8 w-8",
          currentFeedback?.feedback_type === 'interested'
            ? "text-red-500 hover:text-red-600"
            : "text-gray-400 hover:text-red-500"
        )}
      >
        {currentFeedback?.feedback_type === 'interested' ? (
          <Heart className="h-4 w-4 fill-current" />
        ) : (
          <HeartOff className="h-4 w-4" />
        )}
      </Button>

      {/* Thumbs Up */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('thumbs_up')}
        disabled={isSubmitting}
        className={cn(
          "p-2 h-8 w-8",
          currentFeedback?.feedback_type === 'thumbs_up'
            ? "text-green-500 hover:text-green-600 bg-green-50"
            : "text-gray-400 hover:text-green-500"
        )}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>

      {/* Thumbs Down */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('thumbs_down')}
        disabled={isSubmitting}
        className={cn(
          "p-2 h-8 w-8",
          currentFeedback?.feedback_type === 'thumbs_down'
            ? "text-red-500 hover:text-red-600 bg-red-50"
            : "text-gray-400 hover:text-red-500"
        )}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>

      {/* Stats (optional) */}
      {showStats && (
        <div className="flex items-center gap-1 ml-2">
          {stats.thumbs_up > 0 && (
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
              <ThumbsUp className="h-3 w-3 mr-1" />
              {stats.thumbs_up}
            </Badge>
          )}
          {stats.thumbs_down > 0 && (
            <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">
              <ThumbsDown className="h-3 w-3 mr-1" />
              {stats.thumbs_down}
            </Badge>
          )}
          {stats.interested > 0 && (
            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
              <Heart className="h-3 w-3 mr-1" />
              {stats.interested}
            </Badge>
          )}
        </div>
      )}

      {/* Learning indicator */}
      {currentFeedback && (
        <Badge variant="outline" className="text-xs ml-2">
          <TrendingUp className="h-3 w-3 mr-1" />
          Learning
        </Badge>
      )}
    </div>
  );
}