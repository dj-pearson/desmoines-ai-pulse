import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Heart, Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingModalProps {
  onComplete: () => void;
}

const ONBOARDING_STEPS = [
  {
    title: "Welcome to Des Moines Insider! 👋",
    description: "Your AI-powered guide to events, dining, and attractions in Des Moines",
    icon: Calendar,
    highlights: [
      "Discover 200+ monthly events",
      "Explore 300+ local restaurants",
      "Find attractions and playgrounds",
    ],
  },
  {
    title: "Save Your Favorites ❤️",
    description: "Never miss an event or restaurant you love",
    icon: Heart,
    highlights: [
      "Click the heart icon to save events",
      "Access saved items from your profile",
      "Get reminders for upcoming events",
    ],
  },
  {
    title: "Personalized for You 🎯",
    description: "Get recommendations based on your interests",
    icon: Bell,
    highlights: [
      "AI-powered event suggestions",
      "Location-based recommendations",
      "Alerts for events matching your interests",
    ],
  },
];

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [open, setOpen] = useState(true);
  const { user } = useAuth();

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
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

  const handleComplete = () => {
    setOpen(false);
    onComplete();
  };

  const handleSkip = () => {
    handleComplete();
  };

  const currentStepData = ONBOARDING_STEPS[currentStep];
  const Icon = currentStepData.icon;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleComplete()}>
      <DialogContent className="sm:max-w-[500px]">
        <div className="space-y-6 py-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            {ONBOARDING_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? "w-8 bg-primary"
                    : index < currentStep
                    ? "w-2 bg-primary/50"
                    : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Icon className="h-12 w-12 text-primary" />
            </div>
          </div>

          {/* Content */}
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
            <p className="text-muted-foreground">{currentStepData.description}</p>
          </div>

          {/* Highlights */}
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            {currentStepData.highlights.map((highlight, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="rounded-full bg-primary/20 p-1 mt-0.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <p className="text-sm flex-1">{highlight}</p>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip Tour
            </Button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  size="sm"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button onClick={handleNext} size="sm">
                {isLastStep ? (
                  "Get Started"
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
