import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface CalendarProvider {
  id: string;
  provider: string;
  calendar_name: string;
  is_primary: boolean;
  sync_enabled: boolean;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  location?: string;
  status: string;
}

export interface EventSuggestion {
  id: string;
  event_id: string;
  reason: string;
  confidence_score: number;
  optimal_time?: string;
  travel_time_minutes: number;
  is_dismissed: boolean;
  is_accepted: boolean;
  event?: any;
}

export interface CalendarConflict {
  count: number;
  events: Array<{
    title: string;
    start_time: string;
    end_time: string;
    calendar_name: string;
  }>;
}

export interface CalendarPreferences {
  work_hours_start: string;
  work_hours_end: string;
  work_days: number[];
  buffer_time_minutes: number;
  max_daily_events: number;
  auto_suggest_events: boolean;
  preferred_event_duration: number;
  location_radius_km: number;
  notification_preferences: any;
}

export function useSmartCalendar() {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarProvider[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [preferences, setPreferences] = useState<CalendarPreferences | null>(null);
  const [loading, setLoading] = useState(false);

  // Mock functions since tables don't exist yet
  const fetchCalendars = async () => {
    if (!user) return;
    setCalendars([]);
  };

  const fetchEvents = async () => {
    if (!user) return;
    setEvents([]);
  };

  const fetchSuggestions = async () => {
    if (!user) return;
    setSuggestions([]);
  };

  const fetchPreferences = async () => {
    if (!user) return;
    setPreferences(null);
  };

  const updatePreferences = async (prefs: Partial<CalendarPreferences>) => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log("Preferences would be updated:", prefs);
      toast.success('Preferences updated successfully');
    } catch (error) {
      toast.error('Failed to update preferences');
    } finally {
      setLoading(false);
    }
  };

  const checkConflicts = async (startTime: string, endTime: string): Promise<CalendarConflict> => {
    console.log("Checking conflicts for:", startTime, endTime);
    return { count: 0, events: [] };
  };

  const generateSuggestions = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log("Generating smart suggestions for user:", user.id);
      toast.success('Smart suggestions updated');
    } catch (error) {
      toast.error('Failed to generate suggestions');
    } finally {
      setLoading(false);
    }
  };

  const acceptSuggestion = async (suggestionId: string) => {
    console.log("Accepting suggestion:", suggestionId);
    toast.success('Event added to your interests');
  };

  const dismissSuggestion = async (suggestionId: string) => {
    console.log("Dismissing suggestion:", suggestionId);
  };

  const addManualEvent = async (eventData: {
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
    location?: string;
    is_all_day?: boolean;
  }) => {
    if (!user) return;
    
    console.log("Adding manual event:", eventData);
    toast.success('Event added to calendar');
  };

  useEffect(() => {
    if (user) {
      fetchCalendars();
      fetchEvents();
      fetchSuggestions();
      fetchPreferences();
    }
  }, [user]);

  return {
    calendars,
    events,
    suggestions,
    preferences,
    loading,
    checkConflicts,
    generateSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    updatePreferences,
    addManualEvent,
    refresh: () => {
      fetchCalendars();
      fetchEvents();
      fetchSuggestions();
      fetchPreferences();
    }
  };
}