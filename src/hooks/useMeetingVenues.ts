import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';
import type { ContactFormData } from '@/hooks/useContactForm';

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

/**
 * What a venue card renders, and nothing else (plan-stay-pass2 WP3 item 9).
 * Every column is in scripts/db-snapshot.json. contact_email is read by no
 * card and stays out.
 */
export const MEETING_VENUE_COLUMNS =
  'id, name, slug, venue_type, max_capacity, sq_footage, catering, av_equipment, website, description';

export type MeetingVenueCard = Pick<
  MeetingVenue,
  'id' | 'name' | 'slug' | 'venue_type' | 'max_capacity' | 'sq_footage' | 'catering' | 'av_equipment' | 'website' | 'description'
>;

/**
 * Former names the seeded rows still carry, and what a page should say today.
 * The arena has been Casey's Center since the rename; the meeting_venues seed
 * (20260228000007) still describes it as Wells Fargo Arena until the D12 data
 * migration. Display only: the stored text is left alone.
 */
const FORMER_VENUE_NAMES: ReadonlyArray<readonly [RegExp, string]> = [[/Wells Fargo Arena/g, "Casey's Center"]];

export function withCurrentVenueNames(text: string): string;
export function withCurrentVenueNames(text: string | null): string | null;
export function withCurrentVenueNames(text: string | null): string | null {
  if (!text) return text;
  return FORMER_VENUE_NAMES.reduce((out, [from, to]) => out.replace(from, to), text);
}

export interface RfpSubmission {
  event_name: string;
  event_dates: string;
  /** Null when the planner left it blank: "not given" is not zero people. */
  expected_attendance: number | null;
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
    queryFn: async (): Promise<MeetingVenueCard[]> => {
      // nullsFirst: false, or PostgREST's descending default puts venues with
      // no capacity on file at the top of the list.
      let query = supabase
        .from('meeting_venues')
        .select(MEETING_VENUE_COLUMNS)
        .order('max_capacity', { ascending: false, nullsFirst: false });

      if (filters?.venueType && filters.venueType !== 'all') {
        query = query.eq('venue_type', filters.venueType);
      }
      if (filters?.minCapacity) {
        query = query.gte('max_capacity', filters.minCapacity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as MeetingVenueCard[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * The RFP form as typed, before it is turned into a row. Every field is a
 * string because that is what an input holds; toRfpSubmission converts.
 */
export type RfpFormValues = Record<keyof RfpSubmission, string>;

export const EMPTY_RFP_FORM: RfpFormValues = {
  event_name: '',
  event_dates: '',
  expected_attendance: '',
  venue_requirements: '',
  budget_range: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  organization: '',
  notes: '',
};

/**
 * Longest value each field accepts, rendered as maxLength on the input and
 * checked again in validateRfp (plan-stay WP3 item 3). CLIENT-SIDE ONLY: the
 * anon INSERT on rfp_submissions is still open to anyone who skips this page,
 * and closing it is D6 (a submit-group-rfp edge function), not this file.
 */
export const RFP_MAX_LENGTH: Record<keyof RfpSubmission, number> = {
  event_name: 200,
  event_dates: 120,
  expected_attendance: 6,
  venue_requirements: 2000,
  budget_range: 120,
  contact_name: 120,
  contact_email: 254,
  contact_phone: 40,
  organization: 200,
  notes: 2000,
};

export const RFP_REQUIRED: ReadonlyArray<keyof RfpSubmission> = ['event_name', 'contact_name', 'contact_email'];

/** Deliberately loose: one @, something on each side, a dot in the domain. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Largest attendance figure accepted: well past any single room in the metro. */
export const RFP_MAX_ATTENDANCE = 100000;

export type RfpErrors = Partial<Record<keyof RfpSubmission, string>>;

/** Field-level errors for the RFP form; an empty object means it can be sent. */
export function validateRfp(values: RfpFormValues): RfpErrors {
  const errors: RfpErrors = {};
  for (const field of RFP_REQUIRED) {
    if (!values[field].trim()) errors[field] = 'Required';
  }
  (Object.keys(RFP_MAX_LENGTH) as Array<keyof RfpSubmission>).forEach((field) => {
    if (!errors[field] && values[field].length > RFP_MAX_LENGTH[field]) {
      errors[field] = `Keep this under ${RFP_MAX_LENGTH[field]} characters`;
    }
  });
  const email = values.contact_email.trim();
  if (!errors.contact_email && email && !EMAIL_PATTERN.test(email)) {
    errors.contact_email = 'Enter an email address like name@example.com';
  }
  const attendance = values.expected_attendance.trim();
  if (!errors.expected_attendance && attendance) {
    const n = Number(attendance);
    if (!Number.isInteger(n) || n < 1 || n > RFP_MAX_ATTENDANCE) {
      errors.expected_attendance = `Enter a whole number from 1 to ${RFP_MAX_ATTENDANCE.toLocaleString('en-US')}`;
    }
  }
  return errors;
}

/** Trimmed row for the insert. Call only after validateRfp returned no errors. */
export function toRfpSubmission(values: RfpFormValues): RfpSubmission {
  const trimmed = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim()]),
  ) as RfpFormValues;
  const attendance = trimmed.expected_attendance ? Number(trimmed.expected_attendance) : NaN;
  return { ...trimmed, expected_attendance: Number.isFinite(attendance) ? attendance : null };
}

/** Where the RFP lands in the admin inbox (FeedbackInbox filters on source_page). */
export const RFP_SOURCE_PAGE = '/group-travel';

const RFP_MESSAGE_LINES: ReadonlyArray<readonly [keyof RfpSubmission, string]> = [
  ['event_name', 'Event'],
  ['event_dates', 'Preferred dates'],
  ['expected_attendance', 'Expected attendance'],
  ['budget_range', 'Budget range'],
  ['organization', 'Organization'],
];

/**
 * The RFP as a contact_submissions row (plan-stay-pass2 WP3 item 1).
 *
 * rfp_submissions has no reader; contact_submissions has the admin inbox,
 * moderation and support-ticket mirroring, and anon INSERT (RLS_AUDIT.md:231).
 * So the request goes there as a 'business' inquiry, with every field the
 * planner filled in laid out in the message. Blank fields are left out rather
 * than printed as "Budget range: ". Call only after validateRfp passed.
 */
export function toRfpContact(values: RfpFormValues): ContactFormData {
  const row = toRfpSubmission(values);
  const lines: string[] = [];
  for (const [field, label] of RFP_MESSAGE_LINES) {
    const value = row[field];
    if (value !== null && value !== '') lines.push(`${label}: ${value}`);
  }
  if (row.venue_requirements) lines.push('', 'Venue requirements:', row.venue_requirements);
  if (row.notes) lines.push('', 'Notes:', row.notes);
  return {
    name: row.contact_name,
    email: row.contact_email,
    phone: row.contact_phone || undefined,
    subject: `Group RFP: ${row.event_name}`,
    message: lines.join('\n'),
    inquiry_type: 'business',
  };
}

/**
 * The old write path. Nothing on the site calls it since pass 2 WP3 item 1;
 * it stays (with its table) so the retirement follows the D6 deprecation path
 * rather than landing in the same release.
 */
export function useSubmitRfp() {
  return useMutation({
    mutationFn: async (rfp: RfpSubmission) => {
      // supabase-js resolves with { error } rather than throwing, so the error
      // has to be read here for the caller's catch (and onError) to see it.
      const { error } = await supabase
        .from('rfp_submissions')
        .insert(rfp);

      if (error) throw error;
    },
    onError: (error) => {
      handleError(error, { component: 'GroupTravel', action: 'submitRfp' });
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
