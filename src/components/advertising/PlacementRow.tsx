import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/campaignDisplay";
import type { PlacementSpec } from "@/lib/placementSpecs";

export interface PlacementRowProps {
  spec: PlacementSpec;
  /** The rate card's base daily rate, or null when the card couldn't be read. */
  dailyRate: number | null;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The server's price for this placement over the chosen dates, once known. */
  lineTotal?: number | null;
  days?: number | null;
}

/**
 * One purchasable placement on /advertise (business plan WP1 item 8): name,
 * where it shows, its daily rate, and the design specs behind a disclosure.
 * The full asset rules live on the upload page, where they're checked.
 *
 * "From" because the rate card discounts longer runs; the exact figure for
 * the chosen dates comes from the server and shows as `lineTotal`.
 */
export function PlacementRow({ spec, dailyRate, checked, onCheckedChange, lineTotal, days }: PlacementRowProps) {
  const id = `placement-${spec.type}`;
  const labelId = `placement-label-${spec.type}`;
  const whereId = `placement-where-${spec.type}`;

  return (
    <li
      className={cn(
        "rounded-xl border p-4 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {/*
          Radix renders Checkbox as a <button role="checkbox"> with only an
          icon inside, so it needs an explicit name (WCAG 4.1.2). The padding
          wrapper gives it a 44px target without changing how it looks.
        */}
        <label htmlFor={id} className="-m-2.5 flex cursor-pointer p-2.5">
          <Checkbox
            id={id}
            aria-labelledby={labelId}
            aria-describedby={whereId}
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <label htmlFor={id} id={labelId} className="cursor-pointer font-semibold">
              {spec.name}
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {dailyRate !== null ? `From ${formatUSD(dailyRate)}/day` : "Rate unavailable"}
            </span>
          </div>
          <p id={whereId} className="mt-1 text-sm text-muted-foreground">
            {spec.description}
          </p>
          {checked && lineTotal !== null && lineTotal !== undefined && days ? (
            <p className="mt-1 text-sm tabular-nums">
              {formatUSD(lineTotal)} for {days} {days === 1 ? "day" : "days"}
            </p>
          ) : null}
          <details className="group mt-2 text-sm">
            <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-primary underline-offset-4 hover:underline">
              {spec.noCreativeRequired ? "How it works" : "Sizes and specs"}
            </summary>
            <div className="space-y-2 pb-1 text-muted-foreground">
              {spec.noCreativeRequired ? null : (
                <p>
                  {spec.dimensions.map((d) => d.label).join(", ")}. {spec.formats.join(", ")}, up to{" "}
                  {spec.maxSizeLabel}. {spec.animationType}.
                </p>
              )}
              <ul className="list-disc space-y-0.5 pl-5">
                {spec.specifications.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </div>
    </li>
  );
}
