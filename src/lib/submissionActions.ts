/**
 * What an organizer may do with one of their own event submissions, and what
 * its history says. Pure functions over the row, so the rules live in one
 * place and the dashboard only renders them.
 *
 * THE RULES FOLLOW THE RLS POLICIES IN PRODUCTION, not the ones we want.
 * Until migration 20260926000001 is applied (Deferred D1 in
 * docs/page-plans/account.md), user_submitted_events has no DELETE policy for
 * the owner and the owner's UPDATE policy matches only `status = 'pending'`.
 * A delete or an edit outside that returns zero rows and no error, which is how
 * the old dashboard came to toast "Event deleted successfully" for a row that
 * was still there. So the buttons that would fail are not offered, and the
 * mutations treat a zero-row answer as the refusal it is.
 */
import { formatInCentralTime } from "@/lib/timezone";

/**
 * Flip to true in the PR that applies 20260926000001, after a DELETE on a
 * `rejected` row as its owner comes back with the row.
 */
export const SUBMISSION_OWNER_DELETE_ENABLED = false;

/**
 * Same migration, second policy: the owner may edit a `needs_revision` row and
 * the edit returns it to `pending`. Until then a `needs_revision` row offers
 * "Resubmit a copy", which is an INSERT and works under today's policies.
 */
export const SUBMISSION_REVISION_EDIT_ENABLED = SUBMISSION_OWNER_DELETE_ENABLED;

export type SubmissionStatus = "pending" | "approved" | "rejected" | "needs_revision";

/** The fields of a submission these rules read. */
export interface SubmissionFacts {
  status: SubmissionStatus;
  submitted_at?: string | null;
  triaged_at?: string | null;
  auto_decided?: boolean | null;
  admin_reviewed_at?: string | null;
  admin_notes?: string | null;
  live_event_id?: string | null;
  live_view_count?: number | null;
}

export interface SubmissionActionSet {
  /** Edit in place (an UPDATE). */
  canEdit: boolean;
  /** Open the form pre-filled from this row and send a new INSERT. */
  canResubmitCopy: boolean;
  canDelete: boolean;
}

export interface SubmissionActionFlags {
  deleteEnabled?: boolean;
  revisionEditEnabled?: boolean;
}

export function submissionActions(
  row: Pick<SubmissionFacts, "status">,
  flags: SubmissionActionFlags = {},
): SubmissionActionSet {
  const deleteEnabled = flags.deleteEnabled ?? SUBMISSION_OWNER_DELETE_ENABLED;
  const revisionEditEnabled = flags.revisionEditEnabled ?? SUBMISSION_REVISION_EDIT_ENABLED;
  const { status } = row;

  const canEdit = status === "pending" || (status === "needs_revision" && revisionEditEnabled);
  const canResubmitCopy = status === "rejected" || (status === "needs_revision" && !revisionEditEnabled);
  const canDelete =
    deleteEnabled && (status === "pending" || status === "needs_revision" || status === "rejected");

  return { canEdit, canResubmitCopy, canDelete };
}

/** A delete that came back with no row: RLS refused it, or it was already gone. */
export class SubmissionNotDeletedError extends Error {
  constructor() {
    super("We couldn't delete this submission.");
    this.name = "SubmissionNotDeletedError";
  }
}

/** An edit that came back with no row: the submission has left an editable state. */
export class SubmissionNotEditableError extends Error {
  constructor() {
    super("This submission can no longer be edited.");
    this.name = "SubmissionNotEditableError";
  }
}

/** PostgREST's code for `.single()` over zero rows. */
export function isZeroRowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST116"
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TimelineStepKind = "submitted" | "checked" | "reviewed" | "live" | "waiting";
export type TimelineTone = "done" | "current" | "problem";

export interface TimelineStep {
  kind: TimelineStepKind;
  tone: TimelineTone;
  label: string;
  /** Central time, already formatted. */
  when?: string;
  detail?: string;
}

const WHEN_FORMAT = "MMM d 'at' h:mm a";

function minutesBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

function afterSubmitted(minutes: number | null): string {
  if (minutes === null) return "";
  if (minutes < 1) return " less than a minute after you submitted";
  if (minutes === 1) return " 1 minute after you submitted";
  if (minutes < 120) return ` ${minutes} minutes after you submitted`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return ` ${hours} hours after you submitted`;
  return ` ${Math.round(hours / 24)} days after you submitted`;
}

function safeCentral(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return formatInCentralTime(value, WHEN_FORMAT);
  } catch {
    return undefined;
  }
}

/**
 * A person reviewed the row, as opposed to the automatic check stamping it.
 * publish_submission sets admin_reviewed_at on the automatic approve path
 * too, within seconds of triaged_at, so an auto-decided row counts as
 * human-reviewed only when the review came clearly later.
 */
function wasReviewedByPerson(row: SubmissionFacts): boolean {
  if (!row.admin_reviewed_at) return false;
  if (!row.auto_decided || !row.triaged_at) return true;
  const gap = minutesBetween(row.triaged_at, row.admin_reviewed_at);
  return gap !== null && gap > 1;
}

const OUTCOME: Record<SubmissionStatus, string> = {
  approved: "Reviewed and approved",
  rejected: "Reviewed and declined",
  needs_revision: "Reviewed and sent back for changes",
  // Edited after a review: the edit put it back in the queue.
  pending: "Reviewed earlier",
};

/**
 * What happened to a submission and when, from columns the row already has.
 * Nothing here estimates what happens next: there is no review deadline to
 * quote, so a waiting row says it is waiting and stops.
 */
export function buildSubmissionTimeline(row: SubmissionFacts): TimelineStep[] {
  const steps: TimelineStep[] = [];

  steps.push({ kind: "submitted", tone: "done", label: "Submitted", when: safeCentral(row.submitted_at) });

  if (row.triaged_at) {
    const lag = row.submitted_at ? minutesBetween(row.submitted_at, row.triaged_at) : null;
    const decidedHere = !!row.auto_decided && !wasReviewedByPerson(row);
    let detail: string;
    if (decidedHere && row.status === "approved") detail = "Approved automatically.";
    else if (decidedHere && row.status === "rejected") detail = "Declined automatically.";
    else detail = "Passed to a person to review.";
    steps.push({
      kind: "checked",
      tone: decidedHere && row.status === "rejected" ? "problem" : "done",
      label: `Checked automatically${afterSubmitted(lag)}`,
      when: safeCentral(row.triaged_at),
      detail,
    });
  }

  if (wasReviewedByPerson(row)) {
    const tone: TimelineTone =
      row.status === "rejected" || row.status === "needs_revision" ? "problem" : "done";
    steps.push({
      kind: "reviewed",
      tone,
      label: OUTCOME[row.status],
      when: safeCentral(row.admin_reviewed_at),
      detail: row.admin_notes?.trim() || undefined,
    });
  } else if (row.admin_notes?.trim()) {
    // An automatic decline writes its reason into admin_notes.
    steps.push({ kind: "reviewed", tone: "problem", label: "Note on your submission", detail: row.admin_notes.trim() });
  }

  if (row.live_event_id) {
    const views = row.live_view_count;
    const label =
      typeof views === "number"
        ? `Live, ${views.toLocaleString("en-US")} ${views === 1 ? "view" : "views"}`
        : "Live";
    steps.push({ kind: "live", tone: "done", label });
  } else if (row.status === "approved") {
    steps.push({
      kind: "waiting",
      tone: "current",
      label: "Approved, not listed yet",
      detail: "We haven't found a live listing for it. It appears here once it's published.",
    });
  } else if (row.status === "pending") {
    steps.push({ kind: "waiting", tone: "current", label: "Waiting for review" });
  }

  return steps;
}
