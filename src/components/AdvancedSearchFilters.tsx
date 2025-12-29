import React, { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Star,
  Clock,
  DollarSign,
  Filter,
  X,
  Heart,
  Calendar,
  Navigation,
  Zap
} from "lucide-react";

export interface AdvancedSearchFilters {
  query: string;
  category: string;
  location: string;
  radius: number; // in miles
  priceRange: [number, number];
  rating: number;
  dateRange: {
    start?: Date;
    end?: Date;
  };
  timeOfDay: string[];
  features: string[];
  sortBy: string;
  openNow: boolean;
  featuredOnly: boolean;
  hasDeals: boolean;
  accessibility: string[];
  tags: string[];
}

interface AdvancedSearchFiltersProps {
  filters: AdvancedSearchFilters;
  onFiltersChange: (filters: AdvancedSearchFilters) => void;
  onSaveSearch?: (name: string, filters: AdvancedSearchFilters) => void;
  onReset: () => void;
  className?: string;
}

export function AdvancedSearchFilters({
  filters,
  onFiltersChange,
  onSaveSearch,
  onReset,
  className
}: AdvancedSearchFiltersProps) {
  const [saveSearchName, setSaveSearchName] = useState('');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const { toast } = useToast();

  // Get user's location for "Near Me" feature
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Location access denied:', error);
        }
      );
    }
  }, []);

  const updateFilters = (updates: Partial<AdvancedSearchFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const toggleFeature = (feature: string) => {
    const newFeatures = filters.features.includes(feature)
      ? filters.features.filter(f => f !== feature)
      : [...filters.features, feature];
    updateFilters({ features: newFeatures });
  };

  const toggleTimeOfDay = (time: string) => {
    const newTimeOfDay = filters.timeOfDay.includes(time)
      ? filters.timeOfDay.filter(t => t !== time)
      : [...filters.timeOfDay, time];
    updateFilters({ timeOfDay: newTimeOfDay });
  };

  const toggleAccessibility = (feature: string) => {
    const newAccessibility = filters.accessibility.includes(feature)
      ? filters.accessibility.filter(a => a !== feature)
      : [...filters.accessibility, feature];
    updateFilters({ accessibility: newAccessibility });
  };

  const handleNearMe = () => {
    if (userLocation) {
      updateFilters({ 
        location: 'Near Me',
        radius: 10 // Default 10 mile radius
      });
    } else {
      // Request location permission
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
            updateFilters({ 
              location: 'Near Me',
              radius: 10
            });
          },
          () => {
            toast({
              title: "Location Access Required",
              description: 'Please enable location access to use the "Near Me" feature',
              variant: "destructive",
            });
          }
        );
      }
    }
  };

  const handleSaveSearch = () => {
    if (saveSearchName.trim() && onSaveSearch) {
      onSaveSearch(saveSearchName.trim(), filters);
      setSaveSearchName('');
    }
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.query) count++;
    if (filters.category !== 'All') count++;
    if (filters.location) count++;
    if (filters.rating > 0) count++;
    if (filters.features.length > 0) count += filters.features.length;
    if (filters.timeOfDay.length > 0) count += filters.timeOfDay.length;
    if (filters.openNow) count++;
    if (filters.featuredOnly) count++;
    if (filters.hasDeals) count++;
    if (filters.accessibility.length > 0) count += filters.accessibility.length;
    return count;
  };

  const activeFiltersCount = getActiveFiltersCount();

  const locationOptions = [
    'Downtown Des Moines',
    'West Des Moines',
    'Ankeny',
    'Urbandale',
    'Clive',
    'Johnston',
    'Waukee',
    'Altoona',
    'Pleasant Hill',
    'Norwalk'
  ];

  const featureOptions = [
    'Parking Available',
    'Pet Friendly',
    'Family Friendly',
    'Outdoor Seating',
    'Live Music',
    'Happy Hour',
    'Group Discounts',
    'Reservations',
    'Takeout',
    'Delivery'
  ];

  const timeOptions = [
    'Morning (6AM-12PM)',
    'Afternoon (12PM-5PM)', 
    'Evening (5PM-9PM)',
    'Late Night (9PM+)'
  ];

  const accessibilityOptions = [
    'Wheelchair Accessible',
    'ASL Interpreter',
    'Large Print Menu',
    'Sensory Friendly',
    'Service Animal Friendly'
  ];

  const sortOptions = [
    { value: 'relevance', label: 'Most Relevant' },
    { value: 'rating', label: 'Highest Rated' },
    { value: 'distance', label: 'Nearest First' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest First' },
    { value: 'popular', label: 'Most Popular' }
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Advanced Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {onSaveSearch && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Heart className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-3">
                    <Label htmlFor="search-name">Save this search</Label>
                    <Input
                      id="search-name"
                      placeholder="Give your search a name..."
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                    />
                    <Button 
                      onClick={handleSaveSearch}
                      disabled={!saveSearchName.trim()}
                      className="w-full"
                    >
                      Save Search
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="sm" onClick={onReset}>
              Clear All
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Location & Radius */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Location & Distance
          </Label>
          <div className="flex gap-2">
            <Select value={filters.location} onValueChange={(value) => updateFilters({ location: value })}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any Location</SelectItem>
                {locationOptions.map(location => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={handleNearMe}
              className="flex items-center gap-1"
            >
              <Navigation className="h-4 w-4" />
              Near Me
            </Button>
          </div>
          {filters.location && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Within {filters.radius} miles
              </Label>
              <Slider
                value={[filters.radius]}
                onValueChange={([radius]) => updateFilters({ radius })}
                max={50}
                min={1}
                step={1}
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Price Range */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Price Range
          </Label>
          <div className="px-3">
            <Slider
              value={filters.priceRange}
              onValueChange={(value) => updateFilters({ priceRange: value as [number, number] })}
              max={200}
              min={0}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>${filters.priceRange[0]}</span>
              <span>${filters.priceRange[1]}</span>
            </div>
          </div>
        </div>

        {/* Rating */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Minimum Rating
          </Label>
          <div className="flex gap-2">
            {[0, 3, 4, 4.5].map(rating => (
              <Button
                key={rating}
                variant={filters.rating === rating ? "default" : "outline"}
                size="sm"
                onClick={() => updateFilters({ rating })}
                className="flex items-center gap-1"
              >
                <Star className="h-3 w-3" />
                {rating === 0 ? 'Any' : `${rating}+`}
              </Button>
            ))}
          </div>
        </div>

        {/* Time of Day */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time of Day
          </Label>
          <div className="flex flex-wrap gap-2">
            {timeOptions.map(time => (
              <Button
                key={time}
                variant={filters.timeOfDay.includes(time) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTimeOfDay(time)}
              >
                {time.split(' ')[0]}
              </Button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Features
          </Label>
          <div className="flex flex-wrap gap-2">
            {featureOptions.map(feature => (
              <Button
                key={feature}
                variant={filters.features.includes(feature) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleFeature(feature)}
              >
                {feature}
                {filters.features.includes(feature) && (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="space-y-4">
          <Label>Quick Options</Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="open-now" className="text-sm">Open Now</Label>
              <Switch
                id="open-now"
                checked={filters.openNow}
                onCheckedChange={(checked) => updateFilters({ openNow: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="featured-only" className="text-sm">Featured Only</Label>
              <Switch
                id="featured-only"
                checked={filters.featuredOnly}
                onCheckedChange={(checked) => updateFilters({ featuredOnly: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="has-deals" className="text-sm">Has Deals/Discounts</Label>
              <Switch
                id="has-deals"
                checked={filters.hasDeals}
                onCheckedChange={(checked) => updateFilters({ hasDeals: checked })}
              />
            </div>
          </div>
        </div>

        {/* Accessibility */}
        <div className="space-y-3">
          <Label>Accessibility Features</Label>
          <div className="flex flex-wrap gap-2">
            {accessibilityOptions.map(feature => (
              <Button
                key={feature}
                variant={filters.accessibility.includes(feature) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleAccessibility(feature)}
              >
                {feature}
                {filters.accessibility.includes(feature) && (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Sort By */}
        <div className="space-y-3">
          <Label>Sort Results</Label>
          <Select value={filters.sortBy} onValueChange={(value) => updateFilters({ sortBy: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </Label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={filters.dateRange.start?.toISOString().split('T')[0] || ''}
              onChange={(e) => updateFilters({ 
                dateRange: { 
                  ...filters.dateRange, 
                  start: e.target.value ? new Date(e.target.value) : undefined 
                }
              })}
              className="flex-1"
            />
            <Input
              type="date"
              value={filters.dateRange.end?.toISOString().split('T')[0] || ''}
              onChange={(e) => updateFilters({ 
                dateRange: { 
                  ...filters.dateRange, 
                  end: e.target.value ? new Date(e.target.value) : undefined 
                }
              })}
              className="flex-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}