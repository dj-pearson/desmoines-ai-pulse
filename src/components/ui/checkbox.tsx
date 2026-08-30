import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * WEB-UX-032. Radix renders this as a <button role="checkbox">, and it was
 * "h-4 w-4" — one rem square, well under the 24px WCAG 2.2 AA (2.5.8) floor and
 * the 44px Apple/Android guidance the Playwright suite measures.
 *
 * SIZES HERE ARE IN REM ON PURPOSE, because this codebase scales the rem base
 * by viewport: src/index.css sets html { font-size } to 16px mobile, 18px
 * tablet, 20px desktop. So h-4 was 16px on a phone and 20px on a desktop, and
 * every Tailwind size class is 25% larger than its name suggests on desktop.
 * That is why this story carried two different "actual" sizes — 16x16 read from
 * the source, 20x20 measured in a browser — and both were right, at different
 * viewports, with neither saying which.
 *
 * h-12 is 3rem: 48px mobile, 54px tablet, 60px desktop. All clear 44 with room.
 * h-11 (2.75rem) would land on exactly 44px at the mobile base, and the test
 * asserts `width < 44`, so sub-pixel rounding could fail it on the boundary.
 *
 * The usual remedy is an ::after pseudo-element, and it does NOT work here: the
 * touch-target test reads getBoundingClientRect() on the element itself
 * (tests/links-and-buttons.spec.ts:143-152), which a pseudo-element does not
 * change. Passing it requires the button's own box to be large.
 *
 * So the button IS 3rem and -m-4 (1rem each side) pulls its layout footprint
 * back to exactly the 1rem the old h-4 occupied — at any rem base, since both
 * scale together. Measured on /advertise at 1280px: hit area 20x20 -> 55x55,
 * visible box unchanged at 20x20, and the sibling content's x stayed at 167,
 * i.e. nothing reflowed. That matters because 28 files render this primitive.
 *
 * The trade-off, stated because it is not free: the target now extends 1rem
 * beyond the visible box on each side and can overlap what sits next to it.
 * For a checkbox with an adjacent label that is the wanted behaviour — the
 * label edge becomes clickable, as with a real <label> — but a dense grid
 * spaced under 2rem apart would get overlapping targets. There is no such grid
 * today; if one appears, give it explicit spacing rather than shrinking this.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "group peer relative flex h-12 w-12 shrink-0 -m-4 items-center justify-center",
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {/* The visible 16x16 box. Checked styling keys off the Root's data-state
        via `group-`, since the state attribute lives on the button. */}
    <span
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
        "group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground"
      )}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        <Check className="h-4 w-4" />
      </CheckboxPrimitive.Indicator>
    </span>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
