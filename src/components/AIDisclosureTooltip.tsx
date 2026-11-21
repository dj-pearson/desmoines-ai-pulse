import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface AIDisclosureTooltipProps {
  /** The pill, exactly as AIDisclosureBadge draws it before the swap. */
  children: ReactElement;
  tooltip: string;
}

/**
 * The Radix half of AIDisclosureBadge (WEB-PERF-077). Loaded on
 * the first mouse hover over the pill; never import it statically, or the
 * Radix tooltip and its floating-ui popper ride into every detail route
 * again. It mounts closed: Radix opens it on the next pointermove over the
 * trigger, after its usual delay, so a tooltip can never be left open on a
 * trigger that swapped in under a pointer that has already gone.
 */
export function AIDisclosureTooltip({ children, tooltip }: AIDisclosureTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
