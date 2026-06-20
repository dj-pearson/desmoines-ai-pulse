import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useContentFavorites, type FavoriteContentType } from "@/hooks/useContentFavorites";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/capacitorUtils";
import { toast } from "sonner";

interface FavoriteButtonProps {
  /** Event id — kept for backward compatibility with existing event call sites. */
  eventId?: string;
  /** Content type. Defaults to "event" so existing `eventId` usage is unchanged. */
  contentType?: "event" | FavoriteContentType;
  /** Content id for non-event types (restaurant/attraction/playground). */
  contentId?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showText?: boolean;
  /** Item name for a specific accessible label ("Save {name}"). */
  itemName?: string;
}

export function FavoriteButton({
  eventId,
  contentType = "event",
  contentId,
  variant = "ghost",
  size = "icon",
  className,
  showText = false,
  itemName,
}: FavoriteButtonProps) {
  const id = contentId ?? eventId ?? "";

  // Both hooks are called unconditionally (rules of hooks); the content hook is
  // disabled for the events path and vice-versa.
  const eventFav = useFavorites();
  const contentFav = useContentFavorites(
    contentType === "event" ? null : contentType,
  );

  const isEvent = contentType === "event";
  const favorited = isEvent ? eventFav.isFavorited(id) : contentFav.isFavorited(id);
  const isToggling = isEvent ? eventFav.isToggling : contentFav.isToggling;

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
        e.preventDefault();
        hapticTap();
        const wasFavorited = favorited;
        if (isEvent) {
          eventFav.toggleFavorite(id);
        } else {
          contentFav.toggleFavorite(id);
        }
        toast.success(wasFavorited ? "Removed from favorites" : "Added to favorites", {
          id: `fav-${contentType}-${id}`,
        });
      }}
      disabled={isToggling}
      className={cn(className)}
      aria-label={ariaLabel}
      aria-pressed={favorited}
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
