import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const interactiveInputVariants = cva(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "input-focus",
        subtle: "transition-all duration-200 focus:ring-1 focus:ring-primary/30 focus:border-primary/50",
        glow: "transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:shadow-lg focus:shadow-primary/10",
        lift: "transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:-translate-y-1 focus:shadow-md",
        scale: "transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary focus:scale-105",
        shimmer: "interactive-shimmer transition-all duration-200 focus:ring-2 focus:ring-primary/20 focus:border-primary",
      }
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface InteractiveInputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof interactiveInputVariants> {}

const InteractiveInput = React.forwardRef<HTMLInputElement, InteractiveInputProps>(
  ({ className, variant, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(interactiveInputVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
InteractiveInput.displayName = "InteractiveInput"

export { InteractiveInput }