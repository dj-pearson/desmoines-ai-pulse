import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Heart,
  MapPin,
  Bell,
  Calendar,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import {
  interestCategories,
  onboardingSteps,
  EventCategory,
  DietaryRestriction,
} from '@/types/preferences';
import { cn } from '@/lib/utils';

interface PreferencesOnboardingProps {
  open: boolean;
  onComplete: () => void;
}

export function PreferencesOnboarding({
  open,
  onComplete,
}: PreferencesOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { preferences, updateInterests, updateCuisine, completeOnboarding } =
    useUserPreferences();

  const [selectedInterests, setSelectedInterests] = useState<EventCategory[]>(
    preferences?.interests.categories || []
  );
  const [selectedDietary, setSelectedDietary] = useState<DietaryRestriction[]>(
    preferences?.cuisine.dietary || []
  );
  const [selectedPriceRange, setSelectedPriceRange] = useState<'$' | '$$' | '$$$' | '$$$$' | 'any'>(
    preferences?.cuisine.priceRange || 'any'
  );
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    preferences?.location.neighborhoods || []
  );
  const [calendarConnected, setCalendarConnected] = useState(false);

  const handleNext = async () => {
    if (currentStep === 1) {
      // Save interests
      await updateInterests(selectedInterests);
    } else if (currentStep === 2) {
      // Save cuisine preferences (including price range)
      await updateCuisine({ dietary: selectedDietary, priceRange: selectedPriceRange });
    } else if (currentStep === 3) {
      // Save location preferences
      // TODO: Implement location save
    } else if (currentStep === 4) {
      // Calendar integration step - just move forward
      // User can set this up later if they skip
    }

    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await completeOnboarding();
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
    onComplete();
  };

  const toggleInterest = (category: EventCategory) => {
    setSelectedInterests((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleDietary = (restriction: DietaryRestriction) => {
    setSelectedDietary((prev) =>
      prev.includes(restriction)
        ? prev.filter((r) => r !== restriction)
        : [...prev, restriction]
    );
  };

  const toggleNeighborhood = (neighborhood: string) => {
    setSelectedNeighborhoods((prev) =>
      prev.includes(neighborhood)
        ? prev.filter((n) => n !== neighborhood)
        : [...prev, neighborhood]
    );
  };

  const currentStepData = onboardingSteps[currentStep];
  const isLastStep = currentStep === onboardingSteps.length - 1;

  // Step-specific content
  const renderStepContent = () => {
    switch (currentStepData.id) {
      case 'welcome':
        return (
          <div className="text-center space-y-4 py-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-6">
                <Sparkles className="h-16 w-16 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold">{currentStepData.title}</h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                {currentStepData.description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 max-w-md mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">1000+</div>
                <div className="text-xs text-muted-foreground">Events</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">300+</div>
                <div className="text-xs text-muted-foreground">Restaurants</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">AI</div>
                <div className="text-xs text-muted-foreground">Powered</div>
              </div>
            </div>
          </div>
        );

      case 'interests':
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <Heart className="h-10 w-10 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-muted-foreground">{currentStepData.description}</p>
              <Badge variant="secondary" className="text-xs">
                Select 3-5 interests for best results
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto py-2">
              {interestCategories.map((category) => {
                const isSelected = selectedInterests.includes(category.id);
                return (
                  <Card
                    key={category.id}
                    className={cn(
                      'p-4 cursor-pointer transition-all duration-200 hover:scale-105',
                      isSelected
                        ? 'border-2 border-primary bg-primary/5 shadow-lg'
                        : 'hover:border-primary/50'
                    )}
                    onClick={() => toggleInterest(category.id)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <span className="text-2xl">{category.icon}</span>
                        {isSelected && (
                          <div className="rounded-full bg-primary p-1">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-sm leading-tight">
                          {category.label}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {category.description}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              {selectedInterests.length} selected
            </div>
          </div>
        );

      case 'cuisine':
        const dietaryOptions: Array<{
          id: DietaryRestriction;
          label: string;
          icon: string;
        }> = [
          { id: 'vegetarian', label: 'Vegetarian', icon: '🥗' },
          { id: 'vegan', label: 'Vegan', icon: '🌱' },
          { id: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
          { id: 'dairy-free', label: 'Dairy-Free', icon: '🥛' },
          { id: 'nut-free', label: 'Nut-Free', icon: '🥜' },
          { id: 'halal', label: 'Halal', icon: '☪️' },
          { id: 'kosher', label: 'Kosher', icon: '✡️' },
        ];

        const priceRangeOptions: Array<{
          id: '$' | '$$' | '$$$' | '$$$$' | 'any';
          label: string;
          description: string;
        }> = [
          { id: 'any', label: 'Any Price', description: 'Show all restaurants' },
          { id: '$', label: '$', description: 'Budget-friendly' },
          { id: '$$', label: '$$', description: 'Moderate' },
          { id: '$$$', label: '$$$', description: 'Upscale' },
          { id: '$$$$', label: '$$$$', description: 'Fine dining' },
        ];

        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="text-4xl mx-auto">🍽️</div>
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-muted-foreground">{currentStepData.description}</p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Dietary Restrictions</h3>
              <div className="grid grid-cols-2 gap-2">
                {dietaryOptions.map((option) => {
                  const isSelected = selectedDietary.includes(option.id);
                  return (
                    <Button
                      key={option.id}
                      variant={isSelected ? 'default' : 'outline'}
                      className={cn(
                        'justify-start h-auto py-3',
                        isSelected && 'bg-primary text-white'
                      )}
                      onClick={() => toggleDietary(option.id)}
                    >
                      <span className="mr-2 text-lg">{option.icon}</span>
                      <span className="text-sm">{option.label}</span>
                      {isSelected && <Check className="h-4 w-4 ml-auto" />}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Price Range Preference
              </h3>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {priceRangeOptions.map((option) => {
                  const isSelected = selectedPriceRange === option.id;
                  return (
                    <Button
                      key={option.id}
                      variant={isSelected ? 'default' : 'outline'}
                      className={cn(
                        'flex-col h-auto py-3 gap-1',
                        isSelected && 'bg-primary text-white border-2 border-primary'
                      )}
                      onClick={() => setSelectedPriceRange(option.id)}
                    >
                      <span className="text-lg font-bold">{option.label}</span>
                      <span className="text-xs opacity-80">{option.description}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'location':
        const neighborhoods = [
          'Downtown',
          'East Village',
          'Ingersoll',
          'Beaverdale',
          'West Des Moines',
          'Urbandale',
          'Waukee',
          'Ankeny',
        ];

        return (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <MapPin className="h-10 w-10 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-muted-foreground">{currentStepData.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {neighborhoods.map((neighborhood) => {
                const isSelected = selectedNeighborhoods.includes(neighborhood);
                return (
                  <Button
                    key={neighborhood}
                    variant={isSelected ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => toggleNeighborhood(neighborhood)}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    {neighborhood}
                    {isSelected && <Check className="h-4 w-4 ml-auto" />}
                  </Button>
                );
              })}
            </div>
          </div>
        );

      case 'calendar':
        return (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Calendar className="h-12 w-12 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {currentStepData.description}
              </p>
            </div>

            <div className="space-y-3 max-w-md mx-auto">
              <Card className="p-4 bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">Smart Suggestions</h3>
                      <p className="text-xs text-muted-foreground">
                        Get event recommendations that fit your schedule and avoid conflicts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Bell className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">Never Double-Book</h3>
                      <p className="text-xs text-muted-foreground">
                        We'll only suggest events when you're free
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">One-Click Add</h3>
                      <p className="text-xs text-muted-foreground">
                        Add events directly to your calendar with one tap
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="space-y-2 pt-2">
                <Button
                  className="w-full justify-start gap-3 h-auto py-4"
                  variant={calendarConnected ? 'default' : 'outline'}
                  onClick={() => setCalendarConnected(!calendarConnected)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">📅</div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Google Calendar</div>
                      <div className="text-xs opacity-80">
                        {calendarConnected ? 'Connected' : 'Connect your Google Calendar'}
                      </div>
                    </div>
                    {calendarConnected ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                  </div>
                </Button>

                <Button
                  className="w-full justify-start gap-3 h-auto py-4"
                  variant="outline"
                  disabled
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">📆</div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Outlook Calendar</div>
                      <div className="text-xs opacity-80">Coming soon</div>
                    </div>
                  </div>
                </Button>

                <Button
                  className="w-full justify-start gap-3 h-auto py-4"
                  variant="outline"
                  disabled
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="text-2xl">🍎</div>
                    <div className="text-left flex-1">
                      <div className="font-semibold">Apple Calendar</div>
                      <div className="text-xs opacity-80">Coming soon</div>
                    </div>
                  </div>
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground pt-2">
                You can connect your calendar later from settings
              </p>
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="text-center space-y-4 py-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-6">
                <Bell className="h-12 w-12 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{currentStepData.title}</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                {currentStepData.description}
              </p>
            </div>
            <div className="space-y-3 max-w-md mx-auto text-left">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">📧</div>
                  <div>
                    <div className="font-medium text-sm">Weekly Digest</div>
                    <div className="text-xs text-muted-foreground">
                      Get curated events every Friday
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🔔</div>
                  <div>
                    <div className="font-medium text-sm">Event Reminders</div>
                    <div className="text-xs text-muted-foreground">
                      Never miss your saved events
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              You can customize notifications in settings later
            </p>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center space-y-6 py-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-gradient-to-br from-green-500 to-emerald-500 p-6 animate-bounce">
                <Check className="h-16 w-16 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold">{currentStepData.title}</h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                {currentStepData.description}
              </p>
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                <Check className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-sm text-left">
                  {selectedInterests.length} interest{selectedInterests.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              {selectedDietary.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-left">
                    {selectedDietary.length} dietary preference{selectedDietary.length !== 1 ? 's' : ''} set
                  </span>
                </div>
              )}
              {selectedPriceRange !== 'any' && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-left">
                    Price range: {selectedPriceRange}
                  </span>
                </div>
              )}
              {selectedNeighborhoods.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-left">
                    {selectedNeighborhoods.length} neighborhood{selectedNeighborhoods.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}
              {calendarConnected && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-sm text-left">Calendar connected</span>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border-2 border-primary/20">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-left">Ready to explore!</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => handleSkip()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <div className="space-y-6 py-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.id}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  index === currentStep
                    ? 'w-8 bg-primary'
                    : index < currentStep
                    ? 'w-2 bg-primary'
                    : 'w-2 bg-muted'
                )}
              />
            ))}
          </div>

          {/* Step Content */}
          <div className="min-h-[400px]">{renderStepContent()}</div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
              size="sm"
            >
              Skip
            </Button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button variant="outline" onClick={handlePrevious} size="sm">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <Button onClick={handleNext} size="sm" className="min-w-[100px]">
                {isLastStep ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Exploring
                  </>
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
