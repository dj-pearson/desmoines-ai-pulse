import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaywallModal } from "@/components/PaywallModal";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { trackSavedSearchEvent } from "@/lib/savedSearchAnalytics";
import { toast } from "sonner";

interface SaveSearchButtonProps {
  /** Owning list tab — e.g. "events", "restaurants". Stored with the search. */
  tab: string;
  /** Current free-text query for the list. */
  query: string;
  /** Extra classes for the trigger button (so each page can theme it). */
  className?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

/**
 * "Save this search" affordance (WEB-FEAT-003) — web parity with the iOS
 * SaveSearchButton. Self-contained: owns the name dialog, the contextual
 * paywall (free/locked users), and the toast. Captures the live list-page URL
 * params at click time so the saved search can deep-link back to the exact
 * filtered view (WEB-UX-001) and the nightly digest can match new events.
 */
export function SaveSearchButton({
  tab,
  query,
  className,
  variant = "secondary",
  size = "sm",
}: SaveSearchButtonProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { createSavedSearch, count, limit } = useSavedSearches();
  const [searchParams] = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleClick = () => {
    trackSavedSearchEvent("save_prompt", tier, { tab });

    const hasCriteria =
      query.trim().length > 0 || searchParams.toString().length > 0;
    if (!hasCriteria) {
      toast.info("Add a search or filter first, then save it.");
      return;
    }

    if (!user) {
      toast.info("Sign in to save searches and get alerts.");
      navigate("/auth");
      return;
    }

    // Free (and any non-entitled) tier → contextual paywall.
    if (limit === 0) {
      trackSavedSearchEvent("paywall", tier, { tab });
      setPaywallOpen(true);
      return;
    }

    setName(query.trim() || `My ${tab} search`);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await createSavedSearch({
        name,
        query,
        tab,
        params: searchParams.toString(),
      });

      if (result.success) {
        trackSavedSearchEvent("saved", tier, { tab });
        toast.success("Search saved — we'll alert you about new matches.");
        setDialogOpen(false);
      } else if (result.needsUpgrade) {
        trackSavedSearchEvent("paywall", tier, { tab });
        setDialogOpen(false);
        setPaywallOpen(true);
      } else if (result.limitReached) {
        trackSavedSearchEvent("limit_reached", tier, { tab, count, limit });
        setDialogOpen(false);
        setPaywallOpen(true);
      } else {
        toast.error("Couldn't save your search. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        aria-label="Save this search"
      >
        <Bookmark className="h-3.5 w-3.5 mr-1.5" />
        Save search
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              Jump back in anytime — and we'll email you when new matching
              events are added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="saved-search-name">Name</Label>
            <Input
              id="saved-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Free weekend events"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) handleSave();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save search"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        context="save_searches"
      />
    </>
  );
}

export default SaveSearchButton;
