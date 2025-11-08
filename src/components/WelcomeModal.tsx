import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Search,
  Heart,
  Share2,
  Sparkles,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { useUserPreferences } from '@/hooks/use-user-preferences';

interface WelcomeStep {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
}

const welcomeSteps: WelcomeStep[] = [
  {
    title: 'Welcome to Des Moines Insider',
    description: 'Your ultimate guide to discovering events, restaurants, and attractions in Des Moines, Iowa',
    icon: Sparkles,
    features: [
      'AI-enhanced event descriptions',
      'Real-time event updates',
      'Personalized recommendations',
    ],
  },
  {
    title: 'Discover Events & Activities',
    description: 'Find concerts, festivals, community gatherings, and more happening around Des Moines',
    icon: Calendar,
    features: [
      'Search and filter by category, date, location',
      'View events on an interactive map',
      'Save favorites to your dashboard',
    ],
  },
  {
    title: 'Save & Share',
    description: 'Keep track of your favorite events and share them with friends',
    icon: Heart,
    features: [
      'Save events to your personal collection',
      'Export to your calendar',
      'Share via social media or text',
    ],
  },
];

export function WelcomeModal() {
  const { preferences, updatePreferences } = useUserPreferences();
  const [currentStep, setCurrentStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show welcome modal only if user hasn't seen it
    if (!preferences.welcomeSeen) {
      setOpen(true);
    }
  }, [preferences.welcomeSeen]);

  const handleNext = () => {
    if (currentStep < welcomeSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    updatePreferences({ welcomeSeen: true });
    setOpen(false);
  };

  const handleComplete = () => {
    updatePreferences({ welcomeSeen: true, onboardingCompleted: true });
    setOpen(false);
  };

  const step = welcomeSteps[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === welcomeSteps.length - 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-xs">
              Step {currentStep + 1} of {welcomeSteps.length}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              Skip
            </Button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
              <StepIcon className="w-8 h-8 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl mb-1">{step.title}</DialogTitle>
              <DialogDescription className="text-base">
                {step.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-3">
            {step.features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="mt-0.5 p-1 rounded-full bg-primary/10">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm flex-1">{feature}</p>
              </div>
            ))}
          </div>

          {/* Progress indicators */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {welcomeSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-8 bg-primary'
                    : index < currentStep
                    ? 'w-2 bg-primary/50'
                    : 'w-2 bg-muted'
                }`}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex-1"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {isLastStep ? (
              <>
                Get Started
                <Sparkles className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
