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
import { useSyncExternalStore } from "react";
import { useAuthFlags } from "@/contexts/AuthContext";
import { openPaywall } from "@/lib/paywallStore";
import { stashPendingAction } from "@/lib/authReturn";
import { signUpHref } from "@/components/header/navigationConfig";
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
  /**
   * Report the outcome to the caller instead of a toast. A modal (the Home
   * quick view) needs this: Radix makes everything outside an open dialog
   * inert, the toaster included, so a toast's "Sign up" could be seen and not
   * pressed, and a screen reader heard nothing.
   */
  onResult?: (result: FavoriteResult) => void;
}

/** What a tap did, for a caller that shows it itself (see `onResult`). */
export type FavoriteResult =
  | { kind: "removed" }
  | { kind: "guest-saved"; count: number; cap: number; signUpHref: string }
  | { kind: "guest-cap"; cap: number; signUpHref: string }
  | { kind: "needs-upgrade" };

type ViewProps = {
  favorited: boolean;
  isToggling: boolean;
  onToggle: () => void;
} & Pick<FavoriteButtonProps, "variant" | "size" | "className" | "showText" | "itemName">;

type DataProps = Omit<FavoriteButtonProps, "eventId" | "contentType" | "contentId">;

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

/**
 * The plan limit opens the one app-level paywall (GlobalUpgradeModal) rather
 * than a modal per button, so the dialog code isn't in every list page's chunk.
 */
function reportNeedsUpgrade(onResult: DataProps["onResult"]) {
  openPaywall("unlimited_favorites");
  onResult?.({ kind: "needs-upgrade" });
}

function EventFavoriteButton({
  eventId,
  onResult,
  ...rest
}: DataProps & { eventId: string }) {
  const { isFavorited, toggleFavorite, isToggling } = useFavorites();
  const favorited = isFavorited(eventId);
  return (
    <FavoriteButtonView
      favorited={favorited}
      isToggling={isToggling}
      onToggle={() => {
        // No toast here. useFavorites toasts from the mutation's onSuccess
        // and onError, after the write resolves; a success toast here fired
        // before the insert and doubled up with it (and lied on failure).
        const result = toggleFavorite(eventId);
        if (result.needsUpgrade) reportNeedsUpgrade(onResult);
      }}
      {...rest}
    />
  );
}

function ContentFavoriteButton({
  contentType,
  contentId,
  onResult,
  ...rest
}: DataProps & {
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
        } else if (result.needsUpgrade) {
          reportNeedsUpgrade(onResult);
        }
      }}
      {...rest}
    />
  );
}

/**
 * Guest (unauthenticated) variant — saves to safeStorage up to a small cap,
 * then prompts signup instead of the paywall. (WEB-FEAT-006)
 */
function GuestFavoriteButton({
  guestType,
  id,
  onResult,
  ...rest
}: DataProps & {
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
        const href = currentSignUpHref();
        if (result.action === "added") {
          logFavoriteFunnelEvent("guest_save", guestType, id, null, {
            count: result.count,
          });
          if (onResult) {
            onResult({ kind: "guest-saved", count: result.count, cap: GUEST_FAVORITE_CAP, signUpHref: href });
            return;
          }
          toast.success(
            `Saved ${result.count}/${GUEST_FAVORITE_CAP} — sign up free to keep saving`,
            {
              id: `guest-fav-${guestType}-${id}`,
              action: { label: "Sign up", onClick: () => goToSignup() },
            }
          );
        } else if (result.action === "removed") {
          if (onResult) {
            onResult({ kind: "removed" });
            return;
          }
          toast.success("Removed from favorites", {
            id: `guest-fav-${guestType}-${id}`,
          });
        } else {
          // Cap reached — contextual signup prompt (NOT the paywall).
          logFavoriteFunnelEvent("guest_save_wall_hit", guestType, id, null, {
            count: result.count,
          });
          // Hold this tap so it can be replayed once the account exists.
          stashPendingAction({ type: "favorite", payload: { type: guestType, id } });
          if (onResult) {
            onResult({ kind: "guest-cap", cap: GUEST_FAVORITE_CAP, signUpHref: href });
            return;
          }
          toast("Sign up free to keep saving", {
            id: "guest-fav-wall",
            // True because useGuestFavoriteMigration replays the stashed tap
            // after sign-up, and the guest cap sits below the free plan limit.
            description: `You've saved ${GUEST_FAVORITE_CAP} items as a guest. Create a free account and this one is saved too.`,
            action: { label: "Sign up", onClick: () => goToSignup() },
          });
        }
      }}
      {...rest}
    />
  );
}

function currentSignUpHref(): string {
  if (typeof window === "undefined") return signUpHref("/");
  return signUpHref(window.location.pathname, window.location.search);
}

function goToSignup() {
  if (typeof window !== "undefined") {
    window.location.href = currentSignUpHref();
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
