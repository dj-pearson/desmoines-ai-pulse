import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [copied, setCopied] = useState(false);
  const feed = feedForSlug(slug) ?? CALENDAR_FEEDS[0];
  // Always the production domain. Inside the iOS and Android apps the origin is
  // capacitor://localhost, which no calendar server can fetch, and a preview
  // deploy's URL would leave subscribers pointed at a build that gets deleted.
  const links = feedLinks(feed);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Permission denied or an insecure context. The URL is already shown in
      // a selectable field below, so there is nothing else to do.
    }
  };

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

        <div className="grid gap-2">
          <Button asChild className="h-11 justify-start">
            <a href={links.google} target="_blank" rel="noopener noreferrer">
              Add to Google Calendar
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-start">
            <a href={links.webcal}>Add to Apple Calendar</a>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-start">
            <a href={links.outlook} target="_blank" rel="noopener noreferrer">
              Add to Outlook
            </a>
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="calendar-feed-url">Or copy the link into any calendar app</Label>
          <div className="flex gap-2">
            <Input
              id="calendar-feed-url"
              readOnly
              value={links.https}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={copy}
              aria-label={copied ? "Link copied" : "Copy link"}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {copied ? "Link copied to your clipboard." : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
