import { useState, type ReactNode } from "react";
import { CalendarFeedLinks } from "@/components/events/CalendarFeedLinks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALENDAR_FEEDS, feedForSlug, feedLinks } from "@/lib/calendarFeeds";

interface SubscribeCalendarDialogProps {
  /** The feed preselected when the dialog opens, e.g. the page's category. */
  defaultSlug?: string;
  /** The control that opens the dialog. Rendered with asChild. */
  children: ReactNode;
}

/**
 * Subscribe to a live calendar feed (growth roadmap #9).
 *
 * Unlike "Add to calendar" on one event, this adds a calendar that keeps
 * itself current: the reader's app re-reads /calendar/<slug>.ics every few
 * hours. The links are plain anchors, not window.open, so they work with
 * middle-click and in the iOS app's webview, and webcal:// is left to the OS
 * to route to whichever calendar app owns it.
 */
export function SubscribeCalendarDialog({ defaultSlug = "all", children }: SubscribeCalendarDialogProps) {
  const [slug, setSlug] = useState(feedForSlug(defaultSlug) ? defaultSlug : "all");
  const feed = feedForSlug(slug) ?? CALENDAR_FEEDS[0];
  // Always the production domain. Inside the iOS and Android apps the origin is
  // capacitor://localhost, which no calendar server can fetch, and a preview
  // deploy's URL would leave subscribers pointed at a build that gets deleted.
  const links = feedLinks(feed);

  return (
    <Dialog
      onOpenChange={(open) => {
        // Reopening from a page with a different filter should start from it.
        if (open) setSlug(feedForSlug(defaultSlug) ? defaultSlug : "all");
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subscribe to a calendar</DialogTitle>
          <DialogDescription>
            New events show up in your calendar on their own. Your calendar app checks for updates every few hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="calendar-feed">Which events</Label>
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger id="calendar-feed" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALENDAR_FEEDS.map((f) => (
                <SelectItem key={f.slug} value={f.slug}>
                  {f.slug === "all" ? "All events" : f.slug === "free" ? "Free events" : f.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{feed.description}, for the next 60 days.</p>
        </div>

        <CalendarFeedLinks links={links} inputId="calendar-feed-url" />
      </DialogContent>
    </Dialog>
  );
}
