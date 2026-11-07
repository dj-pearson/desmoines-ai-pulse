import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeedLinks } from "@/lib/calendarFeeds";

interface CalendarFeedLinksProps {
  links: FeedLinks;
  /** Unique per page, for the label/input pairing. */
  inputId: string;
}

/**
 * The Google / Apple / Outlook buttons and the copyable URL for one feed.
 * Shared by the public feed dialog on /events and the personal feed dialog in
 * the dashboard, so both offer the same choices in the same order.
 *
 * Plain anchors, not window.open: they work with middle-click and in the
 * mobile apps' webview, and webcal:// is left to the OS to route to whichever
 * calendar app owns it.
 */
export function CalendarFeedLinks({ links, inputId }: CalendarFeedLinksProps) {
  const [copied, setCopied] = useState(false);

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
    <>
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
        <Label htmlFor={inputId}>Or copy the link into any calendar app</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
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
    </>
  );
}
