import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/capacitorUtils";
import { toast } from "sonner";

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
        e.stopPropagation();
        hapticTap();
        const wasFavorited = favorited;
        toggleFavorite(eventId);
        toast.success(wasFavorited ? 'Removed from favorites' : 'Added to favorites', { id: `fav-${eventId}` });
      }}
      disabled={isToggling}
      className={cn(className)}
      aria-label={isToggling ? "Updating favorite..." : favorited ? "Remove from favorites" : "Add to favorites"}
    >
      {isToggling ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <Heart
          className={cn(
            "h-5 w-5 transition-all",
            favorited
              ? "fill-red-500 text-red-500"
              : "text-muted-foreground hover:text-red-500"
          )}
        />
      )}
      {showText && (
        <span className="ml-2">{favorited ? "Saved" : "Save"}</span>
      )}
    </Button>
  );
}
