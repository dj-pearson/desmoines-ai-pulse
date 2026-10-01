import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
import { stashPendingAction, takePendingAction } from "@/lib/authReturn";
import { handleError } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import type * as SavedSearchModule from "@/hooks/useSavedSearchAlerts";

/**
 * "Save this search" affordance for list pages (WEB-FEAT-003). Captures the live
 * URL filter state, gates free users behind the contextual paywall (WEB-FEAT-001),
 * and persists via the tier-limited create RPC (Insider 10 / VIP unlimited,
 * enforced server-side).
 *
 * The dialog and the saved-search hook load on first click (events-pass2 WP2
 * item 9). The hook's module validates with zod (about 12KB gzipped), and a
 * static import put zod in the EventsPage chunk for a button most visitors
 * never press. It also ran two queries (saved_searches, email preferences) on
 * every /events load for a signed-in reader.
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

/** What `stashPendingAction` holds for a signed-out Save tap. */
interface PendingSaveSearch {
  path: string;
}

function isPendingSaveSearch(value: unknown): value is PendingSaveSearch {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

/**
 * URL keys the hub filters on that saved-search alerts can't match yet, and how
 * the dialog names them. `from`/`to`/`area` drop out of this list on their own
 * once Search adds them to SAVED_SEARCH_FILTER_KEYS (search.md hand-off);
 * `near` needs a stored origin, which no alert has.
 */
const UNMATCHED_KEYS: readonly { keys: readonly string[]; label: string }[] = [
  { keys: ["from", "to"], label: "the dates you picked" },
  { keys: ["area"], label: "the area" },
  { keys: ["near"], label: "near me" },
];

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

interface SaveSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchParams: URLSearchParams;
  onLimitReached: () => void;
}

/** The dialog, built around the lazily loaded hook module. */
function createSaveSearchDialog(mod: typeof SavedSearchModule) {
  const { useSavedSearchAlerts, SAVED_SEARCH_FILTER_KEYS, describeSavedSearch, SavedSearchLimitError } = mod;
  type Filters = SavedSearchModule.SavedSearchFilters;
  const savedKeys: readonly string[] = SAVED_SEARCH_FILTER_KEYS;

  return function SaveSearchDialog({ open, onOpenChange, searchParams, onLimitReached }: SaveSearchDialogProps) {
    const { saveSearch } = useSavedSearchAlerts();
    const { toast } = useToast();

    const filters: Filters = {};
    for (const key of SAVED_SEARCH_FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) filters[key] = v;
    }
    const description = describeSavedSearch(filters);

    const unmatched = UNMATCHED_KEYS.filter(
      ({ keys }) => keys.some((k) => searchParams.get(k)) && !keys.every((k) => savedKeys.includes(k))
    ).map(({ label }) => label);

    const [name, setName] = useState(description);
    useEffect(() => {
      if (open) setName(description);
      // Only on open: re-seeding while typing would overwrite the name.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleSave = async () => {
      try {
        await saveSearch.mutateAsync({ name: name.trim() || "My saved search", filters });
        toast({ title: "Search saved", description: "We'll email you when new events match." });
        onOpenChange(false);
      } catch (err) {
        if (err instanceof SavedSearchLimitError) {
          toast({
            title: "Saved-search limit reached",
            description: "Upgrade to VIP for unlimited saved searches.",
            variant: "destructive",
          });
          onOpenChange(false);
          onLimitReached();
          return;
        }
        handleError(err, { component: "SaveSearchButton", action: "save" });
        toast({
          title: "Couldn't save search",
          description: err instanceof Error ? err.message : "Try again in a moment.",
          variant: "destructive",
        });
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>Get an email when new events match {description}.</DialogDescription>
          </DialogHeader>
          {unmatched.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Alerts can't match {joinWords(unmatched)} yet, so they'll use the rest of this search.
            </p>
          )}
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
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveSearch.isPending}>
              {saveSearch.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Save &amp; alert me
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };
}

function loadDialogModule() {
  return import("@/hooks/useSavedSearchAlerts");
}

type SaveSearchDialogComponent = (props: SaveSearchDialogProps) => JSX.Element | null;

const LazySaveSearchDialog = lazy(() =>
  loadDialogModule().then(
    (mod): { default: SaveSearchDialogComponent } => ({ default: createSaveSearchDialog(mod) }),
    (error: unknown): { default: SaveSearchDialogComponent } => {
      // A failed chunk (a deploy mid-session, a dropped connection) must not
      // take the sticky bar down with it.
      handleError(error, { component: "SaveSearchButton", action: "load-dialog" });
      return { default: () => null };
    }
  )
);

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
  const { hasFeature, isLoading: subscriptionLoading } = useSubscription();
  const { openUpgradeModal, UpgradeModalComponent } = useUpgradeModal();

  const [open, setOpen] = useState(false);
  // Mounted on first open and kept, so closing can animate and reopening is instant.
  const [dialogLoaded, setDialogLoaded] = useState(false);

  const openDialog = () => {
    if (!hasFeature("save_searches")) {
      openUpgradeModal("save_searches", "insider");
      return;
    }
    setDialogLoaded(true);
    setOpen(true);
  };

  const handleClick = () => {
    if (!isAuthenticated) {
      // Finish the tap after sign-in (account.md hand-off): the replay below
      // opens the dialog when the reader lands back on this page.
      stashPendingAction({ type: "save-search", payload: { path: pathname } satisfies PendingSaveSearch });
      navigate(`/auth?redirect=${encodeURIComponent(authRedirectTarget(pathname, search))}`);
      return;
    }
    openDialog();
  };

  // Replay a Save tapped while signed out, once auth and the tier are known.
  const replayed = useRef(false);
  useEffect(() => {
    if (replayed.current || !isAuthenticated || subscriptionLoading) return;
    replayed.current = true;
    const pending = takePendingAction("save-search");
    if (!pending || !isPendingSaveSearch(pending.payload)) return;
    if (pending.payload.path !== pathname) {
      // Signed in somewhere else; leave it for the page it came from.
      stashPendingAction(pending);
      return;
    }
    openDialog();
    // openDialog reads the latest hasFeature; this runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, subscriptionLoading, pathname]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        // Start the download a beat early for someone about to tap.
        onPointerEnter={isAuthenticated ? () => void loadDialogModule().catch(() => undefined) : undefined}
        className={cn("h-11", compact && "w-11 px-0 sm:w-auto sm:px-3", className)}
        aria-label={compact ? "Save search" : undefined}
      >
        <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
        <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Save search</span>
      </Button>

      {dialogLoaded && (
        <Suspense fallback={null}>
          <LazySaveSearchDialog
            open={open}
            onOpenChange={setOpen}
            searchParams={searchParams}
            onLimitReached={() => openUpgradeModal("save_searches", "vip")}
          />
        </Suspense>
      )}

      <UpgradeModalComponent />
    </>
  );
}

export default SaveSearchButton;
