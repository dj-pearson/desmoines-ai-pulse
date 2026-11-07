/**
 * The four answers a visitor can give to "are you going?", and the words
 * shown for each. EventCheckIn's buttons and the toast in
 * useCommunityFeatures read the same map, so the toast can no longer say
 * "Marked as not_going!" while the button says "Not Going".
 *
 * The keys are the stored event_attendance.status values; do not rename them.
 */
export const CHECK_IN_STATUSES = ["going", "interested", "maybe", "not_going"] as const;

export type CheckInStatus = (typeof CHECK_IN_STATUSES)[number];

export const CHECK_IN_LABELS: Record<CheckInStatus, string> = {
  going: "Going",
  interested: "Interested",
  maybe: "Maybe",
  not_going: "Not going",
};

/** Toast text after a successful check-in. */
export function checkInToastMessage(status: CheckInStatus): string {
  return `Marked as ${CHECK_IN_LABELS[status].toLowerCase()}`;
}
