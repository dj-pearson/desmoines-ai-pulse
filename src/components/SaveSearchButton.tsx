import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
export function SaveSearchButton({ className }: { className?: string }) {
  const [searchParams] = useSearchParams();
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
      navigate("/auth?redirect=/events");
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
      <Button variant="outline" size="sm" onClick={handleClick} className={className}>
        <BookmarkPlus className="h-4 w-4" />
        Save search
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
