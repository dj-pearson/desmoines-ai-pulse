import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BellPlus, Loader2 } from "lucide-react";
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
import { useUpgradeModal } from "@/components/UpgradeModal";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useSavedSearchAlerts, SavedSearchLimitError } from "@/hooks/useSavedSearchAlerts";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errorHandler";
import { isValidRedirectUrl } from "@/lib/redirectSafety";
import { planWatchedSearch, type WatchSearchAppliedFilter } from "@/lib/savedSearchFilters";
import { cn } from "@/lib/utils";

/**
 * "Watch this search" on /search (docs/page-plans/search.md WP3 item 2).
 *
 * Saves the parts of the search the nightly saved-search-alerts job can match
 * - keywords, event category, free - through the same create_event_saved_search
 * RPC the /events Save button uses, so the plan cap and the email pipeline are
 * the ones that already exist. Everything else the search applied (dates,
 * area, cuisine) is named in the dialog as not part of the alert rather than
 * silently dropped.
 */

export interface WatchSearchButtonProps {
  /** The raw ?q= text. Used as the keywords only when nlp-search reported none. */
  query: string;
  appliedFilters: readonly WatchSearchAppliedFilter[];
  /** Render only when the search includes events. */
  hasEvents: boolean;
  className?: string;
}

/** Where to come back to after signing in. The Auth page validates it again. */
function authRedirectTarget(pathname: string, search: string): string {
  const full = `${pathname}${search}`;
  if (isValidRedirectUrl(full)) return full;
  return isValidRedirectUrl(pathname) ? pathname : "/search";
}

export function WatchSearchButton({ hasEvents, ...rest }: WatchSearchButtonProps) {
  // Split so a search without events runs none of the hooks below (two
  // saved-search reads per signed-in visit otherwise).
  if (!hasEvents) return null;
  return <WatchSearchControl {...rest} />;
}

function WatchSearchControl({ query, appliedFilters, className }: Omit<WatchSearchButtonProps, "hasEvents">) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { hasFeature, isLoading: subscriptionLoading } = useSubscription();
  const { openUpgradeModal, UpgradeModalComponent } = useUpgradeModal();
  const { saveSearch } = useSavedSearchAlerts();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const plan = planWatchedSearch(query, appliedFilters);

  const handleClick = () => {
    if (!isAuthenticated) {
      navigate(`/auth?redirect=${encodeURIComponent(authRedirectTarget(pathname, search))}`);
      return;
    }
    if (!hasFeature("save_searches")) {
      openUpgradeModal("save_searches", "insider");
      return;
    }
    setName(plan.filters.q ? `Events: ${plan.filters.q}` : "New events");
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      await saveSearch.mutateAsync({ name: name.trim() || "My saved search", filters: plan.filters });
      toast({ title: "Watching this search", description: "We'll email you when new events match." });
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
      handleError(err, { component: "WatchSearchButton", action: "saveSearch" });
      toast({
        title: "Couldn't save this search",
        description: "Nothing was saved. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        // A paying member clicking before their plan has loaded would otherwise
        // be shown the upgrade prompt.
        disabled={isAuthenticated && subscriptionLoading}
        className={cn("min-h-11", className)}
      >
        <BellPlus className="h-4 w-4" aria-hidden="true" />
        Watch this search
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Watch this search</DialogTitle>
            <DialogDescription>
              {plan.covers} We'll email you when new ones are added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Restaurants and places aren't included in email alerts yet.</p>
            {plan.notCovered.length > 0 && (
              <p>Not part of this alert: {plan.notCovered.join(", ")}.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="watch-search-name">Name</Label>
            <Input
              id="watch-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="min-h-11" onClick={handleSave} disabled={saveSearch.isPending}>
              {saveSearch.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BellPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Email me new matches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UpgradeModalComponent />
    </>
  );
}

export type { WatchSearchAppliedFilter };
