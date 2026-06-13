import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/capacitorUtils";
import { toast } from "sonner";
import { PaywallModal } from "@/components/PaywallModal";

interface FavoriteButtonProps {
  eventId: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showText?: boolean;
  /** Name of the item being saved — produces a specific label like "Save {name}" for screen readers. */
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
  const [showPaywall, setShowPaywall] = useState(false);

  const ariaLabel = isToggling
    ? "Updating favorite..."
    : favorited
      ? itemName
        ? `Remove ${itemName} from favorites`
        : "Remove from favorites"
      : itemName
        ? `Save ${itemName}`
        : "Add to favorites";

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={(e) => {
          e.stopPropagation();
          hapticTap();
          const wasFavorited = favorited;
          const result = toggleFavorite(eventId);
          // 4th save attempt on a free account → contextual paywall, not a
          // success toast (WEB-FEAT-001 favorites cap).
          if (result.needsUpgrade) {
            setShowPaywall(true);
            return;
          }
          if (result.success) {
            toast.success(
              wasFavorited ? "Removed from favorites" : "Added to favorites",
              { id: `fav-${eventId}` },
            );
          }
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
      <PaywallModal
        open={showPaywall}
        onOpenChange={setShowPaywall}
        context="unlimited_favorites"
      />
    </>
  );
}
