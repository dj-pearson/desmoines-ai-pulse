/**
 * Calendar export for a single event: download an .ics, or hand off to Google,
 * Outlook or Apple (WEB-FEAT-026).
 *
 * This hook is now the thin side of the feature. All the format logic - the
 * UTC timestamps, the RFC 5545 escaping, the fallback duration - lives in
 * `@/lib/icsEvent`, so it can be tested without mounting a component and so
 * there is exactly one implementation. The hook adds what genuinely needs
 * React: toasts, the DOM download dance, and error reporting.
 *
 * It replaced `src/lib/calendar.ts`, which was the wired implementation and
 * had two live bugs (local time labelled as UTC; no ICS escaping). See the
 * header of `@/lib/icsEvent` for the measurements.
 */
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import {
  buildEventIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
  type IcsEventInput,
} from '@/lib/icsEvent';

const log = createLogger('useCalendarExport');

export type EventData = IcsEventInput;

export function useCalendarExport() {
  const { toast } = useToast();

  const generateIcsFile = useCallback(
    (event: EventData): string | null => buildEventIcs(event),
    [],
  );

  const downloadIcsFile = useCallback(
    (event: EventData) => {
      try {
        const icsContent = buildEventIcs(event);
        if (!icsContent) {
          // An unparseable date produces no file rather than one full of
          // "Invalid Date", which a calendar client rejects with no explanation.
          toast({
            title: 'No Date Available',
            description: 'This event has no usable start time yet',
            variant: 'destructive',
          });
          return;
        }

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${event.slug || 'event'}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Calendar File Downloaded',
          description: 'Open the file to add the event to your calendar',
        });
      } catch (error) {
        log.error('downloadIcsFile', 'Failed to download ICS file', { error });
        toast({
          title: 'Download Failed',
          description: 'Unable to download calendar file',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  /** Shared open-in-a-new-tab path for the hosted calendar providers. */
  const openExternalCalendar = useCallback(
    (url: string | null, provider: string, action: string) => {
      if (!url) {
        toast({
          title: 'No Date Available',
          description: 'This event has no usable start time yet',
          variant: 'destructive',
        });
        return;
      }
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast({
          title: `Opening ${provider}`,
          description: 'Complete the process in the new tab',
        });
      } catch (error) {
        log.error(action, `Failed to open ${provider}`, { error });
        toast({
          title: 'Failed to Open',
          description: `Unable to open ${provider}`,
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const addToGoogleCalendar = useCallback(
    (event: EventData) =>
      openExternalCalendar(googleCalendarUrl(event), 'Google Calendar', 'addToGoogleCalendar'),
    [openExternalCalendar],
  );

  const addToOutlookCalendar = useCallback(
    (event: EventData) =>
      openExternalCalendar(outlookCalendarUrl(event), 'Outlook Calendar', 'addToOutlookCalendar'),
    [openExternalCalendar],
  );

  const addToAppleCalendar = useCallback(
    // Apple Calendar has no web hand-off; it opens a downloaded .ics.
    (event: EventData) => downloadIcsFile(event),
    [downloadIcsFile],
  );

  return {
    downloadIcsFile,
    addToGoogleCalendar,
    addToOutlookCalendar,
    addToAppleCalendar,
    generateIcsFile,
  };
}
