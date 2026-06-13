import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bookmark, Bell, Trash2, ExternalLink, Sparkles } from "lucide-react";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { trackSavedSearchEvent } from "@/lib/savedSearchAnalytics";
import { toast } from "sonner";

/** Map a saved-search tab to its public list route. */
const TAB_PATHS: Record<string, string> = {
  events: "/events",
  restaurants: "/restaurants",
  attractions: "/attractions",
};

function buildDeepLink(tab: string, params: string, query: string): string {
  const base = TAB_PATHS[tab] ?? "/events";
  if (params) return `${base}?${params}`;
  if (query) return `${base}?q=${encodeURIComponent(query)}`;
  return base;
}

/**
 * Dashboard panel listing the user's saved searches with per-search alert
 * toggles, a deep link back to the filtered view, and delete (WEB-FEAT-003).
 * Free users (limit 0) see an upgrade prompt instead of an empty list.
 */
export function SavedSearchesCard() {
  const {
    savedSearches,
    isLoading,
    limit,
    count,
    remaining,
    toggleAlerts,
    deleteSavedSearch,
    tier,
  } = useSavedSearches();

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleAlerts(id, enabled);
      trackSavedSearchEvent("alert_toggled", tier, { enabled });
      toast.success(enabled ? "Alerts on for this search" : "Alerts off");
    } catch {
      toast.error("Couldn't update alerts. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedSearch(id);
      trackSavedSearchEvent("deleted", tier);
      toast.success("Saved search deleted");
    } catch {
      toast.error("Couldn't delete. Please try again.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-primary" />
              Saved Searches
            </CardTitle>
            <CardDescription>
              Save a search from any list page and get an email when new matches
              are added.
            </CardDescription>
          </div>
          {limit !== 0 && (
            <Badge variant="secondary" className="whitespace-nowrap">
              {limit === -1 ? `${count} saved` : `${count} / ${limit}`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {limit === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Saved searches are an Insider feature</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Upgrade to save your favorite searches and get alerted about new
              matching events automatically.
            </p>
            <Button
              asChild
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              <Link to="/pricing?plan=insider">Upgrade to Insider</Link>
            </Button>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Loading your saved searches…
          </div>
        ) : savedSearches.length === 0 ? (
          <div className="text-center py-8">
            <Bookmark className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No saved searches yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Browse events and tap “Save search” to start tracking new matches.
            </p>
            <Button asChild variant="outline">
              <Link to="/events">Browse Events</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {remaining !== "unlimited" && (
              <p className="text-xs text-muted-foreground">
                {remaining} saved search{remaining === 1 ? "" : "es"} remaining on your plan.
              </p>
            )}
            {savedSearches.map((search) => {
              const deepLink = buildDeepLink(search.tab, search.params, search.query);
              const switchId = `alerts-${search.id}`;
              return (
                <div
                  key={search.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{search.name}</h4>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {search.tab}
                      </Badge>
                    </div>
                    {search.query && (
                      <p className="text-xs text-muted-foreground truncate">
                        “{search.query}”
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      <Switch
                        id={switchId}
                        checked={search.alertsEnabled}
                        onCheckedChange={(v) => handleToggle(search.id, v)}
                        aria-label={`Alerts for ${search.name}`}
                      />
                      <Label htmlFor={switchId} className="sr-only">
                        Alerts for {search.name}
                      </Label>
                    </div>
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <Link to={deepLink} aria-label={`Open ${search.name}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(search.id)}
                      aria-label={`Delete ${search.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SavedSearchesCard;
