import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const interactiveCardVariants = cva(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "card-interactive",
        subtle: "hover:shadow-md transition-shadow duration-200",
        lift: "interactive-lift",
        tilt: "card-tilt",
        glow: "interactive-glow",
        scale: "interactive-scale",
        shimmer: "interactive-shimmer",
        none: "",
      },
      padding: {
        none: "",
        sm: "p-4",
        default: "p-6", 
        lg: "p-8",
      }
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
    },
  }
)

export interface InteractiveCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof interactiveCardVariants> {
  asChild?: boolean
}

const InteractiveCard = React.forwardRef<HTMLDivElement, InteractiveCardProps>(
  ({ className, variant, padding, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(interactiveCardVariants({ variant, padding, className }))}
        {...props}
      >
        {children}
      </div>
    )
  }
)
InteractiveCard.displayName = "InteractiveCard"

const InteractiveCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
InteractiveCardHeader.displayName = "InteractiveCardHeader"

const InteractiveCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight transition-colors duration-200 hover:text-primary",
      className
    )}
    {...props}
  >
    {children}
  </h3>
))
InteractiveCardTitle.displayName = "InteractiveCardTitle"

const InteractiveCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground transition-colors duration-200", className)}
    {...props}
  />
))
InteractiveCardDescription.displayName = "InteractiveCardDescription"

const InteractiveCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
InteractiveCardContent.displayName = "InteractiveCardContent"

const InteractiveCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
InteractiveCardFooter.displayName = "InteractiveCardFooter"

export {
  InteractiveCard,
  InteractiveCardHeader,
  InteractiveCardFooter,
  InteractiveCardTitle,
  InteractiveCardDescription,
  InteractiveCardContent,
}