import { useCallback, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { handleError } from "@/lib/errorHandler";
import type { DeferredSelectImplProps } from "./deferred-select-impl";

export interface DeferredSelectOption {
  value: string;
  /** Rendered in the list and, for the selected option, in the trigger. */
  label: ReactNode;
}

export interface DeferredSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly DeferredSelectOption[];
  placeholder?: ReactNode;
  id?: string;
  "aria-label"?: string;
  triggerClassName?: string;
  valueClassName?: string;
  /** Drawn before the value inside the trigger, e.g. an icon. */
  leading?: ReactNode;
}

/**
 * ui/select.tsx's SelectTrigger classes, copied rather than imported: a
 * shared module would become its own chunk on every route that still uses
 * ui/select. deferredSelectLazy.test.ts fails if the two drift apart.
 */
export const SELECT_TRIGGER_CLASS =
  "flex h-10 coarse:min-h-[44px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer [&>span]:line-clamp-1";

type Impl = ComponentType<DeferredSelectImplProps>;

let loaded: Impl | null = null;
let pending: Promise<Impl> | null = null;

/** Fetch the Radix half once; a failed fetch can be retried on the next click. */
function loadImpl(): Promise<Impl> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("./deferred-select-impl").then(
    (m) => (loaded = m.DeferredSelectImpl),
    (error: unknown) => {
      pending = null;
      throw error;
    }
  );
  return pending;
}

function prefetch() {
  loadImpl().catch(() => {
    // The click retries and reports; a failed hover prefetch is not an error.
  });
}

/**
 * A single-choice dropdown that ships no Radix until someone opens it
 * (WEB-PERF-074).
 *
 * Until the first click or arrow key it draws a static trigger with the
 * Radix trigger's classes, role and closed ARIA state, so the page looks and
 * reads the same. That interaction fetches @radix-ui/react-select and swaps
 * in the real Select already open; Radix then owns focus and returns it to
 * its own trigger on close. Hover, focus and pointerdown prefetch the chunk
 * so the swap rarely waits on the network.
 *
 * Use it for a closed sort or filter control on a public page. A form field
 * that needs Radix's hidden native select for submission should use
 * ui/select directly.
 */
export function DeferredSelect(props: DeferredSelectProps) {
  const { value, options, placeholder, id, triggerClassName, valueClassName, leading } = props;
  const [live, setLive] = useState<{ Component: Impl; open: boolean } | null>(null);

  const activate = useCallback((open: boolean) => {
    loadImpl()
      .then((Component) => setLive((current) => current ?? { Component, open }))
      .catch((error: unknown) => handleError(error, { component: "DeferredSelect", action: "load" }));
  }, []);

  if (live) return <live.Component {...props} defaultOpen={live.open} />;

  const selected = options.find((option) => option.value === value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space reach onClick through the button's default action.
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      activate(true);
    }
  };

  return (
    <button
      type="button"
      role="combobox"
      id={id}
      aria-label={props["aria-label"]}
      aria-expanded={false}
      aria-autocomplete="none"
      data-state="closed"
      data-placeholder={selected ? undefined : ""}
      className={cn(SELECT_TRIGGER_CLASS, triggerClassName)}
      onPointerEnter={prefetch}
      onPointerDown={prefetch}
      onFocus={prefetch}
      onClick={() => activate(true)}
      onKeyDown={onKeyDown}
    >
      {leading}
      <span className={valueClassName} style={{ pointerEvents: "none" }}>
        {selected ? selected.label : placeholder}
      </span>
      <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
    </button>
  );
}
