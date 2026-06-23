import { Link } from "react-router-dom";
import { Bell, BellOff, Loader2, Search, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useSavedSearchAlerts,
  buildSavedSearchUrl,
  describeSavedSearch,
  type SavedSearchFilters,
} from "@/hooks/useSavedSearchAlerts";

/**
 * Dashboard "Saved searches" tab (WEB-FEAT-003): lists the user's saved event
 * searches with a per-search alert toggle + delete + deep link, plus a global
 * "email me about matches" switch.
 */
export default function SavedSearchesTab() {
  const {
    searches,
    isLoading,
    alertsEnabledGlobally,
    toggleAlerts,
    deleteSearch,
    setAlertsPref,
  } = useSavedSearchAlerts();
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Saved searches &amp; alerts
        </CardTitle>
        <CardDescription>
          Save a search from the Events page and we'll email you when new matching
          events are added.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="global-alerts" className="text-sm font-medium">
              Email me about new matches
            </Label>
            <p className="text-xs text-muted-foreground">
              Master switch for all saved-search alert emails.
            </p>
          </div>
          <Switch
            id="global-alerts"
            checked={alertsEnabledGlobally}
            onCheckedChange={(v) =>
              setAlertsPref.mutate(v, {
                onSuccess: () =>
                  toast({ title: v ? "Alerts on" : "Alerts paused" }),
              })
            }
          />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : searches.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No saved searches yet.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/events">Browse events</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {searches.map((s) => {
              const filters = (s.filters ?? {}) as SavedSearchFilters;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={buildSavedSearchUrl(filters)}
                      className="font-medium hover:underline truncate block"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {describeSavedSearch(filters)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={s.alerts_enabled ? "Turn alerts off" : "Turn alerts on"}
                      onClick={() => toggleAlerts.mutate({ id: s.id, enabled: !s.alerts_enabled })}
                    >
                      {s.alerts_enabled ? (
                        <Bell className="h-4 w-4 text-primary" />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete saved search"
                      onClick={() =>
                        deleteSearch.mutate(s.id, {
                          onSuccess: () => toast({ title: "Saved search deleted" }),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
