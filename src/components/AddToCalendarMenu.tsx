import { useRef, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Download } from "lucide-react";
import { useCalendarExport } from '@/hooks/use-calendar-export';
import type { IcsEventInput } from '@/lib/icsEvent';

export interface AddToCalendarMenuProps {
  icsEvent: IcsEventInput;
  /** The trigger's look, exactly as the static trigger drew it. */
  buttonProps: Pick<ButtonProps, 'variant' | 'size' | 'className' | 'aria-label'>;
  triggerContent: ReactNode;
  /**
   * The swap came from the keyboard. Radix moves focus to the first item when
   * a keyboard opens the menu, but it learns that from a keydown listener the
   * menu root adds on mount, which is after the key that opened this one.
   */
  focusFirstItem: boolean;
}

/**
 * The Radix half of AddToCalendarButton (WEB-PERF-076). Loaded on
 * the first click or arrow key and mounted already open; never import it
 * statically (addToCalendarLazy.test.ts). Radix owns focus from here on and
 * returns it to this trigger when the menu closes.
 */
export function AddToCalendarMenu({
  icsEvent,
  buttonProps,
  triggerContent,
  focusFirstItem,
}: AddToCalendarMenuProps) {
  // Only the open that mounted this menu; later opens are Radix's own.
  const firstOpenFromKeyboard = useRef(focusFirstItem);

  const {
    downloadIcsFile,
    addToGoogleCalendar,
    addToOutlookCalendar,
    addToAppleCalendar,
  } = useCalendarExport();

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button {...buttonProps}>{triggerContent}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onFocus={(event) => {
          // Radix focuses the content itself on open; hand that on to the
          // first item when a key opened it, as Radix would have.
          if (!firstOpenFromKeyboard.current || event.target !== event.currentTarget) return;
          firstOpenFromKeyboard.current = false;
          event.currentTarget
            .querySelector<HTMLElement>('[role="menuitem"]')
            ?.focus({ preventScroll: true });
        }}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Choose your calendar
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => addToGoogleCalendar(icsEvent)}>
          <svg
            className="w-4 h-4 mr-2"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12c6.627 0 12-5.373 12-12S18.627 0 12 0zm.14 19.018c-3.868 0-7-3.14-7-7.018c0-3.878 3.132-7.018 7-7.018c1.89 0 3.47.697 4.682 1.829l-1.974 1.978c-.538-.515-1.477-1.117-2.708-1.117c-2.31 0-4.187 1.91-4.187 4.273c0 2.363 1.877 4.274 4.187 4.274c2.667 0 3.665-1.91 3.816-2.895h-3.816v-2.483h6.486c.07.348.112.718.112 1.192c0 4.115-2.757 7.042-6.598 7.042z" />
          </svg>
          Google Calendar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addToOutlookCalendar(icsEvent)}>
          <svg
            className="w-4 h-4 mr-2"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M24 7.875v8.25A3.375 3.375 0 0120.625 19.5h-17.25A3.375 3.375 0 010 16.125v-8.25A3.375 3.375 0 013.375 4.5h17.25A3.375 3.375 0 0124 7.875zM12 14.625c-2.07 0-3.75-1.68-3.75-3.75S9.93 7.125 12 7.125s3.75 1.68 3.75 3.75-1.68 3.75-3.75 3.75z" />
          </svg>
          Outlook Calendar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => addToAppleCalendar(icsEvent)}>
          <svg
            className="w-4 h-4 mr-2"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
          Apple Calendar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => downloadIcsFile(icsEvent)}>
          <Download className="w-4 h-4 mr-2" />
          Download .ics file
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
