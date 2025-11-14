import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import {
  interestCategories,
  EventCategory,
  DietaryRestriction,
} from '@/types/preferences';
import { cn } from '@/lib/utils';
import {
  Heart,
  MapPin,
  Clock,
  Bell,
  Check,
  Loader2,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function PreferencesSettings() {
  const { preferences, updateInterests, updateCuisine, updateLocation, updateNotifications, isSaving } =
    useUserPreferences();
  const { toast } = useToast();

  const [selectedInterests, setSelectedInterests] = useState<EventCategory[]>(
    preferences?.interests.categories || []
  );
  const [selectedDietary, setSelectedDietary] = useState<DietaryRestriction[]>(
    preferences?.cuisine.dietary || []
  );
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    preferences?.location.neighborhoods || []
  );
  const [maxDistance, setMaxDistance] = useState(
    preferences?.location.maxDistance || 15
  );
  const [emailDigest, setEmailDigest] = useState(
    preferences?.notifications.emailDigest || 'weekly'
  );

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

  const handleSaveInterests = async () => {
    try {
      await updateInterests(selectedInterests);
      toast({
        title: 'Interests updated',
        description: 'Your interest preferences have been saved.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save interests. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCuisine = async () => {
    try {
      await updateCuisine({ dietary: selectedDietary });
      toast({
        title: 'Cuisine preferences updated',
        description: 'Your food preferences have been saved.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save cuisine preferences. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveLocation = async () => {
    try {
      await updateLocation({
        neighborhoods: selectedNeighborhoods,
        maxDistance,
      });
      toast({
        title: 'Location preferences updated',
        description: 'Your location preferences have been saved.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save location preferences. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await updateNotifications({ emailDigest: emailDigest as any });
      toast({
        title: 'Notification preferences updated',
        description: 'Your notification settings have been saved.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save notification preferences. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (!preferences) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-3">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Personalization Settings</h1>
          <p className="text-muted-foreground">
            Customize your experience to get better recommendations
          </p>
        </div>
      </div>

      {/* AI Recommendations Status */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">AI-Powered Recommendations Active</h4>
              <p className="text-xs text-muted-foreground">
                Your preferences are being used to personalize event and restaurant
                recommendations across the site.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interests Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              <CardTitle>Interests</CardTitle>
            </div>
            <Button
              onClick={handleSaveInterests}
              disabled={isSaving}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
          <CardDescription>
            Select your interests to get personalized event recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {interestCategories.map((category) => {
              const isSelected = selectedInterests.includes(category.id);
              return (
                <Card
                  key={category.id}
                  className={cn(
                    'p-4 cursor-pointer transition-all duration-200 hover:scale-105',
                    isSelected
                      ? 'border-2 border-primary bg-primary/5 shadow-md'
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
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="mt-4 text-sm text-muted-foreground text-center">
            {selectedInterests.length} interests selected
          </div>
        </CardContent>
      </Card>

      {/* Cuisine Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🍽️</span>
              <CardTitle>Food & Dining</CardTitle>
            </div>
            <Button
              onClick={handleSaveCuisine}
              disabled={isSaving}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
          <CardDescription>
            Set your dietary restrictions for restaurant recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Dietary Restrictions</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
        </CardContent>
      </Card>

      {/* Location Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>Location</CardTitle>
            </div>
            <Button
              onClick={handleSaveLocation}
              disabled={isSaving}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
          <CardDescription>
            Choose your preferred neighborhoods and travel distance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Neighborhoods */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Preferred Neighborhoods</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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

          {/* Max Distance */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Maximum Travel Distance</Label>
              <Badge variant="secondary">{maxDistance} miles</Badge>
            </div>
            <Slider
              value={[maxDistance]}
              onValueChange={(values) => setMaxDistance(values[0])}
              min={5}
              max={30}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 miles</span>
              <span>30 miles</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <Button
              onClick={handleSaveNotifications}
              disabled={isSaving}
              size="sm"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>
          <CardDescription>
            Choose how you want to stay updated on events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Email Digest Frequency</Label>
            <Select value={emailDigest} onValueChange={setEmailDigest}>
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="never">Never</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Get curated event recommendations delivered to your inbox
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save All Button */}
      <Card className="border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold">All changes saved automatically</h4>
              <p className="text-sm text-muted-foreground">
                Your preferences are synced across all devices
              </p>
            </div>
            {preferences.lastUpdated && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Updated {new Date(preferences.lastUpdated).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
