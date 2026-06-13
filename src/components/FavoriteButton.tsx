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
  /** Item name for a specific accessible label ("Save {name}"). */
  itemName?: string;
}

export function FavoriteButton({
  eventId,
  variant = "ghost",
  size = "icon",
  className,
  showText = false,
  itemName,
}: FavoriteButtonProps) {
  const { isFavorited, toggleFavorite, isToggling } = useFavorites();
  const favorited = isFavorited(eventId);

  const ariaLabel = isToggling
    ? "Updating favorite..."
    : favorited
    ? itemName ? `Remove ${itemName} from favorites` : "Remove from favorites"
    : itemName ? `Save ${itemName}` : "Add to favorites";

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
      aria-label={ariaLabel}
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
