/**
 * AI Disclosure Badge
 *
 * Inline, accessible disclosure shown next to content that was generated or
 * substantially assisted by AI. Supports emerging transparency requirements:
 *
 *  - EU AI Act, Art. 50 — providers of generative AI systems must ensure that
 *    output is marked as "artificially generated or manipulated" in a way that
 *    is "detectable" by the recipient.
 *  - Colorado AI Act (SB 24-205) — consumer disclosure for consequential AI use.
 *  - California AB 2013 / SB 942 — disclosure on AI-generated content.
 *  - FTC guidance on deceptive AI content and "Operation AI Comply".
 *
 * Two variants:
 *   - "badge"   : inline pill for use next to titles / cards
 *   - "notice"  : block-level callout for the top of AI-powered pages
 *
 * Pair with a short, plain-English explanation so that users understand what
 * the AI did, what its limits are, and that they should verify before relying
 * on the output.
 */

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface AIDisclosureBadgeProps {
  /** Short tooltip text. Keep it plain-English. */
  tooltip?: string;
  /** Short visible label. Defaults to "AI-generated". */
  label?: string;
  className?: string;
}

/**
 * Inline pill — use next to titles like restaurant descriptions or article
 * summaries that were produced by generative AI.
 */
export function AIDisclosureBadge({
  tooltip = "This content was generated or substantially assisted by AI. It may contain inaccuracies — please verify before relying on it.",
  label = "AI-generated",
  className,
}: AIDisclosureBadgeProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="note"
            aria-label={`${label}. ${tooltip}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary",
              className
            )}
          >
            <SpriteIcon name="sparkles" className="h-3 w-3" aria-hidden="true" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AIDisclosureNoticeProps {
  /** Optional custom heading, e.g. "About this itinerary". */
  title?: string;
  /** Optional custom body. If omitted, a generic notice is rendered. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Block-level disclosure — use at the top of AI-powered experiences
 * (Trip Planner, AI article generator, AI-enhanced listings) so users
 * understand what the AI does and that output should be verified.
 */
export function AIDisclosureNotice({
  title = "How this is generated",
  children,
  className,
}: AIDisclosureNoticeProps) {
  return (
    <div
      role="note"
      aria-label="AI content disclosure"
      className={cn(
        "rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground/90 flex items-start gap-3",
        className
      )}
    >
      <Info
        className="h-4 w-4 text-primary flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="font-semibold text-foreground leading-tight">{title}</p>
        {children ?? (
          <p className="text-muted-foreground leading-snug">
            This feature uses AI to generate suggestions based on public data and
            your inputs. It may contain inaccuracies, outdated hours, or made-up
            details. Please verify prices, hours, and reservations with the venue
            before relying on them. You can turn off AI-assisted personalization
            at any time in your profile settings.
          </p>
        )}
      </div>
    </div>
  );
}

export default AIDisclosureBadge;
