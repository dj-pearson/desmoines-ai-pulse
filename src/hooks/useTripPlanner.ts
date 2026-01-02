import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

/**
 * Trip plan preferences
 */
export interface TripPreferences {
  interests?: string[];
  budget?: 'budget' | 'moderate' | 'splurge' | 'any';
  pace?: 'relaxed' | 'moderate' | 'packed';
  groupSize?: number;
  hasChildren?: boolean;
  childAges?: number[];
  accessibilityNeeds?: string[];
  dietaryRestrictions?: string[];
  mustSee?: string[];
  avoidCategories?: string[];
}

/**
 * Trip plan item from the database
 */
export interface TripPlanItem {
  item_id: string;
  day_number: number;
  order_index: number;
  item_type: 'event' | 'restaurant' | 'attraction' | 'custom' | 'transport' | 'break';
  title: string;
  description: string | null;
  location: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  estimated_cost: string | null;
  booking_url: string | null;
  is_confirmed: boolean;
  ai_suggested: boolean;
  ai_reason: string | null;
  content_details: {
    type: 'event' | 'restaurant' | 'attraction';
    id: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Trip plan from the database
 */
export interface TripPlan {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  preferences: TripPreferences;
  status: 'draft' | 'finalized' | 'in_progress' | 'completed' | 'archived';
  is_public: boolean;
  share_code: string | null;
  ai_generated: boolean;
  total_estimated_cost: string | null;
  created_at: string;
  updated_at: string;
  items?: TripPlanItem[];
  tips?: string[];
  packingList?: string[];
}

/**
 * Interest options for trip planning
 */
export const TRIP_INTERESTS = [
  { value: 'music', label: 'Live Music & Concerts' },
  { value: 'food', label: 'Food & Dining' },
  { value: 'outdoors', label: 'Outdoor Activities' },
  { value: 'arts', label: 'Arts & Culture' },
  { value: 'sports', label: 'Sports & Recreation' },
  { value: 'nightlife', label: 'Nightlife & Bars' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'history', label: 'History & Museums' },
  { value: 'family', label: 'Family Activities' },
  { value: 'wellness', label: 'Wellness & Relaxation' },
];

/**
 * Budget options
 */
export const BUDGET_OPTIONS = [
  { value: 'budget', label: 'Budget-Friendly', description: 'Free events, $-$$ restaurants' },
  { value: 'moderate', label: 'Moderate', description: 'Mix of free and paid, $$-$$$ dining' },
  { value: 'splurge', label: 'Splurge', description: 'Premium experiences, $$$-$$$$ dining' },
  { value: 'any', label: 'No Preference', description: 'Include all price ranges' },
];

/**
 * Pace options
 */
export const PACE_OPTIONS = [
  { value: 'relaxed', label: 'Relaxed', description: '2-3 activities per day, plenty of downtime' },
  { value: 'moderate', label: 'Moderate', description: '3-4 activities per day, balanced' },
  { value: 'packed', label: 'Packed', description: '5+ activities per day, maximize experiences' },
];

/**
 * Hook for AI Trip Planner functionality
 *
 * @example
 * const { generateItinerary, tripPlans, isGenerating } = useTripPlanner();
 *
 * // Generate a new itinerary
 * await generateItinerary({
 *   startDate: '2025-01-15',
 *   endDate: '2025-01-17',
 *   preferences: {
 *     interests: ['food', 'music'],
 *     budget: 'moderate',
 *     pace: 'relaxed',
 *   }
 * });
 */
export function useTripPlanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTrip, setSelectedTrip] = useState<TripPlan | null>(null);

  // Fetch user's trip plans
  const {
    data: tripPlans,
    isLoading: isLoadingTrips,
    error: tripsError,
    refetch: refetchTrips,
  } = useQuery({
    queryKey: ['trip-plans', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('trip_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TripPlan[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Generate a new itinerary
  const generateMutation = useMutation({
    mutationFn: async ({
      startDate,
      endDate,
      preferences,
    }: {
      startDate: string;
      endDate: string;
      preferences: TripPreferences;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-itinerary', {
        body: { startDate, endDate, preferences },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      toast.success(`Itinerary "${data.tripPlan.title}" generated successfully!`);
      setSelectedTrip(data.tripPlan);
      queryClient.invalidateQueries({ queryKey: ['trip-plans', user?.id] });
    },
    onError: (error: Error) => {
      console.error('Failed to generate itinerary:', error);
      toast.error(`Failed to generate itinerary: ${error.message}`);
    },
  });

  // Fetch a specific trip with its items
  const fetchTripDetails = useCallback(async (tripId: string): Promise<TripPlan | null> => {
    const { data: tripData, error: tripError } = await supabase
      .from('trip_plans')
      .select('*')
      .eq('id', tripId)
      .single();

    if (tripError) {
      console.error('Error fetching trip:', tripError);
      return null;
    }

    // Fetch items using the RPC function
    const { data: itemsData, error: itemsError } = await supabase
      .rpc('get_trip_itinerary', { p_trip_id: tripId });

    if (itemsError) {
      console.error('Error fetching trip items:', itemsError);
    }

    return {
      ...tripData,
      items: itemsData || [],
    } as TripPlan;
  }, []);

  // Update trip plan
  const updateTripMutation = useMutation({
    mutationFn: async ({
      tripId,
      updates,
    }: {
      tripId: string;
      updates: Partial<TripPlan>;
    }) => {
      const { data, error } = await supabase
        .from('trip_plans')
        .update(updates)
        .eq('id', tripId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Trip updated successfully');
      queryClient.invalidateQueries({ queryKey: ['trip-plans', user?.id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update trip: ${error.message}`);
    },
  });

  // Delete trip plan
  const deleteTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const { error } = await supabase
        .from('trip_plans')
        .delete()
        .eq('id', tripId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Trip deleted');
      setSelectedTrip(null);
      queryClient.invalidateQueries({ queryKey: ['trip-plans', user?.id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete trip: ${error.message}`);
    },
  });

  // Update trip item
  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      updates,
    }: {
      itemId: string;
      updates: Partial<TripPlanItem>;
    }) => {
      const { data, error } = await supabase
        .from('trip_plan_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Item updated');
      if (selectedTrip) {
        fetchTripDetails(selectedTrip.id)
          .then(setSelectedTrip)
          .catch((error) => {
            console.error('Failed to refresh trip details:', error);
            toast.error('Failed to refresh trip. Please reload the page.');
          });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update item: ${error.message}`);
    },
  });

  // Add custom item to trip
  const addItemMutation = useMutation({
    mutationFn: async ({
      tripId,
      item,
    }: {
      tripId: string;
      item: Partial<TripPlanItem>;
    }) => {
      const { data, error } = await supabase
        .from('trip_plan_items')
        .insert({
          trip_plan_id: tripId,
          ...item,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Item added to itinerary');
      if (selectedTrip) {
        fetchTripDetails(selectedTrip.id)
          .then(setSelectedTrip)
          .catch((error) => {
            console.error('Failed to refresh trip details:', error);
            toast.error('Failed to refresh trip. Please reload the page.');
          });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to add item: ${error.message}`);
    },
  });

  // Remove item from trip
  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('trip_plan_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item removed');
      if (selectedTrip) {
        fetchTripDetails(selectedTrip.id)
          .then(setSelectedTrip)
          .catch((error) => {
            console.error('Failed to refresh trip details:', error);
            toast.error('Failed to refresh trip. Please reload the page.');
          });
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove item: ${error.message}`);
    },
  });

  // Share trip
  const shareTripMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const { data, error } = await supabase
        .from('trip_plans')
        .update({ is_public: true })
        .eq('id', tripId)
        .select('share_code')
        .single();

      if (error) throw error;
      return data.share_code;
    },
    onSuccess: (shareCode) => {
      const shareUrl = `${window.location.origin}/trips/shared/${shareCode}`;
      navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied to clipboard!');
      queryClient.invalidateQueries({ queryKey: ['trip-plans', user?.id] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to share trip: ${error.message}`);
    },
  });

  // Fetch shared trip by code
  const fetchSharedTrip = useCallback(async (shareCode: string): Promise<TripPlan | null> => {
    const { data, error } = await supabase
      .from('trip_plans')
      .select('*')
      .eq('share_code', shareCode)
      .eq('is_public', true)
      .single();

    if (error) {
      console.error('Error fetching shared trip:', error);
      return null;
    }

    // Fetch items
    const { data: itemsData } = await supabase
      .rpc('get_trip_itinerary', { p_trip_id: data.id });

    return {
      ...data,
      items: itemsData || [],
    } as TripPlan;
  }, []);

  // Group items by day
  const getItemsByDay = useCallback((items: TripPlanItem[]): Record<number, TripPlanItem[]> => {
    return items.reduce((acc, item) => {
      const day = item.day_number;
      if (!acc[day]) acc[day] = [];
      acc[day].push(item);
      return acc;
    }, {} as Record<number, TripPlanItem[]>);
  }, []);

  return {
    // Trip plans list
    tripPlans: tripPlans || [],
    isLoadingTrips,
    tripsError,
    refetchTrips,

    // Selected trip
    selectedTrip,
    setSelectedTrip,
    fetchTripDetails,

    // Generate itinerary
    generateItinerary: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,

    // Trip CRUD
    updateTrip: updateTripMutation.mutateAsync,
    deleteTrip: deleteTripMutation.mutateAsync,

    // Item CRUD
    updateItem: updateItemMutation.mutateAsync,
    addItem: addItemMutation.mutateAsync,
    removeItem: removeItemMutation.mutateAsync,

    // Sharing
    shareTrip: shareTripMutation.mutateAsync,
    fetchSharedTrip,

    // Helpers
    getItemsByDay,

    // Configuration
    interests: TRIP_INTERESTS,
    budgetOptions: BUDGET_OPTIONS,
    paceOptions: PACE_OPTIONS,
  };
}

export default useTripPlanner;
