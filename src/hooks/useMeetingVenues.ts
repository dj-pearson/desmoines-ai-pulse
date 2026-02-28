import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MeetingVenue {
  id: string;
  name: string;
  slug: string;
  venue_type: string | null;
  max_capacity: number | null;
  min_capacity: number | null;
  sq_footage: number | null;
  amenities: string[];
  catering: string | null;
  av_equipment: boolean;
  website: string | null;
  contact_email: string | null;
  image_url: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface RfpSubmission {
  event_name: string;
  event_dates: string;
  expected_attendance: number;
  venue_requirements: string;
  budget_range: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  organization: string;
  notes: string;
}

export function useMeetingVenues(filters?: { venueType?: string; minCapacity?: number }) {
  return useQuery({
    queryKey: ['meeting-venues', filters],
    queryFn: async (): Promise<MeetingVenue[]> => {
      let query = supabase
        .from('meeting_venues')
        .select('*')
        .order('max_capacity', { ascending: false });

      if (filters?.venueType && filters.venueType !== 'all') {
        query = query.eq('venue_type', filters.venueType);
      }
      if (filters?.minCapacity) {
        query = query.gte('max_capacity', filters.minCapacity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MeetingVenue[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useSubmitRfp() {
  return useMutation({
    mutationFn: async (rfp: RfpSubmission) => {
      const { error } = await supabase
        .from('rfp_submissions')
        .insert(rfp as Record<string, unknown>);

      if (error) throw error;
    },
  });
}

const VENUE_TYPE_LABELS: Record<string, string> = {
  conference_center: 'Conference Center',
  hotel: 'Hotel',
  unique_venue: 'Unique Venue',
  outdoor: 'Outdoor',
};

const CATERING_LABELS: Record<string, string> = {
  in_house: 'In-House Catering',
  external: 'External Catering',
  both: 'In-House & External',
};

export function getVenueTypeLabel(type: string): string {
  return VENUE_TYPE_LABELS[type] || type;
}

export function getCateringLabel(catering: string): string {
  return CATERING_LABELS[catering] || catering;
}
