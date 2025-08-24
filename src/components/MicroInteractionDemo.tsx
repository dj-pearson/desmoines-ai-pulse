import React from "react"
import { InteractiveButton } from "./ui/interactive-button"
import { InteractiveCard, InteractiveCardContent, InteractiveCardDescription, InteractiveCardHeader, InteractiveCardTitle } from "./ui/interactive-card"
import { InteractiveInput } from "./ui/interactive-input"
import { Badge } from "./ui/badge"
import { Heart, Star, Bookmark, Share2, Play, Download, Search, Settings } from "lucide-react"

/**
 * Demo component showcasing various micro-interactions
 * This component demonstrates all the available interactive components and effects
 */
export function MicroInteractionDemo() {
  return (
    <div className="container mx-auto p-8 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-fade-in">
          Micro-Interactions Demo
        </h1>
        <p className="text-muted-foreground text-lg animate-slide-up">
          Explore our enhanced UI components with smooth animations and feedback
        </p>
      </div>

      {/* Interactive Buttons Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Interactive Buttons</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InteractiveButton variant="default">
            <Play className="h-4 w-4" />
            Default Ripple
          </InteractiveButton>
          
          <InteractiveButton variant="outline" interaction="lift">
            <Star className="h-4 w-4" />
            Outline Lift
          </InteractiveButton>
          
          <InteractiveButton variant="secondary" interaction="glow">
            <Heart className="h-4 w-4" />
            Secondary Glow
          </InteractiveButton>
          
          <InteractiveButton variant="shimmer">
            <Download className="h-4 w-4" />
            Shimmer Effect
          </InteractiveButton>
          
          <InteractiveButton variant="bounce">
            <Bookmark className="h-4 w-4" />
            Bounce Effect
          </InteractiveButton>
          
          <InteractiveButton variant="tilt">
            <Share2 className="h-4 w-4" />
            Tilt Effect
          </InteractiveButton>
          
          <InteractiveButton variant="ghost" interaction="fade">
            <Settings className="h-4 w-4" />
            Ghost Fade
          </InteractiveButton>
          
          <InteractiveButton variant="link" interaction="slide">
            <Search className="h-4 w-4" />
            Link Slide
          </InteractiveButton>
        </div>
      </section>

      {/* Interactive Cards Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Interactive Cards</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InteractiveCard variant="default">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Lift & Shadow</InteractiveCardTitle>
              <InteractiveCardDescription>
                Hover to see the card lift with enhanced shadow
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                This card uses the default interactive behavior with smooth lift animation and shadow enhancement.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>

          <InteractiveCard variant="tilt">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Tilt Effect</InteractiveCardTitle>
              <InteractiveCardDescription>
                Subtle rotation and scale on hover
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                This card tilts slightly and scales up when you hover over it, creating a playful interaction.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>

          <InteractiveCard variant="glow">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Glow Effect</InteractiveCardTitle>
              <InteractiveCardDescription>
                Glowing shadow with primary color
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                This card creates a subtle glow effect using the primary color when hovered.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>

          <InteractiveCard variant="scale">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Scale Animation</InteractiveCardTitle>
              <InteractiveCardDescription>
                Smooth scaling on interaction
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                This card scales up smoothly when you hover, with active state feedback.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>

          <InteractiveCard variant="shimmer">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Shimmer Effect</InteractiveCardTitle>
              <InteractiveCardDescription>
                Animated shimmer overlay
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                Watch the subtle shimmer animation that flows across this card on hover.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>

          <InteractiveCard variant="subtle">
            <InteractiveCardHeader>
              <InteractiveCardTitle>Subtle Animation</InteractiveCardTitle>
              <InteractiveCardDescription>
                Minimal shadow enhancement
              </InteractiveCardDescription>
            </InteractiveCardHeader>
            <InteractiveCardContent>
              <p className="text-sm text-muted-foreground">
                For a more subtle approach, this card only enhances the shadow slightly.
              </p>
            </InteractiveCardContent>
          </InteractiveCard>
        </div>
      </section>

      {/* Interactive Inputs Section */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Interactive Inputs</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Default Focus (Scale)</label>
              <InteractiveInput placeholder="Focus to see scale effect..." />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Glow Effect</label>
              <InteractiveInput variant="glow" placeholder="Focus for glow effect..." />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Lift Animation</label>
              <InteractiveInput variant="lift" placeholder="Focus to lift the input..." />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Scale Focus</label>
              <InteractiveInput variant="scale" placeholder="Focus for scale animation..." />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Shimmer Effect</label>
              <InteractiveInput variant="shimmer" placeholder="Shimmer animation..." />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Subtle Focus</label>
              <InteractiveInput variant="subtle" placeholder="Subtle focus effect..." />
            </div>
          </div>
        </div>
      </section>

      {/* Animation Classes Demo */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Animation Utilities</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg interactive-scale">
            <Badge className="mb-2">interactive-scale</Badge>
            <p className="text-sm text-muted-foreground">Hover for scale effect</p>
          </div>
          
          <div className="p-4 border rounded-lg interactive-lift">
            <Badge className="mb-2">interactive-lift</Badge>
            <p className="text-sm text-muted-foreground">Hover for lift effect</p>
          </div>
          
          <div className="p-4 border rounded-lg interactive-glow">
            <Badge className="mb-2">interactive-glow</Badge>
            <p className="text-sm text-muted-foreground">Hover for glow effect</p>
          </div>
          
          <div className="p-4 border rounded-lg interactive-bounce">
            <Badge className="mb-2">interactive-bounce</Badge>
            <p className="text-sm text-muted-foreground">Hover for bounce</p>
          </div>
          
          <div className="p-4 border rounded-lg interactive-rotate">
            <Badge className="mb-2">interactive-rotate</Badge>
            <p className="text-sm text-muted-foreground">Hover for rotation</p>
          </div>
          
          <div className="p-4 border rounded-lg interactive-slide">
            <Badge className="mb-2">interactive-slide</Badge>
            <p className="text-sm text-muted-foreground">Hover for slide</p>
          </div>
        </div>
      </section>

      {/* Staggered Animations */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Staggered Animations</h2>
        <div className="stagger-children space-y-2">
          {[1, 2, 3, 4, 5].map((item, index) => (
            <div 
              key={item}
              className="p-4 bg-card border rounded-lg animate-slide-up"
              style={{ '--index': index } as React.CSSProperties}
            >
              <p>Staggered animation item {item}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}