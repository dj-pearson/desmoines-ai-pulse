import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeferredSelectProps } from "./deferred-select";

export interface DeferredSelectImplProps extends DeferredSelectProps {
  /** True when the swap came from a click or arrow key, so the list opens. */
  defaultOpen: boolean;
}

/**
 * The real Radix Select behind DeferredSelect. Loaded on the first click or
 * arrow key; never import it statically (deferredSelectLazy.test.ts).
 */
export function DeferredSelectImpl({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  "aria-label": ariaLabel,
  triggerClassName,
  valueClassName,
  leading,
  defaultOpen,
}: DeferredSelectImplProps) {
  return (
    <Select value={value} onValueChange={onValueChange} defaultOpen={defaultOpen}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClassName}>
        {leading}
        <SelectValue placeholder={placeholder} className={valueClassName} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
