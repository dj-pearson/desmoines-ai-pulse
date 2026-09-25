import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EventSubmissionForm from "@/components/EventSubmissionForm";
import { SubmissionTimeline } from "@/components/account/SubmissionTimeline";
import {
  useDeleteEvent,
  useUserSubmittedEvents,
  type UserSubmittedEvent,
} from "@/hooks/useUserSubmittedEvents";
import { handleError } from "@/lib/errorHandler";
import { formatInCentralTime } from "@/lib/timezone";
import { SubmissionNotDeletedError, submissionActions } from "@/lib/submissionActions";

const STATUS_LABEL: Record<UserSubmittedEvent["status"], string> = {
  pending: "In review",
  approved: "Approved",
  rejected: "Declined",
  needs_revision: "Needs changes",
};

const STATUS_VARIANT: Record<UserSubmittedEvent["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
  needs_revision: "outline",
};

type FormMode = { kind: "edit" | "copy"; row: UserSubmittedEvent } | null;

function eventDay(date: string | undefined): string | null {
  if (!date) return null;
  try {
    return formatInCentralTime(date, "EEE, MMM d, yyyy");
  } catch {
    return null;
  }
}

/**
 * The organizer's own submissions, each with its history and the actions its
 * state allows (account plan WP4). Self-contained: the dashboard places it and
 * passes nothing.
 */
export function SubmissionsTab() {
  const { data: submissions, isLoading, isError, error, refetch } = useUserSubmittedEvents();
  const deleteEvent = useDeleteEvent();
  const [formMode, setFormMode] = useState<FormMode>(null);

  const handleDelete = async (row: UserSubmittedEvent) => {
    try {
      await deleteEvent.mutateAsync(row.id);
      toast.success(`Deleted "${row.title}"`);
    } catch (err) {
      if (err instanceof SubmissionNotDeletedError) {
        toast.error(err.message);
        return;
      }
      handleError(err, { component: "SubmissionsTab", action: "deleteSubmission" });
      toast.error("We couldn't delete this submission.");
    }
  };

  const closeForm = () => setFormMode(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My submitted events</CardTitle>
        <CardDescription>Where each of your submissions stands, and what happened to it so far.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your submissions">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : isError ? (
          <ErrorState
            error={error}
            compact
            title="Your submissions didn't load"
            description="They're still saved. Try again in a moment."
            onRetry={() => void refetch()}
          />
        ) : submissions && submissions.length > 0 ? (
          <ul className="space-y-4">
            {submissions.map((row) => {
              const actions = submissionActions(row);
              const day = eventDay(row.date);
              return (
                <li key={row.id} className="rounded-xl border p-4" data-testid="submission-row">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold leading-snug">{row.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[day, row.venue, row.category].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[row.status]} className="w-fit shrink-0">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </div>

                  <SubmissionTimeline submission={row} className="ml-1.5 mt-4" />

                  {(actions.canEdit || actions.canResubmitCopy || actions.canDelete) && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {actions.canEdit && (
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => setFormMode({ kind: "edit", row })}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Button>
                      )}
                      {actions.canResubmitCopy && (
                        <Button
                          variant="outline"
                          className="min-h-[44px]"
                          onClick={() => setFormMode({ kind: "copy", row })}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Resubmit a copy
                        </Button>
                      )}
                      {actions.canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Delete ${row.title}`}
                              disabled={deleteEvent.isPending}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{row.title}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                The submission and its review history go for good. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="min-h-[44px]">Keep it</AlertDialogCancel>
                              <AlertDialogAction
                                className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => void handleDelete(row)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-8 text-center">
            <h3 className="mb-1 text-lg font-semibold">No submissions yet</h3>
            <p className="mx-auto mb-4 max-w-prose text-sm text-muted-foreground">
              Running something in Des Moines? Submit it and follow it here from review to live listing.
            </p>
            <Button asChild className="min-h-[44px]">
              <Link to="/dashboard?tab=submit-event">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Submit an event
              </Link>
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={formMode !== null} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {formMode && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {formMode.kind === "edit" ? `Edit "${formMode.row.title}"` : `Resubmit "${formMode.row.title}"`}
                </DialogTitle>
                <DialogDescription>
                  {formMode.kind === "edit"
                    ? formMode.row.live_event_id
                      ? "Saving sends it back for review, and your live listing comes down until it's approved again."
                      : "Saving sends it back for review."
                    : "This sends a new submission for review. The original stays as it was."}
                </DialogDescription>
              </DialogHeader>
              <EventSubmissionForm
                key={`${formMode.kind}-${formMode.row.id}`}
                editEvent={formMode.kind === "edit" ? formMode.row : undefined}
                copyFrom={formMode.kind === "copy" ? formMode.row : undefined}
                onSuccess={() => {
                  closeForm();
                  void refetch();
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
