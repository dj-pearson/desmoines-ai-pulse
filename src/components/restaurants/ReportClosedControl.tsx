import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClosureReportRefused, reportRestaurantClosed } from "@/lib/closureReviews";
import { handleError } from "@/lib/errorHandler";

interface ReportClosedControlProps {
  restaurantId: string;
  restaurantName: string;
}

type State = "idle" | "open" | "sending" | "sent";

/**
 * WEB-FEAT-102. Works signed out. A report goes to the admin closure queue and
 * changes nothing on the listing, so the confirmation says it was received,
 * never that the listing was updated.
 */
export function ReportClosedControl({ restaurantId, restaurantName }: ReportClosedControlProps) {
  const [state, setState] = useState<State>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      await reportRestaurantClosed(restaurantId, note);
      setState("sent");
    } catch (e) {
      if (e instanceof ClosureReportRefused) {
        setError(e.message);
      } else {
        handleError(e, { component: "ReportClosedControl", action: "report" });
        setError("We couldn't send that. Please try again in a minute.");
      }
      setState("open");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="text-sm text-muted-foreground" data-testid="report-closed-sent">
        Thanks. We received your report and will check {restaurantName}. The listing hasn't been changed.
      </p>
    );
  }

  if (state === "idle") {
    return (
      <Button
        type="button"
        variant="link"
        className="h-auto min-h-11 px-0 text-sm text-muted-foreground"
        onClick={() => setState("open")}
      >
        Has this place closed? Report it
      </Button>
    );
  }

  return (
    <form
      className="space-y-2"
      aria-label={`Report ${restaurantName} as closed`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="report-closed-note" className="text-sm font-medium">
        What did you see? <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <Textarea
        id="report-closed-note"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder="For example: sign on the door, building empty, phone disconnected"
        rows={2}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={state === "sending"}>
          {state === "sending" ? "Sending..." : "Send report"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setState("idle")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
