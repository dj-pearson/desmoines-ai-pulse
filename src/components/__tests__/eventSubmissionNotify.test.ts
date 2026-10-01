import { describe, it, expect } from 'vitest';
import { NOTIFICATION_TYPE } from '@/components/admin/EventSubmissionsManager';

/**
 * WEB-ADS-008. EventSubmissionForm tells every organizer "We'll email you when
 * your event is approved or if we need more information."
 *
 * The AI path kept that promise: triage-event-submission invokes
 * notify-event-submission on any non-pending decision. The human path - an
 * admin pressing Approve or Reject in the queue - sent nothing, so an
 * organizer reviewed by a person heard nothing back and could not tell an
 * approval from silence.
 *
 * The mapping is what this pins. Getting it wrong is not a crash: it either
 * mails the wrong template or, for a status that maps to nothing, quietly goes
 * back to sending no mail at all.
 */
describe('submission decision -> notification type', () => {
  it('maps every decided status to a submitter template', () => {
    expect(NOTIFICATION_TYPE.approved).toBe('event_approved');
    expect(NOTIFICATION_TYPE.rejected).toBe('event_rejected');
    expect(NOTIFICATION_TYPE.needs_revision).toBe('event_needs_revision');
  });

  it('sends nothing for pending, which is not a decision', () => {
    expect(NOTIFICATION_TYPE.pending).toBeNull();
  });

  it('covers every status the queue can set', () => {
    // Submission["status"] in the manager. A status added here without a
    // mapping falls through to "no email", which is the bug this fixes.
    for (const status of ['pending', 'approved', 'rejected', 'needs_revision']) {
      expect(status in NOTIFICATION_TYPE).toBe(true);
    }
  });

  it('uses only the types notify-event-submission implements', () => {
    // The function's switch has event_submitted (to admins) plus these three.
    // A type it does not implement means a silently unsent email.
    const implemented = ['event_approved', 'event_rejected', 'event_needs_revision'];
    for (const value of Object.values(NOTIFICATION_TYPE)) {
      if (value !== null) expect(implemented).toContain(value);
    }
  });
});
