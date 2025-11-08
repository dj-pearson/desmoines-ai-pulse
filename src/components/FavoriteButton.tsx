import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  eventId: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showText?: boolean;
}

export function FavoriteButton({
  eventId,
  variant = "ghost",
  size = "icon",
  className,
  showText = false,
}: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite, isToggling } = useFavorites();
  const favorited = isFavorited(eventId);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        e.stopPropagation(); // Prevent triggering parent click events
        toggleFavorite(eventId);
      }}
      disabled={isToggling}
      className={cn(className)}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
    >
      <Heart
        className={cn(
          "h-5 w-5 transition-all",
          favorited
            ? "fill-red-500 text-red-500"
            : "text-muted-foreground hover:text-red-500"
        )}
      />
      {showText && (
        <span className="ml-2">{favorited ? "Saved" : "Save"}</span>
      )}
    </Button>
  );
}
