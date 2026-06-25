import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Star, ThumbsUp, ThumbsDown, Flag, Edit, Trash2, ImagePlus, X, Loader2 } from "lucide-react";
import { hapticTap } from "@/lib/capacitorUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useRatings, useUserReputation } from "@/hooks/useRatings";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { PremiumGate } from "@/components/PremiumGate";
import { supabase } from "@/integrations/supabase/client";
import { resizeImageFile } from "@/lib/imageResize";
import { Database } from "@/integrations/supabase/types";
import { format, formatDistanceToNow } from "date-fns";

const MAX_REVIEW_PHOTOS = 3;

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
            onClick={() => { if (!readonly) { hapticTap(); onRatingChange?.(star.toString() as RatingValue); } }}
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
  const { toast } = useToast();
  const {
    ratings,
    userRating,
    aggregate,
    isLoading,
    submitRating,
    deleteRating,
    voteHelpful,
    reportReview,
  } = useRatings({ contentType, contentId });

  const [showRatingForm, setShowRatingForm] = useState(false);
  const [selectedRating, setSelectedRating] = useState<RatingValue>("5");
  const [reviewText, setReviewText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || !user) return;
    const room = MAX_REVIEW_PHOTOS - photoUrls.length;
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length === 0) {
      toast({ title: `Up to ${MAX_REVIEW_PHOTOS} photos`, variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      for (const file of chosen) {
        const blob = await resizeImageFile(file);
        const path = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("review-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("review-photos").getPublicUrl(path);
        setPhotoUrls((prev) => [...prev, data.publicUrl]);
      }
    } catch (err) {
      toast({
        title: "Photo upload failed",
        description: err instanceof Error ? err.message : "Please try a different image.",
        variant: "destructive",
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (url: string) => setPhotoUrls((prev) => prev.filter((u) => u !== url));

  const resetForm = () => {
    setShowRatingForm(false);
    setReviewText("");
    setSelectedRating("5");
    setPhotoUrls([]);
  };

  const handleSubmitRating = async () => {
    if (!user) return;

    setIsSubmitting(true);
    const success = await submitRating(
      selectedRating,
      reviewText.trim() || undefined,
      photoUrls.length ? photoUrls : undefined,
    );
    if (success) resetForm();
    setIsSubmitting(false);
  };

  const handleDeleteRating = async () => {
    setIsSubmitting(true);
    await deleteRating();
    setIsSubmitting(false);
  };

  // Editing an existing review: prefill the form from the user's current row so
  // their stars/text/photos aren't wiped on save (submitRating upserts the row).
  const startEdit = () => {
    if (!userRating) return;
    setSelectedRating(userRating.rating);
    setReviewText(userRating.review_text ?? "");
    setPhotoUrls(Array.isArray(userRating.photo_urls) ? userRating.photo_urls : []);
    setShowRatingForm(true);
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
              {/* Editing falls through to the form branch below (prefilled by startEdit). */}
              {userRating && !showRatingForm ? (
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
                        onClick={startEdit}
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
                <PremiumGate
                  feature="write_reviews"
                  requiredTier="insider"
                  mode="inline"
                  title="Write a Review"
                  description="Share your experiences by writing reviews. Available with Insider."
                >
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

                      {/* Photos (up to 3, client-resized) */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Photos (optional, up to {MAX_REVIEW_PHOTOS})
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {photoUrls.map((url) => (
                            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                              <img src={url} alt="Review upload" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removePhoto(url)}
                                aria-label="Remove photo"
                                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {photoUrls.length < MAX_REVIEW_PHOTOS && (
                            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted">
                              {uploadingPhoto ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <ImagePlus className="h-5 w-5" />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="sr-only"
                                disabled={uploadingPhoto}
                                onChange={(e) => {
                                  handleAddPhotos(e.target.files);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={handleSubmitRating}
                          disabled={isSubmitting || uploadingPhoto}
                        >
                          {isSubmitting ? "Submitting..." : "Submit Rating"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={resetForm}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                </PremiumGate>
              )}
            </div>
          )}

          {/* Guest sign-in prompt */}
          {!user && (
            <div className="mt-6 pt-4 border-t text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Sign in to rate and review this {contentType}.
              </p>
              <Button asChild size="sm">
                <Link to="/auth">Sign in to review</Link>
              </Button>
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
                .filter((rating) => rating.review_text || (rating.photo_urls && rating.photo_urls.length > 0))
                .map((rating) => (
                  <ReviewCard
                    key={rating.id}
                    rating={rating}
                    onVoteHelpful={voteHelpful}
                    onReport={reportReview}
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
  onReport: (ratingId: string) => Promise<boolean>;
  currentUserId?: string;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ rating, onVoteHelpful, onReport, currentUserId }) => {
  const { reputation } = useUserReputation(rating.user_id);
  const isOwnReview = currentUserId === rating.user_id;
  const [lightbox, setLightbox] = useState<string | null>(null);
  const photos: string[] = Array.isArray(rating.photo_urls) ? rating.photo_urls : [];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StarRating rating={Number(rating.rating)} readonly size="sm" />
            <span
              className="text-sm text-muted-foreground"
              title={format(new Date(rating.created_at), "MMM d, yyyy")}
            >
              {formatDistanceToNow(new Date(rating.created_at), { addSuffix: true })}
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

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setLightbox(url)}
              className="h-24 w-24 overflow-hidden rounded-md border"
              aria-label="View review photo"
            >
              <img src={url} alt="Review photo" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && <img src={lightbox} alt="Review photo" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>

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
            aria-label="Report this review"
            onClick={() => onReport(rating.id)}
          >
            <Flag className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
};