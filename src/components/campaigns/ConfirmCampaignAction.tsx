import { useId, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmCampaignActionProps {
  /** What the trigger button says ("Cancel", "Request refund"). */
  triggerLabel: ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerIcon?: ReactNode;
  title: string;
  description: ReactNode;
  /** The confirming button inside the dialog ("Cancel campaign"). */
  confirmLabel: string;
  /** What the button that closes the dialog says. Not "Cancel", which reads as the action. */
  dismissLabel?: string;
  /** When set, the dialog asks for a reason of at least this many characters. */
  reason?: { label: string; minLength: number; hint?: string };
  disabled?: boolean;
  /** Runs the action. The dialog closes when it settles; the caller reports the outcome. */
  onConfirm: (reason: string) => Promise<void>;
}

/**
 * A confirmation step in front of a campaign action that can't be taken back
 * (cancel, request a refund). The trigger is a small button; the action runs
 * only from inside the dialog.
 */
export function ConfirmCampaignAction({
  triggerLabel,
  triggerVariant = "ghost",
  triggerIcon,
  title,
  description,
  confirmLabel,
  dismissLabel = "Keep it",
  reason,
  disabled,
  onConfirm,
}: ConfirmCampaignActionProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const reasonId = useId();
  const hintId = useId();

  const trimmed = text.trim();
  const reasonShort = !!reason && trimmed.length < reason.minLength;

  const confirm = async () => {
    if (running || reasonShort) return;
    setRunning(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setRunning(false);
      setOpen(false);
      setText("");
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!running) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} disabled={disabled} className="min-h-11 sm:min-h-9">
          {triggerIcon}
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {reason && (
          <div className="space-y-2">
            <Label htmlFor={reasonId}>{reason.label}</Label>
            <Textarea
              id={reasonId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={hintId}
              aria-invalid={text.length > 0 && reasonShort}
              rows={4}
            />
            <p id={hintId} className="text-xs text-muted-foreground">
              {reason.hint ?? `At least ${reason.minLength} characters.`}
              {text.length > 0 && reasonShort ? ` ${reason.minLength - trimmed.length} more to go.` : ""}
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>{dismissLabel}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirm()}
            disabled={running || reasonShort}
            aria-busy={running}
          >
            {running ? "Working..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
