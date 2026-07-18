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
import { useState, useSyncExternalStore } from "react";
import { useAuthFlags } from "@/contexts/AuthContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  subscribeGuestFavorites,
  isGuestFavorited,
  toggleGuestFavorite,
  GUEST_FAVORITE_CAP,
  type GuestFavoriteType,
} from "@/lib/guestFavorites";
import { logFavoriteFunnelEvent } from "@/lib/favoriteAnalytics";

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
      // tap-area-44 rather than a bigger button: this sits on top of card
      // imagery in a fixed corner, so growing it would cover the photo and
      // shift the badges around it. The overlay only applies on touch
      // pointers (WEB-QA-009).
      className={cn("tap-area-44", className)}
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  return (
    <>
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
          } else if (result.needsUpgrade) {
            setShowUpgrade(true);
          }
        }}
        {...rest}
      />
      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="unlimited_favorites"
      />
    </>
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  return (
    <>
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
          } else if (result.needsUpgrade) {
            setShowUpgrade(true);
          }
        }}
        {...rest}
      />
      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="unlimited_favorites"
      />
    </>
  );
}

/**
 * Guest (unauthenticated) variant — saves to safeStorage up to a small cap,
 * then prompts signup instead of the paywall. (WEB-FEAT-006)
 */
function GuestFavoriteButton({
  guestType,
  id,
  ...rest
}: Omit<FavoriteButtonProps, "eventId" | "contentType" | "contentId"> & {
  guestType: GuestFavoriteType;
  id: string;
}) {
  const favorites = useSyncExternalStore(
    subscribeGuestFavorites,
    () => isGuestFavorited(guestType, id),
    () => false
  );

  return (
    <FavoriteButtonView
      favorited={favorites}
      isToggling={false}
      onToggle={() => {
        const result = toggleGuestFavorite(guestType, id);
        if (result.action === "added") {
          logFavoriteFunnelEvent("guest_save", guestType, id, null, {
            count: result.count,
          });
          toast.success(
            `Saved ${result.count}/${GUEST_FAVORITE_CAP} — sign up free to keep saving`,
            {
              id: `guest-fav-${guestType}-${id}`,
              action: { label: "Sign up", onClick: () => goToSignup() },
            }
          );
        } else if (result.action === "removed") {
          toast.success("Removed from favorites", {
            id: `guest-fav-${guestType}-${id}`,
          });
        } else {
          // Cap reached — contextual signup prompt (NOT the paywall).
          logFavoriteFunnelEvent("guest_save_wall_hit", guestType, id, null, {
            count: result.count,
          });
          toast("Sign up free to keep saving", {
            id: "guest-fav-wall",
            description: `You've saved ${GUEST_FAVORITE_CAP} items as a guest. Create a free account to save more.`,
            action: { label: "Sign up", onClick: () => goToSignup() },
          });
        }
      }}
      {...rest}
    />
  );
}

function goToSignup() {
  if (typeof window !== "undefined") {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/auth?redirect=${next}`;
  }
}

export function FavoriteButton({
  eventId,
  contentType,
  contentId,
  ...rest
}: FavoriteButtonProps) {
  const { isAuthenticated } = useAuthFlags();
  const guestType: GuestFavoriteType =
    contentType && contentType !== "event" ? contentType : "event";
  const id = contentId ?? eventId;

  if (!isAuthenticated) {
    if (!id) return null;
    return <GuestFavoriteButton guestType={guestType} id={id} {...rest} />;
  }

  if (contentType && contentType !== "event") {
    if (!id) return null;
    return <ContentFavoriteButton contentType={contentType} contentId={id} {...rest} />;
  }
  if (!eventId) return null;
  return <EventFavoriteButton eventId={eventId} {...rest} />;
}
