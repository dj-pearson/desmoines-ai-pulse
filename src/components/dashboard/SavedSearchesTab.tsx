import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, Loader2, Search, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSavedSearchAlerts, type SavedSearchListItem } from "@/hooks/useSavedSearchAlerts";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errorHandler";

/**
 * Dashboard "Saved searches" tab (WEB-FEAT-003, search.md WP3 items 3-5).
 *
 * Lists every saved_searches row the user has, whatever wrote it: /events,
 * /search, /search/advanced or the iOS app. Only event searches can alert (the
 * nightly job scans nothing else), so only they get a bell; the rest get Open
 * and Delete. Each row counts toward the plan's saved-search cap, which is why
 * none may be hidden.
 */
export function SavedSearchesTab() {
  const {
    searches,
    isLoading,
    alertsEnabledGlobally,
    alertsPrefUnavailable,
    alertsPrefLoading,
    toggleAlerts,
    deleteSearch,
    setAlertsPref,
  } = useSavedSearchAlerts();
  const { hasFeature, isLoading: subscriptionLoading } = useSubscription();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<SavedSearchListItem | null>(null);

  // saved-search-alerts skips rows whose owner lacks create_alerts, so a lit
  // bell for a lapsed member would promise email that never goes out.
  const alertsEntitled = hasFeature("create_alerts");
  const hasEventSearches = searches.some((s) => s.normalized.kind === "events");
  const alertsPaused = !subscriptionLoading && !alertsEntitled && hasEventSearches;

  const toggle = (s: SavedSearchListItem) => {
    const enabled = !s.alerts_enabled;
    toggleAlerts.mutate(
      { id: s.id, enabled },
      {
        onSuccess: () => toast({ title: enabled ? "Alerts on for this search" : "Alerts off for this search" }),
        onError: (error) => {
          handleError(error, { component: "SavedSearchesTab", action: "toggleAlerts" });
          toast({
            title: "Couldn't save that",
            description: "The alert for this search is unchanged. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    deleteSearch.mutate(target.id, {
      onSuccess: () => toast({ title: "Saved search deleted" }),
      onError: (error) => {
        handleError(error, { component: "SavedSearchesTab", action: "deleteSearch" });
        toast({
          title: "Couldn't delete that search",
          description: "It's still saved. Please try again.",
          variant: "destructive",
        });
      },
      onSettled: () => setPendingDelete(null),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" aria-hidden="true" />
          Saved searches &amp; alerts
        </CardTitle>
        <CardDescription>
          Watch a search from Search, or save one from the Events page, and we'll
          email you when new matching events are added.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="global-alerts" className="text-sm font-medium">
              Email me about new matches
            </Label>
            <p className="text-xs text-muted-foreground">
              {alertsPrefUnavailable
                ? "We couldn't load your setting. Reload the page before changing it."
                : "Master switch for all saved-search alert emails."}
            </p>
          </div>
          <Switch
            id="global-alerts"
            // Disabled rather than defaulted when the read failed. A switch that
            // renders ON because the query errored tells the user their alerts
            // are on when they may have turned them off (WEB-LEGAL-012).
            disabled={alertsPrefUnavailable || alertsPrefLoading || setAlertsPref.isPending}
            checked={alertsEnabledGlobally}
            onCheckedChange={(v) =>
              setAlertsPref.mutate(v, {
                onSuccess: () =>
                  toast({ title: v ? "Alerts on" : "Alerts paused" }),
                // Without this the switch silently snaps back and the user is
                // left believing a preference they never saved.
                onError: (error) => {
                  handleError(error, { component: "SavedSearchesTab", action: "setAlertsPref" });
                  toast({
                    title: "Couldn't save that",
                    description: "Your alert setting is unchanged. Please try again.",
                    variant: "destructive",
                  });
                },
              })
            }
          />
        </div>

        {alertsPaused && (
          <p className="rounded-lg border p-3 text-sm">
            Alerts paused: email alerts come with an Insider plan, and your account
            doesn't have one right now.{" "}
            <Link to="/pricing" className="font-medium text-primary underline underline-offset-4">
              See plans
            </Link>
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading...
          </div>
        ) : searches.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">No saved searches yet.</p>
            <Button asChild variant="outline" size="sm" className="mt-3 min-h-11">
              <Link to="/events">Browse events</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {searches.map((s) => {
              const { kind, href, label } = s.normalized;
              const isEvents = kind === "events";
              const bellPending = toggleAlerts.isPending && toggleAlerts.variables?.id === s.id;
              const bellOn = s.alerts_enabled && !alertsPaused;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <Link to={href} className="block truncate font-medium hover:underline">
                      {s.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {isEvents ? label : `${label} (not emailed)`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isEvents ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 min-w-11"
                        aria-label={`Email alerts for ${s.name}`}
                        aria-pressed={bellOn}
                        disabled={alertsPaused || subscriptionLoading || bellPending}
                        title={alertsPaused ? "Alerts paused" : undefined}
                        onClick={() => toggle(s)}
                      >
                        {bellPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : bellOn ? (
                          <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
                        ) : (
                          <BellOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </Button>
                    ) : (
                      <Button asChild variant="ghost" size="sm" className="min-h-11">
                        <Link to={href} aria-label={`Open ${s.name}`}>
                          Open
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 min-w-11"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => setPendingDelete(s)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSearch.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this saved search?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? pendingDelete.normalized.kind === "events"
                  ? `"${pendingDelete.name}" will be removed and its email alerts will stop.`
                  : `"${pendingDelete.name}" will be removed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSearch.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open until the delete settles.
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteSearch.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSearch.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default SavedSearchesTab;
