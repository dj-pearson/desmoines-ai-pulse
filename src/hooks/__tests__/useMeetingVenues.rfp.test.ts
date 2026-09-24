import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  EMPTY_RFP_FORM,
  RFP_MAX_LENGTH,
  toRfpSubmission,
  validateRfp,
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

  it('sends 0 for a blank attendance, as the form always has', () => {
    expect(toRfpSubmission(valid).expected_attendance).toBe(0);
  });
});
