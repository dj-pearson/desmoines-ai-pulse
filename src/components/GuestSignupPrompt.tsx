import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { GUEST_FAVORITES_CAP } from "@/lib/guestFavorites";
import { trackGuestFavoriteEvent } from "@/lib/guestFavoritesAnalytics";

interface GuestSignupPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many items the guest has already saved (for the "N/cap" copy). */
  savedCount?: number;
}

/**
 * Contextual signup prompt shown when a guest hits the save cap (WEB-FEAT-006).
 * This is NOT the paywall — it invites the visitor to create a FREE account so
 * their saved favorites persist and sync. Saved favorites migrate automatically
 * on signup (GuestFavoriteMigrator). Accessibility (focus trap, Escape, focus
 * restore) is provided by the Radix Dialog.
 */
export function GuestSignupPrompt({
  open,
  onOpenChange,
  savedCount = GUEST_FAVORITES_CAP,
}: GuestSignupPromptProps) {
  const handleSignupClick = () => {
    trackGuestFavoriteEvent("signup_from_wall", { saved: savedCount });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-500">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <DialogTitle className="text-lg leading-tight">
            Sign up free to keep saving
          </DialogTitle>
          <DialogDescription className="pt-1">
            You&apos;ve saved {savedCount}/{GUEST_FAVORITES_CAP} favorites. Create a
            free account to keep them and sync your saves across devices.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            asChild
            className="w-full bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600"
          >
            <Link to="/auth?mode=signup" onClick={handleSignupClick}>
              Sign up free
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full text-muted-foreground">
            <Link to="/auth" onClick={handleSignupClick}>
              Already have an account? Log in
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default GuestSignupPrompt;
