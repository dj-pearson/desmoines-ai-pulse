import React, { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, Flag, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useRatings, useUserReputation } from "@/hooks/useRatings";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

type ContentType = Database["public"]["Enums"]["content_type"];
type RatingValue = Database["public"]["Enums"]["rating_value"];

interface RatingSystemProps {
  contentType: ContentType;
  contentId: string;
  showReviews?: boolean;
  compact?: boolean;
}

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: RatingValue) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

const StarRating: React.FC<StarRatingProps> = ({ 
  rating, 
  onRatingChange, 
  readonly = false,
  size = "md" 
}) => {
  const [hoverRating, setHoverRating] = useState(0);
  
  const starSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= (hoverRating || rating);
        return (
          <Star
            key={star}
            className={`${starSize} cursor-pointer transition-colors ${
              isFilled 
                ? "fill-yellow-400 text-yellow-400" 
                : "text-muted-foreground hover:text-yellow-400"
            } ${readonly ? "cursor-default" : ""}`}
            onClick={() => !readonly && onRatingChange?.(star.toString() as RatingValue)}
            onMouseEnter={() => !readonly && setHoverRating(star)}
            onMouseLeave={() => !readonly && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
};

const ReputationBadge: React.FC<{ level: string; points: number }> = ({ level, points }) => {
  const getLevelColor = (level: string) => {
    switch (level) {
      case "platinum": return "bg-purple-500";
      case "gold": return "bg-yellow-500";
      case "silver": return "bg-gray-400";
      case "bronze": return "bg-orange-600";
      case "moderator": return "bg-blue-500";
      case "admin": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  return (
    <Badge className={`${getLevelColor(level)} text-white text-xs`}>
      {level.toUpperCase()} ({points} pts)
    </Badge>
  );
};

export const RatingSystem: React.FC<RatingSystemProps> = ({
  contentType,
  contentId,
  showReviews = true,
  compact = false,
}) => {
  const { user } = useAuth();
  const {
    ratings,
    userRating,
    aggregate,
    isLoading,
    submitRating,
    deleteRating,
    voteHelpful,
  } = useRatings({ contentType, contentId });

  const [showRatingForm, setShowRatingForm] = useState(false);
  const [selectedRating, setSelectedRating] = useState<RatingValue>("5");
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitRating = async () => {
    if (!user) return;
    
    setIsSubmitting(true);
    const success = await submitRating(selectedRating, reviewText.trim() || undefined);
    if (success) {
      setShowRatingForm(false);
      setReviewText("");
      setSelectedRating("5");
    }
    setIsSubmitting(false);
  };

  const handleDeleteRating = async () => {
    setIsSubmitting(true);
    await deleteRating();
    setIsSubmitting(false);
  };

  if (isLoading && !aggregate) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-pulse">Loading ratings...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rating Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {compact ? "Rating" : "User Ratings"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aggregate && aggregate.total_ratings > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-3xl font-bold">
                  {aggregate.weighted_average.toFixed(1)}
                </div>
                <div className="flex-1">
                  <StarRating rating={Math.round(Number(aggregate.weighted_average))} readonly />
                  <p className="text-sm text-muted-foreground mt-1">
                    Based on {aggregate.total_ratings} review{aggregate.total_ratings !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              
              {!compact && (
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = aggregate.rating_distribution?.[stars.toString()] || 0;
                    const percentage = aggregate.total_ratings > 0 
                      ? (count / aggregate.total_ratings) * 100 
                      : 0;
                    
                    return (
                      <div key={stars} className="flex items-center gap-2 text-sm">
                        <span className="w-8">{stars}★</span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div 
                            className="bg-yellow-400 rounded-full h-2" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-12 text-muted-foreground">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">No ratings yet</p>
              <p className="text-sm text-muted-foreground">Be the first to rate!</p>
            </div>
          )}

          {/* User Rating Section */}
          {user && (
            <div className="mt-6 pt-4 border-t">
              {userRating ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Your Rating:</span>
                      <StarRating rating={Number(userRating.rating)} readonly size="sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRatingForm(true)}
                        disabled={isSubmitting}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteRating}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  {userRating.review_text && (
                    <p className="text-sm bg-muted p-3 rounded-md">
                      {userRating.review_text}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  {!showRatingForm ? (
                    <Button onClick={() => setShowRatingForm(true)}>
                      Rate this {contentType}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Your Rating</label>
                        <StarRating 
                          rating={Number(selectedRating)} 
                          onRatingChange={setSelectedRating} 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Review (Optional)</label>
                        <Textarea
                          placeholder={`Share your thoughts about this ${contentType}...`}
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          rows={3}
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleSubmitRating} 
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Submitting..." : "Submit Rating"}
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowRatingForm(false);
                            setReviewText("");
                            setSelectedRating("5");
                          }}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reviews List */}
      {showReviews && !compact && ratings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {ratings
                .filter(rating => rating.review_text)
                .map((rating) => (
                  <ReviewCard 
                    key={rating.id} 
                    rating={rating} 
                    onVoteHelpful={voteHelpful}
                    currentUserId={user?.id}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface ReviewCardProps {
  rating: any;
  onVoteHelpful: (ratingId: string, isHelpful: boolean) => Promise<boolean>;
  currentUserId?: string;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ rating, onVoteHelpful, currentUserId }) => {
  const { reputation } = useUserReputation(rating.user_id);
  const isOwnReview = currentUserId === rating.user_id;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StarRating rating={Number(rating.rating)} readonly size="sm" />
            <span className="text-sm text-muted-foreground">
              {format(new Date(rating.created_at), "MMM d, yyyy")}
            </span>
            {reputation && (
              <ReputationBadge 
                level={reputation.level} 
                points={reputation.points} 
              />
            )}
          </div>
          <div className="text-sm font-medium">
            {rating.profiles?.first_name 
              ? `${rating.profiles.first_name} ${rating.profiles.last_name || ''}`.trim()
              : "Anonymous User"
            }
          </div>
        </div>
      </div>
      
      {rating.review_text && (
        <p className="text-sm leading-relaxed">{rating.review_text}</p>
      )}
      
      {!isOwnReview && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Was this helpful?</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onVoteHelpful(rating.id, true)}
            className="h-8 px-2"
          >
            <ThumbsUp className="h-3 w-3 mr-1" />
            Yes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onVoteHelpful(rating.id, false)}
            className="h-8 px-2"
          >
            <ThumbsDown className="h-3 w-3 mr-1" />
            No
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-red-500"
          >
            <Flag className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
};