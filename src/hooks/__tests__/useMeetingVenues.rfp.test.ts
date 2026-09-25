import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  EMPTY_RFP_FORM,
  RFP_MAX_LENGTH,
  MEETING_VENUE_COLUMNS,
  toRfpContact,
  toRfpSubmission,
  validateRfp,
  withCurrentVenueNames,
  type RfpFormValues,
} from '@/hooks/useMeetingVenues';

const valid: RfpFormValues = {
  ...EMPTY_RFP_FORM,
  event_name: 'Board retreat',
  contact_name: 'Pat Doe',
  contact_email: 'pat@example.com',
};

describe('validateRfp (plan-stay WP3 item 3)', () => {
  it('accepts a form with the three required fields', () => {
    expect(validateRfp(valid)).toEqual({});
  });

  it('requires event name, contact name and email, ignoring whitespace', () => {
    const errors = validateRfp({ ...EMPTY_RFP_FORM, event_name: '   ' });
    expect(Object.keys(errors).sort()).toEqual(['contact_email', 'contact_name', 'event_name']);
  });

  it('rejects a malformed email', () => {
    expect(validateRfp({ ...valid, contact_email: 'pat@example' }).contact_email).toMatch(/email/i);
    expect(validateRfp({ ...valid, contact_email: 'pat example.com' }).contact_email).toBeTruthy();
  });

  it('rejects text past the field limit', () => {
    const notes = 'x'.repeat(RFP_MAX_LENGTH.notes + 1);
    expect(validateRfp({ ...valid, notes }).notes).toMatch(/under/);
    expect(validateRfp({ ...valid, notes: 'x'.repeat(RFP_MAX_LENGTH.notes) }).notes).toBeUndefined();
  });

  it('allows a blank attendance but not a fraction, zero or a huge number', () => {
    expect(validateRfp({ ...valid, expected_attendance: '' }).expected_attendance).toBeUndefined();
    expect(validateRfp({ ...valid, expected_attendance: '120' }).expected_attendance).toBeUndefined();
    expect(validateRfp({ ...valid, expected_attendance: '12.5' }).expected_attendance).toBeTruthy();
    expect(validateRfp({ ...valid, expected_attendance: '0' }).expected_attendance).toBeTruthy();
    expect(validateRfp({ ...valid, expected_attendance: '999999' }).expected_attendance).toBeTruthy();
  });
});

describe('toRfpSubmission', () => {
  it('trims every field and turns attendance into a number', () => {
    const row = toRfpSubmission({ ...valid, event_name: '  Retreat ', expected_attendance: ' 40 ' });
    expect(row.event_name).toBe('Retreat');
    expect(row.expected_attendance).toBe(40);
  });

  it('sends null for a blank attendance, not 0 (plan-stay-pass2 WP3 item 8)', () => {
    expect(toRfpSubmission(valid).expected_attendance).toBeNull();
    expect(toRfpSubmission({ ...valid, expected_attendance: '   ' }).expected_attendance).toBeNull();
  });
});

describe('toRfpContact (plan-stay-pass2 WP3 item 1)', () => {
  it('is a business inquiry with the event in the subject', () => {
    const row = toRfpContact({ ...valid, contact_phone: ' 515-555-0100 ' });
    expect(row.inquiry_type).toBe('business');
    expect(row.subject).toBe('Group RFP: Board retreat');
    expect(row.name).toBe('Pat Doe');
    expect(row.email).toBe('pat@example.com');
    expect(row.phone).toBe('515-555-0100');
  });

  it('lays out every filled field and leaves blank ones out', () => {
    const row = toRfpContact({
      ...valid,
      event_dates: 'March 15-17',
      expected_attendance: '40',
      venue_requirements: 'Interested in: Fixture Hall',
      notes: 'Vegetarian lunch',
    });
    expect(row.message).toContain('Event: Board retreat');
    expect(row.message).toContain('Preferred dates: March 15-17');
    expect(row.message).toContain('Expected attendance: 40');
    expect(row.message).toContain('Venue requirements:\nInterested in: Fixture Hall');
    expect(row.message).toContain('Notes:\nVegetarian lunch');
    expect(row.message).not.toMatch(/Budget range/);
    expect(row.message).not.toMatch(/Organization/);
  });

  it('never sends an empty phone string', () => {
    expect(toRfpContact(valid).phone).toBeUndefined();
  });
});

describe('the venue read', () => {
  it('names its columns instead of *', () => {
    expect(MEETING_VENUE_COLUMNS).not.toContain('*');
    expect(MEETING_VENUE_COLUMNS).toContain('website');
  });

  it('shows the arena under its current name', () => {
    const seeded = "Hy-Vee Hall (225,000 sq ft) and Wells Fargo Arena (16,980 seats).";
    expect(withCurrentVenueNames(seeded)).toBe("Hy-Vee Hall (225,000 sq ft) and Casey's Center (16,980 seats).");
    expect(withCurrentVenueNames(null)).toBeNull();
  });
});
