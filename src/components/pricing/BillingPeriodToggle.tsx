import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type BillingPeriod = "monthly" | "yearly";

interface BillingPeriodToggleProps {
  value: BillingPeriod;
  onChange: (value: BillingPeriod) => void;
  /** Largest whole-percent saving a paid plan gets by paying yearly; null hides the note. */
  maxYearlySavingsPct: number | null;
}

/**
 * Monthly or yearly, as one labelled control with two options.
 *
 * This was a Switch between two <Label>s, which a screen reader announced as
 * "Monthly, switch, off" - the state name described the opposite of what the
 * visitor had picked half the time. A single-select toggle group says which
 * option is pressed.
 */
export function BillingPeriodToggle({ value, onChange, maxYearlySavingsPct }: BillingPeriodToggleProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <ToggleGroup
        type="single"
        value={value}
        // Radix sends "" when the pressed item is clicked again. A billing
        // period is never "none", so that click is ignored.
        onValueChange={(next) => {
          if (next === "monthly" || next === "yearly") onChange(next);
        }}
        aria-label="Billing period"
        className="rounded-lg border bg-card p-1"
      >
        <ToggleGroupItem
          value="monthly"
          className="min-h-11 px-5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem
          value="yearly"
          className="min-h-11 px-5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          Yearly
        </ToggleGroupItem>
      </ToggleGroup>
      {maxYearlySavingsPct !== null && maxYearlySavingsPct > 0 && (
        <p className="text-sm text-muted-foreground">
          Paying yearly saves up to {maxYearlySavingsPct}% against twelve monthly payments.
        </p>
      )}
    </div>
  );
}
