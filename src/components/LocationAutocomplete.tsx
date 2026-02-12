import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('LocationAutocomplete');

// Nominatim API for address autocomplete
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'DesMoinesInsider/1.0';

export interface AddressResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  type?: string;
  importance?: number;
}

interface LocationAutocompleteProps {
  value?: string;
  onChange?: (value: string, result?: AddressResult) => void;
  onSelect?: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showCurrentLocation?: boolean;
  onCurrentLocationClick?: (coords: { latitude: number; longitude: number }) => void;
  debounceMs?: number;
  minCharacters?: number;
  maxResults?: number;
  filterToRegion?: string; // e.g., 'Iowa', 'Des Moines'
}

export function LocationAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Enter address or location...',
  className,
  disabled = false,
  showCurrentLocation = true,
  onCurrentLocationClick,
  debounceMs = 500,
  minCharacters = 3,
  maxResults = 5,
  filterToRegion,
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (query.length < minCharacters) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);

      try {
        // Add region filter if specified
        const searchQuery = filterToRegion
          ? `${query}, ${filterToRegion}`
          : query;

        const url = new URL(NOMINATIM_API);
        url.searchParams.set('q', searchQuery);
        url.searchParams.set('format', 'json');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('limit', maxResults.toString());

        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }

        const data = await response.json();
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (error) {
        log.error('Error fetching address suggestions', { action: 'fetchSuggestions', metadata: { error } });
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [minCharacters, maxResults, filterToRegion]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, debounceMs);
  };

  const handleSuggestionClick = (result: AddressResult) => {
    setInputValue(result.display_name);
    setSuggestions([]);
    setShowSuggestions(false);
    onChange?.(result.display_name, result);
    onSelect?.(result);
  };

  const handleClear = () => {
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
    onChange?.('');
  };

  const handleCurrentLocation = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        onCurrentLocationClick?.(coords);

        // Reverse geocode to get address
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse');
          url.searchParams.set('lat', coords.latitude.toString());
          url.searchParams.set('lon', coords.longitude.toString());
          url.searchParams.set('format', 'json');

          const response = await fetch(url.toString(), {
            headers: { 'User-Agent': USER_AGENT },
          });

          if (response.ok) {
            const data = await response.json();
            setInputValue(data.display_name);
            onChange?.(data.display_name, data);
          }
        } catch (error) {
          log.error('Error reverse geocoding', { action: 'handleCurrentLocation', metadata: { error } });
        }

        setIsGettingLocation(false);
      },
      (error) => {
        log.error('Error getting location', { action: 'handleCurrentLocation', metadata: { error } });
        alert('Failed to get your location. Please check your browser permissions.');
        setIsGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-10 pr-10"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear input"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {showCurrentLocation && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCurrentLocation}
            disabled={disabled || isGettingLocation}
            className="shrink-0"
          >
            {isGettingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Current Location</span>
          </Button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {suggestions.map(suggestion => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {suggestion.address?.road || suggestion.display_name.split(',')[0]}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {suggestion.address
                      ? [
                          suggestion.address.city,
                          suggestion.address.state,
                          suggestion.address.postcode,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : suggestion.display_name}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hook for geocoding addresses
 * Converts address strings to lat/lng coordinates
 */
export function useGeocoding() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geocode = useCallback(async (address: string): Promise<{
    latitude: number;
    longitude: number;
  } | null> => {
    if (!address) {
      setError('Address is required');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the Supabase edge function for geocoding
      const { data, error: geocodeError } = await supabase.functions.invoke('geocode-location', {
        body: { location: address },
      });

      if (geocodeError) throw geocodeError;

      if (!data || !data.latitude || !data.longitude) {
        throw new Error('No coordinates found for the address');
      }

      setIsLoading(false);
      return {
        latitude: data.latitude,
        longitude: data.longitude,
      };
    } catch (err) {
      log.error('Geocoding error', { action: 'geocode', metadata: { error: err } });
      setError(err instanceof Error ? err.message : 'Failed to geocode address');
      setIsLoading(false);
      return null;
    }
  }, []);

  return {
    geocode,
    isLoading,
    error,
  };
}

/**
 * Validate and standardize address format
 */
export function validateAddress(address: string): {
  isValid: boolean;
  errors: string[];
  standardized?: string;
} {
  const errors: string[] = [];

  if (!address || address.trim().length === 0) {
    errors.push('Address is required');
    return { isValid: false, errors };
  }

  if (address.length < 5) {
    errors.push('Address is too short');
  }

  // Check for basic address components (numbers, street name)
  const hasNumbers = /\d/.test(address);
  const hasLetters = /[a-zA-Z]/.test(address);

  if (!hasNumbers && !hasLetters) {
    errors.push('Address must contain numbers or letters');
  }

  // Standardize format
  let standardized = address.trim();
  
  // Capitalize first letter of each word
  standardized = standardized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  // Standardize common abbreviations
  standardized = standardized
    .replace(/\bSt\b\.?/gi, 'Street')
    .replace(/\bAve\b\.?/gi, 'Avenue')
    .replace(/\bDr\b\.?/gi, 'Drive')
    .replace(/\bRd\b\.?/gi, 'Road')
    .replace(/\bBlvd\b\.?/gi, 'Boulevard')
    .replace(/\bLn\b\.?/gi, 'Lane')
    .replace(/\bCt\b\.?/gi, 'Court');

  return {
    isValid: errors.length === 0,
    errors,
    standardized: errors.length === 0 ? standardized : undefined,
  };
}
