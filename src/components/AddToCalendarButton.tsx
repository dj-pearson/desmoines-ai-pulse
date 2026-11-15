import { useCallback, useState, type ComponentType, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from "lucide-react";
import { hasUsableDate, toIcsEvent } from '@/lib/icsEvent';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { handleError } from '@/lib/errorHandler';
import type { AddToCalendarMenuProps } from '@/components/AddToCalendarMenu';

interface AddToCalendarButtonProps {
  /**
   * A database event row. Adapted by `toIcsEvent`, which maps the description
   * fallback chain and turns `time_tbd` into an all-day export so a placeholder
   * start time never reaches someone's calendar (WEB-FEAT-026).
   */
  event: Parameters<typeof toIcsEvent>[0];
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  fullWidth?: boolean;
  /**
   * Render just the calendar icon, for dense action rows on list cards where a
   * labelled button would dominate. The accessible name still names the event,
   * so a screen reader hears which event it would be adding.
   */
  iconOnly?: boolean;
}

type Menu = ComponentType<AddToCalendarMenuProps>;

let loaded: Menu | null = null;
let pending: Promise<Menu> | null = null;

/** Fetch the Radix half once; a failed fetch can be retried on the next click. */
function loadMenu(): Promise<Menu> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import('@/components/AddToCalendarMenu').then(
    (m) => (loaded = m.AddToCalendarMenu),
    (error: unknown) => {
      pending = null;
      throw error;
    }
  );
  return pending;
}

function prefetch() {
  loadMenu().catch(() => {
    // The click retries and reports; a failed hover prefetch is not an error.
  });
}

/**
 * WEB-PERF-076. This module is the trigger only. The menu (Radix
 * DropdownMenu, which brings Menu, Popper, floating-ui, roving focus and
 * focus scope with it, plus the export handlers) lives in AddToCalendarMenu
 * and is fetched on the first click or arrow key. Every event card, the
 * quick view and the event detail page render this button, and few people
 * press it; it was the only DropdownMenu on the event routes.
 *
 * Until then it draws the same Button with the closed ARIA state Radix's
 * DropdownMenuTrigger sets. The interaction swaps in the real menu already
 * open (on click, not pointerdown, so no stray pointerup lands on the fresh
 * menu); Radix then owns focus and returns it to its own trigger on close.
 * Hover, focus and pointerdown prefetch the chunk so the swap rarely waits.
 */
export function AddToCalendarButton({
  event,
  variant = 'outline',
  size = 'default',
  className = '',
  fullWidth = false,
  iconOnly = false,
}: AddToCalendarButtonProps) {
  const [live, setLive] = useState<{ Component: Menu; fromKeyboard: boolean } | null>(null);

  const activate = useCallback((fromKeyboard: boolean) => {
    loadMenu()
      .then((Component) => setLive((current) => current ?? { Component, fromKeyboard }))
      .catch((error: unknown) =>
        handleError(error, { component: 'AddToCalendarButton', action: 'load' })
      );
  }, []);

  const icsEvent = toIcsEvent(event);

  // An event with no parseable start has nothing to export. Rendering nothing
  // is better than a control whose every option opens an error toast.
  if (!hasUsableDate(icsEvent)) return null;

  const buttonProps: AddToCalendarMenuProps['buttonProps'] = {
    variant,
    size: iconOnly ? 'icon' : size,
    className: `${fullWidth ? 'w-full' : ''} ${className}`,
    'aria-label': iconOnly ? `Add ${event.title} to calendar` : undefined,
  };
  const triggerContent = (
    <>
      <SpriteIcon name="calendar" className={iconOnly ? 'w-4 h-4' : 'w-4 h-4 mr-2'} />
      {!iconOnly && (
        <>
          Add to Calendar
          <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
        </>
      )}
    </>
  );

  if (live) {
    return (
      <live.Component
        icsEvent={icsEvent}
        buttonProps={buttonProps}
        triggerContent={triggerContent}
        focusFirstItem={live.fromKeyboard}
      />
    );
  }

  const onKeyDown = (keyEvent: KeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space reach onClick through the button's default action;
    // ArrowDown is the third key Radix's DropdownMenuTrigger opens on.
    if (keyEvent.key === 'ArrowDown') {
      keyEvent.preventDefault();
      activate(true);
    }
  };

  return (
    <Button
      {...buttonProps}
      type="button"
      aria-haspopup="menu"
      aria-expanded={false}
      data-state="closed"
      onPointerEnter={prefetch}
      onPointerDown={prefetch}
      onFocus={prefetch}
      // detail is 0 for the click Enter and Space synthesize.
      onClick={(clickEvent) => activate(clickEvent.detail === 0)}
      onKeyDown={onKeyDown}
    >
      {triggerContent}
    </Button>
  );
}
