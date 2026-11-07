import { Loader2 } from "lucide-react";
import { CalendarFeedLinks } from "@/components/events/CalendarFeedLinks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { SavedSearchListItem, useSavedSearchAlerts } from "@/hooks/useSavedSearchAlerts";
import { BRAND } from "@/lib/brandConfig";
import { linksForFeedUrl, personalFeedUrl } from "@/lib/calendarFeeds";
import { handleError } from "@/lib/errorHandler";

interface SavedSearchCalendarDialogProps {
  /** The search whose feed is being managed; null closes the dialog. */
  search: SavedSearchListItem | null;
  onClose: () => void;
  setCalendarFeed: ReturnType<typeof useSavedSearchAlerts>["setCalendarFeed"];
}

/**
 * One saved search as a live calendar (growth roadmap #9).
 *
 * The feed URL holds a secret token and works without signing in, because a
 * calendar app cannot sign in. So the dialog says plainly that anyone with the
 * link can see the events, and offers a new link (the old one stops working)
 * and an off switch. Both go through set_saved_search_calendar(); the token is
 * never written from here.
 */
export function SavedSearchCalendarDialog({ search, onClose, setCalendarFeed }: SavedSearchCalendarDialogProps) {
  const { toast } = useToast();
  const token = search?.calendar_token ?? null;
  const pending = setCalendarFeed.isPending;

  const run = (enabled: boolean, rotate: boolean, done: string) => {
    if (!search) return;
    setCalendarFeed.mutate(
      { id: search.id, enabled, rotate },
      {
        onSuccess: () => toast({ title: done }),
        onError: (error) => {
          handleError(error, { component: "SavedSearchCalendarDialog", action: "setCalendarFeed" });
          toast({
            title: "Couldn't change the calendar feed",
            description: "Nothing changed. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const links = token
    ? linksForFeedUrl(personalFeedUrl(token), `${BRAND.name}: ${search?.name ?? "Saved search"}`)
    : null;

  return (
    <Dialog
      open={search !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Put "{search?.name}" in your calendar</DialogTitle>
          <DialogDescription>
            Events matching this search show up in your calendar for the next 60 days, and new ones are added as we
            find them. Your calendar app checks for updates every few hours.
          </DialogDescription>
        </DialogHeader>

        {links ? (
          <>
            <CalendarFeedLinks links={links} inputId="personal-calendar-feed-url" />
            <p className="text-sm text-muted-foreground">
              Anyone with this link can see the events it lists, so share it only with people you'd share the search
              with.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => run(true, true, "New link ready. The old one stops working within the hour.")}
              >
                Get a new link
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => run(false, false, "Calendar feed turned off")}
              >
                Turn off
              </Button>
              {pending && <Loader2 className="h-4 w-4 animate-spin self-center" aria-label="Saving" />}
            </div>
          </>
        ) : (
          <Button
            type="button"
            className="min-h-11"
            disabled={pending}
            onClick={() => run(true, false, "Calendar feed is on")}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Make a calendar link
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
