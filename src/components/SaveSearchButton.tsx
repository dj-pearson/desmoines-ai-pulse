import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useUpgradeModal } from "@/components/UpgradeModal";
import { useToast } from "@/hooks/use-toast";
import { isValidRedirectUrl } from "@/lib/redirectSafety";
import { cn } from "@/lib/utils";
import {
  useSavedSearchAlerts,
  SAVED_SEARCH_FILTER_KEYS,
  describeSavedSearch,
  SavedSearchLimitError,
  type SavedSearchFilters,
} from "@/hooks/useSavedSearchAlerts";

/**
 * "Save this search" affordance for list pages (WEB-FEAT-003). Captures the live
 * URL filter state, gates free users behind the contextual paywall (WEB-FEAT-001),
 * and persists via the tier-limited create RPC (Insider 10 / VIP unlimited,
 * enforced server-side).
 */
/**
 * Where to come back to after signing in: this page with its filters. It was a
 * hardcoded `/events`, so a visitor who set four filters and tapped Save came
 * back from sign-in to an unfiltered list with nothing to save. The Auth page
 * validates `redirect` again; this falls back to the bare path when the query
 * would fail that check (a literal `%` in a search, for one).
 */
function authRedirectTarget(pathname: string, search: string): string {
  const full = `${pathname}${search}`;
  if (isValidRedirectUrl(full)) return full;
  return isValidRedirectUrl(pathname) ? pathname : "/events";
}

export function SaveSearchButton({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon-only below `sm`, for one-row bars on a phone. */
  compact?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { hasFeature } = useSubscription();
  const { openUpgradeModal, UpgradeModalComponent } = useUpgradeModal();
  const { saveSearch } = useSavedSearchAlerts();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const currentFilters = (): SavedSearchFilters => {
    const f: SavedSearchFilters = {};
    for (const key of SAVED_SEARCH_FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) f[key] = v;
    }
    return f;
  };

  const handleClick = () => {
    if (!isAuthenticated) {
      navigate(`/auth?redirect=${encodeURIComponent(authRedirectTarget(pathname, search))}`);
      return;
    }
    if (!hasFeature("save_searches")) {
      openUpgradeModal("save_searches", "insider");
      return;
    }
    setName(describeSavedSearch(currentFilters()));
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      await saveSearch.mutateAsync({ name: name.trim() || "My saved search", filters: currentFilters() });
      toast({ title: "Search saved", description: "We'll email you when new events match." });
      setOpen(false);
    } catch (err) {
      if (err instanceof SavedSearchLimitError) {
        toast({
          title: "Saved-search limit reached",
          description: "Upgrade to VIP for unlimited saved searches.",
          variant: "destructive",
        });
        setOpen(false);
        openUpgradeModal("save_searches", "vip");
        return;
      }
      toast({ title: "Couldn't save search", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className={cn("h-11", compact && "w-11 px-0 sm:w-auto sm:px-3", className)}
        aria-label={compact ? "Save search" : undefined}
      >
        <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
        <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Save search</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              Get an email when new events match {describeSavedSearch(currentFilters())}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="saved-search-name">Name</Label>
            <Input
              id="saved-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekend live music"
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveSearch.isPending}>
              {saveSearch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
              Save &amp; alert me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeModalComponent />
    </>
  );
}

export default SaveSearchButton;
