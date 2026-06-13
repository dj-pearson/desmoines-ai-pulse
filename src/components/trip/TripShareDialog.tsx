/**
 * TripShareDialog (WEB-FEAT-011) — surfaces a public /trips/shared/<code> link
 * with copy-to-clipboard and (where supported) the native Web Share sheet.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("TripShareDialog");

interface TripShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title: string;
}

const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

export function TripShareDialog({ open, onOpenChange, url, title }: TripShareDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      log.error("handleCopy", "Clipboard write failed", { error });
      toast.error("Could not copy the link. Select and copy it manually.");
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, text: `Check out my Des Moines trip: ${title}`, url });
    } catch (error) {
      // AbortError = user dismissed the sheet; ignore.
      if ((error as Error)?.name !== "AbortError") {
        log.error("handleNativeShare", "Native share failed", { error });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share your trip
          </DialogTitle>
          <DialogDescription>
            Anyone with this link can view your itinerary (read-only).
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="flex-1" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        {canNativeShare && (
          <Button onClick={handleNativeShare} className="w-full">
            <Share2 className="h-4 w-4 mr-2" />
            Share…
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default TripShareDialog;
