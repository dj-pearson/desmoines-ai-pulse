import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { handleError } from '@/lib/errorHandler';
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import { cn } from '@/lib/utils';
import {
  interestCategories,
  onboardingSteps,
  type CuisinePreferences,
  type DietaryRestriction,
  type EventCategory,
} from '@/types/preferences';

interface PreferencesOnboardingProps {
  open: boolean;
  /** Finished, or "Don't ask again". Onboarding is marked complete first. */
  onComplete: () => void;
  /**
   * Escape, the close button, or "Later". Onboarding is NOT marked complete,
   * so the For You rail keeps offering it. Falls back to onComplete when a
   * caller does not distinguish the two.
   */
  onDismiss?: () => void;
}

type PriceRange = CuisinePreferences['priceRange'];

const DIETARY_OPTIONS: Array<{ id: DietaryRestriction; label: string }> = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
  { id: 'nut-free', label: 'Nut-free' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
];

const PRICE_OPTIONS: Array<{ id: PriceRange; label: string; description: string }> = [
  { id: 'any', label: 'Any', description: 'Show everything' },
  { id: '$', label: '$', description: 'Budget' },
  { id: '$$', label: '$$', description: 'Moderate' },
  { id: '$$$', label: '$$$', description: 'Upscale' },
  { id: '$$$$', label: '$$$$', description: 'Fine dining' },
];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** A pressable choice. `aria-pressed` carries the state for screen readers. */
function Choice({
  pressed,
  onClick,
  children,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-foreground hover:bg-muted',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {pressed && <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  );
}

/**
 * Three-step taste onboarding: interests, food and price, neighbourhoods.
 *
 * Every step saves what it shows (Home plan WP2 item 2). Neighbourhoods come
 * from NEIGHBORHOODS, the inventory that has a page for each entry, and are
 * saved through updateLocation; they used to be discarded at a TODO.
 */
export function PreferencesOnboarding({ open, onComplete, onDismiss }: PreferencesOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const { preferences, updateInterests, updateCuisine, updateLocation, completeOnboarding } =
    useUserPreferences();

  const [selectedInterests, setSelectedInterests] = useState<EventCategory[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<DietaryRestriction[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRange>('any');
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);

  // Seed once from saved preferences, which may arrive after the first render
  // when the dialog is opened before the shared query has resolved.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !preferences) return;
    seeded.current = true;
    setSelectedInterests(preferences.interests.categories ?? []);
    setSelectedDietary(preferences.cuisine.dietary ?? []);
    setSelectedPriceRange(preferences.cuisine.priceRange ?? 'any');
    setSelectedNeighborhoods(preferences.location.neighborhoods ?? []);
  }, [preferences]);

  const stepCount = onboardingSteps.length;
  const step = onboardingSteps[currentStep];
  const isLastStep = currentStep === stepCount - 1;

  const dismiss = () => (onDismiss ?? onComplete)();

  const saveCurrentStep = async () => {
    if (step.id === 'interests') await updateInterests(selectedInterests);
    else if (step.id === 'cuisine') {
      await updateCuisine({ dietary: selectedDietary, priceRange: selectedPriceRange });
    } else if (step.id === 'location') {
      await updateLocation({ neighborhoods: selectedNeighborhoods });
    }
  };

  const handleNext = async () => {
    setIsBusy(true);
    try {
      await saveCurrentStep();
      if (!isLastStep) {
        setCurrentStep((s) => s + 1);
        return;
      }
      await completeOnboarding();
      onComplete();
    } catch (error) {
      handleError(error, { component: 'PreferencesOnboarding', action: 'saveStep' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDontAskAgain = async () => {
    setIsBusy(true);
    try {
      await completeOnboarding();
      onComplete();
    } catch (error) {
      handleError(error, { component: 'PreferencesOnboarding', action: 'dontAskAgain' });
    } finally {
      setIsBusy(false);
    }
  };

  const renderStep = () => {
    switch (step.id) {
      case 'interests':
        return (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {interestCategories.map((category) => (
              <Choice
                key={category.id}
                pressed={selectedInterests.includes(category.id)}
                onClick={() => setSelectedInterests((prev) => toggle(prev, category.id))}
              >
                <span className="block font-medium">{category.label}</span>
                <span className="block text-xs opacity-80">{category.description}</span>
              </Choice>
            ))}
          </div>
        );

      case 'cuisine':
        return (
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">Dietary needs</legend>
              <div className="grid grid-cols-2 gap-2">
                {DIETARY_OPTIONS.map((option) => (
                  <Choice
                    key={option.id}
                    pressed={selectedDietary.includes(option.id)}
                    onClick={() => setSelectedDietary((prev) => toggle(prev, option.id))}
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">Price range</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PRICE_OPTIONS.map((option) => (
                  <Choice
                    key={option.id}
                    pressed={selectedPriceRange === option.id}
                    onClick={() => setSelectedPriceRange(option.id)}
                  >
                    <span className="block font-semibold">{option.label}</span>
                    <span className="block text-xs opacity-80">{option.description}</span>
                  </Choice>
                ))}
              </div>
            </fieldset>
          </div>
        );

      case 'location':
        return (
          <div className="grid grid-cols-2 gap-2">
            {NEIGHBORHOODS.map((n) => (
              <Choice
                key={n.slug}
                pressed={selectedNeighborhoods.includes(n.name)}
                onClick={() => setSelectedNeighborhoods((prev) => toggle(prev, n.name))}
              >
                {n.name}
              </Choice>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape, the overlay and the close button all mean "later", not
        // "completed". Only the explicit actions below mark onboarding done.
        if (!next) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8 text-left">
          <p className="text-xs font-medium text-muted-foreground">
            Step {currentStep + 1} of {stepCount}
          </p>
          <DialogTitle className="text-xl">{step.title}</DialogTitle>
          <DialogDescription>{step.description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[16rem]">{renderStep()}</div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="h-11" onClick={dismiss} disabled={isBusy}>
              Later
            </Button>
            <Button
              variant="ghost"
              className="h-11 text-muted-foreground"
              onClick={() => void handleDontAskAgain()}
              disabled={isBusy}
            >
              Don't ask again
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setCurrentStep((s) => s - 1)}
                disabled={isBusy}
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            )}
            <Button className="h-11 min-w-[6.5rem]" onClick={() => void handleNext()} disabled={isBusy}>
              {isLastStep ? (
                'Save'
              ) : (
                <>
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
