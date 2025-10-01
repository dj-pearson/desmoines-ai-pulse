import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const interactiveButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 interactive-scale btn-ripple",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 interactive-scale btn-ripple",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground interactive-lift",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 interactive-glow",
        ghost: "hover:bg-accent hover:text-accent-foreground interactive-fade",
        link: "text-primary underline-offset-4 hover:underline interactive-slide",
        shimmer: "bg-primary text-primary-foreground interactive-shimmer hover:shadow-lg",
        bounce: "bg-secondary text-secondary-foreground interactive-bounce hover:bg-secondary/80",
        tilt: "bg-accent text-accent-foreground interactive-rotate hover:bg-accent/80",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
      interaction: {
        none: "",
        scale: "interactive-scale",
        lift: "interactive-lift", 
        glow: "interactive-glow",
        shimmer: "interactive-shimmer",
        pulse: "interactive-pulse",
        bounce: "interactive-bounce",
        fade: "interactive-fade",
        rotate: "interactive-rotate",
        slide: "interactive-slide",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      interaction: "scale",
    },
  }
)

export interface InteractiveButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof interactiveButtonVariants> {
  asChild?: boolean
}

const InteractiveButton = React.forwardRef<HTMLButtonElement, InteractiveButtonProps>(
  ({ className, variant, size, interaction, asChild = false, children, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Add ripple effect for certain variants
      if (variant === "default" || variant === "destructive") {
        const button = e.currentTarget
        const clientX = e.clientX
        const clientY = e.clientY
        
        // Use requestAnimationFrame to avoid forced reflow
        requestAnimationFrame(() => {
          const rect = button.getBoundingClientRect()
          const ripple = document.createElement("span")
          const size = Math.max(rect.width, rect.height)
          const x = clientX - rect.left - size / 2
          const y = clientY - rect.top - size / 2
          
          // Batch DOM writes together
          ripple.style.cssText = `width: ${size}px; height: ${size}px; left: ${x}px; top: ${y}px;`
          ripple.classList.add("absolute", "animate-ripple", "bg-white/30", "rounded-full", "pointer-events-none")
          
          button.appendChild(ripple)
          
          setTimeout(() => {
            ripple.remove()
          }, 600)
        })
      }
      
      onClick?.(e)
    }
    
    return (
      <Comp
        className={cn(interactiveButtonVariants({ variant, size, interaction, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
InteractiveButton.displayName = "InteractiveButton"

export { InteractiveButton, interactiveButtonVariants }