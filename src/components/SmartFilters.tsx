import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { interestCategories } from '@/types/preferences';
import { Sparkles, X, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartFiltersProps {
  onFilterSelect: (category: string) => void;
  activeFilters?: string[];
  className?: string;
}

export function SmartFilters({
  onFilterSelect,
  activeFilters = [],
  className,
}: SmartFiltersProps) {
  const { preferences, isLoading } = useUserPreferences();

  if (isLoading || !preferences?.onboardingCompleted) {
    return null;
  }

  const userInterests = preferences.interests.categories;

  if (userInterests.length === 0) {
    return null;
  }

  // Get the interest categories that match user preferences
  const suggestedFilters = interestCategories.filter((cat) =>
    userInterests.includes(cat.id)
  );

  if (suggestedFilters.length === 0) {
    return null;
  }

  return (
    <Card className={cn('border-primary/20 bg-primary/5', className)}>
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">
                Filters Based on Your Interests
              </h3>
            </div>
            <Badge variant="secondary" className="text-xs">
              {suggestedFilters.length} suggested
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestedFilters.map((filter) => {
              const isActive = activeFilters.includes(filter.id);
              return (
                <Button
                  key={filter.id}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onFilterSelect(filter.id)}
                  className={cn(
                    'transition-all duration-200',
                    isActive &&
                      'bg-primary text-white hover:bg-primary/90 shadow-md'
                  )}
                >
                  <span className="mr-1.5">{filter.icon}</span>
                  {filter.label}
                  {isActive && <X className="h-3 w-3 ml-1.5" />}
                </Button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Quick filters based on your {userInterests.length} selected
            interests. Tap to filter events.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact version for smaller spaces
 */
export function SmartFilterChips({
  onFilterSelect,
  activeFilters = [],
  className,
  limit = 5,
}: SmartFiltersProps & { limit?: number }) {
  const { preferences, isLoading } = useUserPreferences();

  if (isLoading || !preferences?.onboardingCompleted) {
    return null;
  }

  const userInterests = preferences.interests.categories;

  if (userInterests.length === 0) {
    return null;
  }

  const suggestedFilters = interestCategories
    .filter((cat) => userInterests.includes(cat.id))
    .slice(0, limit);

  if (suggestedFilters.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">For you:</span>
      </div>
      {suggestedFilters.map((filter) => {
        const isActive = activeFilters.includes(filter.id);
        return (
          <Badge
            key={filter.id}
            variant={isActive ? 'default' : 'secondary'}
            className={cn(
              'cursor-pointer hover:scale-105 transition-transform',
              isActive && 'bg-primary text-white shadow-md'
            )}
            onClick={() => onFilterSelect(filter.id)}
          >
            <span className="mr-1">{filter.icon}</span>
            {filter.label}
            {isActive && <X className="h-3 w-3 ml-1" />}
          </Badge>
        );
      })}
    </div>
  );
}

/**
 * Location-based quick filters
 */
export function SmartLocationFilters({
  onLocationSelect,
  activeLocation,
  className,
}: {
  onLocationSelect: (location: string) => void;
  activeLocation?: string;
  className?: string;
}) {
  const { preferences, isLoading } = useUserPreferences();

  if (isLoading || !preferences?.onboardingCompleted) {
    return null;
  }

  const preferredNeighborhoods = preferences.location.neighborhoods;

  if (preferredNeighborhoods.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">Your areas:</span>
      </div>
      {preferredNeighborhoods.map((neighborhood) => {
        const isActive = activeLocation === neighborhood;
        return (
          <Badge
            key={neighborhood}
            variant={isActive ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer hover:scale-105 transition-transform',
              isActive && 'bg-primary text-white shadow-md'
            )}
            onClick={() => onLocationSelect(neighborhood)}
          >
            {neighborhood}
            {isActive && <X className="h-3 w-3 ml-1" />}
          </Badge>
        );
      })}
    </div>
  );
}
