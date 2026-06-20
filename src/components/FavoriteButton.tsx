import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFavorites } from "@/hooks/useFavorites";
import { useContentFavorites, type FavoriteContentType } from "@/hooks/useContentFavorites";
import { useAuthStatus } from "@/hooks/useAuth";
import { useGuestFavorites, type GuestFavoriteType } from "@/hooks/useGuestFavorites";
import { trackConversion } from "@/lib/conversionTracking";
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
  const navigate = useNavigate();

  // Both hooks are called unconditionally (rules of hooks); the content hook is
  // disabled for the events path and vice-versa. For guests, neither query fires
  // (they're user-gated) — guest saves live in safeStorage via useGuestFavorites.
  const eventFav = useFavorites();
  const contentFav = useContentFavorites(
    contentType === "event" ? null : contentType,
  );
  const { isAuthenticated } = useAuthStatus();
  const guest = useGuestFavorites();

  const isEvent = contentType === "event";
  const favorited = !isAuthenticated
    ? guest.isGuestFavorited(contentType, id)
    : isEvent
    ? eventFav.isFavorited(id)
    : contentFav.isFavorited(id);
  const isToggling = isAuthenticated
    ? isEvent
      ? eventFav.isToggling
      : contentFav.isToggling
    : false;

  const ariaLabel = isToggling
    ? "Updating favorite..."
    : favorited
    ? itemName ? `Remove ${itemName} from favorites` : "Remove from favorites"
    : itemName ? `Save ${itemName}` : "Add to favorites";

  const handleGuestToggle = () => {
    const result = guest.toggleGuestFavorite({
      contentType: contentType as GuestFavoriteType,
      contentId: id,
      name: itemName,
    });
    if (result.status === "cap_reached") {
      trackConversion("guest_wall_hit", { contentType, contentId: id });
      toast("Sign up free to keep saving", {
        id: "guest-fav-wall",
        description: `You've used your ${guest.limit} free saves. Create a free account to save more — it's instant.`,
        action: { label: "Sign up", onClick: () => navigate("/auth") },
      });
    } else if (result.status === "added") {
      trackConversion("guest_save", { contentType, contentId: id });
      toast.success(`Saved (${result.count}/${guest.limit})`, { id: `fav-${contentType}-${id}` });
    } else {
      toast.success("Removed from favorites", { id: `fav-${contentType}-${id}` });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        hapticTap();
        if (!isAuthenticated) {
          handleGuestToggle();
          return;
        }
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
