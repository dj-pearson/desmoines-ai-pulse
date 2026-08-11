import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    // WEB-UX-032 AC3. Same one-rem hit target the checkbox had, same remedy: a
    // 3rem button whose layout footprint is pulled back to 1rem by -m-4, so the
    // visible dot is unchanged and nothing reflows. Sizes stay in rem because
    // this codebase scales the rem base by viewport (16/18/20px). See
    // src/components/ui/checkbox.tsx for the full reasoning, including why an
    // ::after pseudo-element does not satisfy the touch-target test and why
    // h-11 would sit exactly on the failing boundary.
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "group relative flex h-12 w-12 shrink-0 -m-4 items-center justify-center",
        "text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="flex aspect-square h-4 w-4 items-center justify-center rounded-full border border-primary">
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
          <Circle className="h-2.5 w-2.5 fill-current text-current" />
        </RadioGroupPrimitive.Indicator>
      </span>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem }
