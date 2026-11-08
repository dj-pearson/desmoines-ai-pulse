import React, { Suspense, lazy, useRef, useState } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Button } from "@/components/ui/button";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { lazyOrNothing } from "@/lib/lazyOrNothing";
import type { ShareDialogPanelProps } from "@/components/ShareDialogPanel";

/**
 * WEB-PERF-073. This module is the Share trigger only. The dialog itself
 * (Radix Dialog, Input, Label, five lucide icons, the share-URL builder) lives
 * in ShareDialogPanel and is fetched on the first click, the way
 * GlobalUpgradeModal loads UpgradeModal. Every detail route and every
 * EventCard renders this trigger, and almost nobody presses it.
 *
 * React.lazy fetches when the component renders, so the panel is not rendered
 * until the first open. After that it stays mounted with open toggling, which
 * keeps Radix's close animation and costs a closed Dialog (renders nothing).
 *
 * lazyOrNothing: a failed chunk fetch (usually one purged after a deploy)
 * leaves Share doing nothing for this page view instead of throwing the whole
 * detail page into its error boundary.
 */
const ShareDialogPanel = lazy(
  lazyOrNothing<ShareDialogPanelProps>(() =>
    import("@/components/ShareDialogPanel").then((m) => ({ default: m.ShareDialogPanel })),
  ),
);

interface ShareDialogProps {
  title: string;
  description: string;
  url: string;
  trigger?: React.ReactNode;
  className?: string;
  /** Callback fired when a share action is completed (any platform or copy) */
  onShare?: () => void;
  /** What is being shared; sets the dialog and message wording. Defaults to "event". */
  kind?: ShareKind;
  /**
   * Name of the thing being shared, for the trigger's accessible name
   * ("Share Jazz Night"). Falls back to title.
   */
  itemName?: string;
}

export type ShareKind = "event" | "article";

export default function ShareDialog({
  title,
  description,
  url,
  trigger,
  className,
  onShare,
  kind = "event",
  itemName,
}: ShareDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);

  // Names the item so a list of cards is not 30 identical "Share" buttons.
  // Starts with the visible "Share" (WCAG 2.5.3 label-in-name). Articles say
  // "article" because ArticleDetails has a trigger whose visible text is
  // "Share Article"; the default kind also covers restaurants and attractions,
  // so it names no noun.
  const triggerLabel =
    kind === "article" ? `Share article: ${itemName ?? title}` : `Share ${itemName ?? title}`;

  // What Radix's DialogTrigger used to set, minus aria-controls: the content
  // has no id until the panel has loaded. Typed as button attributes so
  // type="button" survives; Slot's own props are HTMLElement-wide.
  const triggerProps: React.ButtonHTMLAttributes<HTMLButtonElement> & { "data-state": string } = {
    type: "button",
    "aria-label": triggerLabel,
    "aria-haspopup": "dialog",
    "aria-expanded": isOpen,
    "data-state": isOpen ? "open" : "closed",
    onClick: () => {
      setHasOpened(true);
      setIsOpen(true);
    },
  };

  return (
    <>
      <Slot ref={triggerRef} {...triggerProps}>
        {trigger || (
          <Button variant="outline" size="sm" className={className}>
            <SpriteIcon name="share-2" className="h-4 w-4 mr-2" />
            Share
          </Button>
        )}
      </Slot>
      {hasOpened && (
        // No fallback: a spinner for the few frames before the dialog appears
        // is worse than nothing.
        <Suspense fallback={null}>
          <ShareDialogPanel
            open={isOpen}
            onOpenChange={setIsOpen}
            title={title}
            description={description}
            url={url}
            kind={kind}
            onShare={onShare}
            returnFocusTo={triggerRef}
          />
        </Suspense>
      )}
    </>
  );
}
