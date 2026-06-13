import React, { useState } from "react";
import { Star } from "lucide-react";
import { hapticTap } from "@/lib/capacitorUtils";
import { Database } from "@/integrations/supabase/types";

type RatingValue = Database["public"]["Enums"]["rating_value"];

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: RatingValue) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onRatingChange,
  readonly = false,
  size = "md",
}) => {
  const [hoverRating, setHoverRating] = useState(0);

  const starSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-5 w-5";

  return (
    <div className="flex gap-1" role={readonly ? undefined : "radiogroup"} aria-label={readonly ? undefined : "Star rating"}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= (hoverRating || rating);
        return (
          <Star
            key={star}
            className={`${starSize} transition-colors ${
              isFilled
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground hover:text-yellow-400"
            } ${readonly ? "cursor-default" : "cursor-pointer"}`}
            role={readonly ? undefined : "radio"}
            aria-checked={readonly ? undefined : star === rating}
            aria-label={readonly ? undefined : `${star} star${star > 1 ? "s" : ""}`}
            onClick={() => {
              if (!readonly) {
                hapticTap();
                onRatingChange?.(star.toString() as RatingValue);
              }
            }}
            onMouseEnter={() => !readonly && setHoverRating(star)}
            onMouseLeave={() => !readonly && setHoverRating(0)}
          />
        );
      })}
    </div>
  );
};
