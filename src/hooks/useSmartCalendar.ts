import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  event?: any; // Will contain the actual event data
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

  // Fetch user's connected calendars
  const fetchCalendars = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_calendars')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      setCalendars(data || []);
    } catch (error) {
      console.error('Error fetching calendars:', error);
      toast.error('Failed to fetch calendars');
    }
  };

  // Fetch calendar events
  const fetchEvents = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          user_calendars(calendar_name, color)
        `)
        .eq('user_id', user.id)
        .gte('start_time', new Date().toISOString())
        .order('start_time');

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Failed to fetch calendar events');
    }
  };

  // Fetch smart suggestions
  const fetchSuggestions = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('smart_event_suggestions')
        .select(`
          *,
          events(id, title, date, location, category, image_url)
        `)
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .order('confidence_score', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSuggestions(data || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      toast.error('Failed to fetch event suggestions');
    }
  };

  // Fetch user preferences
  const fetchPreferences = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('calendar_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setPreferences(data);
    } catch (error) {
      console.error('Error fetching preferences:', error);
    }
  };

  // Update preferences
  const updatePreferences = async (prefs: Partial<CalendarPreferences>) => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('calendar_preferences')
        .upsert({ 
          user_id: user.id, 
          ...prefs 
        })
        .select()
        .single();

      if (error) throw error;
      setPreferences(data);
      toast.success('Preferences updated successfully');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update preferences');
    } finally {
      setLoading(false);
    }
  };

  // Check for calendar conflicts
  const checkConflicts = async (startTime: string, endTime: string): Promise<CalendarConflict> => {
    if (!user) return { count: 0, events: [] };
    
    try {
      const { data, error } = await supabase.rpc('check_calendar_conflicts', {
        p_user_id: user.id,
        p_start_time: startTime,
        p_end_time: endTime
      });

      if (error) throw error;
      return {
        count: data[0]?.conflict_count || 0,
        events: Array.isArray(data[0]?.conflicting_events) ? data[0].conflicting_events as any[] : []
      };
    } catch (error) {
      console.error('Error checking conflicts:', error);
      return { count: 0, events: [] };
    }
  };

  // Generate smart suggestions
  const generateSuggestions = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { error } = await supabase.rpc('generate_smart_suggestions', {
        p_user_id: user.id
      });

      if (error) throw error;
      await fetchSuggestions();
      toast.success('Smart suggestions updated');
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate suggestions');
    } finally {
      setLoading(false);
    }
  };

  // Accept suggestion
  const acceptSuggestion = async (suggestionId: string) => {
    try {
      const { error } = await supabase
        .from('smart_event_suggestions')
        .update({ is_accepted: true })
        .eq('id', suggestionId);

      if (error) throw error;
      await fetchSuggestions();
      toast.success('Event added to your interests');
    } catch (error) {
      console.error('Error accepting suggestion:', error);
      toast.error('Failed to accept suggestion');
    }
  };

  // Dismiss suggestion
  const dismissSuggestion = async (suggestionId: string) => {
    try {
      const { error } = await supabase
        .from('smart_event_suggestions')
        .update({ is_dismissed: true })
        .eq('id', suggestionId);

      if (error) throw error;
      await fetchSuggestions();
    } catch (error) {
      console.error('Error dismissing suggestion:', error);
      toast.error('Failed to dismiss suggestion');
    }
  };

  // Add manual calendar event
  const addManualEvent = async (eventData: {
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
    location?: string;
    is_all_day?: boolean;
  }) => {
    if (!user) return;
    
    try {
      // Find or create a manual calendar
      let manualCalendar = calendars.find(c => c.provider === 'manual');
      
      if (!manualCalendar) {
        const { data: newCalendar, error: calError } = await supabase
          .from('user_calendars')
          .insert({
            user_id: user.id,
            provider: 'manual',
            calendar_id: 'manual-' + user.id,
            calendar_name: 'My Calendar',
            is_primary: calendars.length === 0,
          })
          .select()
          .single();

        if (calError) throw calError;
        manualCalendar = newCalendar;
        setCalendars(prev => [...prev, newCalendar]);
      }

      const { error } = await supabase
        .from('calendar_events')
        .insert({
          user_id: user.id,
          calendar_id: manualCalendar.id,
          external_event_id: 'manual-' + Date.now(),
          ...eventData
        });

      if (error) throw error;
      await fetchEvents();
      toast.success('Event added to calendar');
    } catch (error) {
      console.error('Error adding event:', error);
      toast.error('Failed to add event');
    }
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