import { Button } from "@/components/ui/button";
import { Heart, Loader2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import {
  useContentFavorites,
  type FavoriteContentType,
} from "@/hooks/useContentFavorites";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/capacitorUtils";
import { toast } from "sonner";

interface FavoriteButtonProps {
  /** Event id (legacy/default path). Required when no contentType is given. */
  eventId?: string;
  /**
   * Content type for non-event favorites (restaurant/attraction/hotel/
   * playground). When set, `contentId` (or `eventId` as a fallback) is used.
   */
  contentType?: FavoriteContentType | "event";
  /** Content id for non-event favorites. Falls back to `eventId`. */
  contentId?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  showText?: boolean;
  /** Item name for a specific accessible label ("Save {name}"). */
  itemName?: string;
}

type ViewProps = {
  favorited: boolean;
  isToggling: boolean;
  onToggle: () => void;
} & Pick<FavoriteButtonProps, "variant" | "size" | "className" | "showText" | "itemName">;

/** Shared presentational button — no data dependency. */
function FavoriteButtonView({
  favorited,
  isToggling,
  onToggle,
  variant = "ghost",
  size = "icon",
  className,
  showText = false,
  itemName,
}: ViewProps) {
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
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        hapticTap();
        onToggle();
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
      {showText && <span className="ml-2">{favorited ? "Saved" : "Save"}</span>}
    </Button>
  );
}

function EventFavoriteButton({
  eventId,
  ...rest
}: Omit<FavoriteButtonProps, "contentType" | "contentId" | "eventId"> & {
  eventId: string;
}) {
  const { isFavorited, toggleFavorite, isToggling } = useFavorites();
  const favorited = isFavorited(eventId);
  return (
    <FavoriteButtonView
      favorited={favorited}
      isToggling={isToggling}
      onToggle={() => {
        const wasFavorited = favorited;
        const result = toggleFavorite(eventId);
        if (result.success) {
          toast.success(
            wasFavorited ? "Removed from favorites" : "Added to favorites",
            { id: `fav-${eventId}` }
          );
        }
      }}
      {...rest}
    />
  );
}

function ContentFavoriteButton({
  contentType,
  contentId,
  ...rest
}: Omit<FavoriteButtonProps, "eventId" | "contentType"> & {
  contentType: FavoriteContentType;
  contentId: string;
}) {
  const { isFavorited, toggleFavorite, isToggling } =
    useContentFavorites(contentType);
  const favorited = isFavorited(contentId);
  return (
    <FavoriteButtonView
      favorited={favorited}
      isToggling={isToggling}
      onToggle={() => {
        const wasFavorited = favorited;
        const result = toggleFavorite(contentId);
        if (result.success) {
          toast.success(
            wasFavorited ? "Removed from favorites" : "Added to favorites",
            { id: `fav-${contentType}-${contentId}` }
          );
        }
      }}
      {...rest}
    />
  );
}

export function FavoriteButton({
  eventId,
  contentType,
  contentId,
  ...rest
}: FavoriteButtonProps) {
  if (contentType && contentType !== "event") {
    const id = contentId ?? eventId;
    if (!id) return null;
    return <ContentFavoriteButton contentType={contentType} contentId={id} {...rest} />;
  }
  if (!eventId) return null;
  return <EventFavoriteButton eventId={eventId} {...rest} />;
}
