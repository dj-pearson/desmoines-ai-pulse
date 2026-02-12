import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('useCalendarExport');

interface EventData {
  id: string;
  title: string;
  description?: string;
  date: string;
  location?: string;
  venue?: string;
  slug?: string;
  event_start_utc?: string;
  event_end_utc?: string;
}

// Format date for iCalendar format (YYYYMMDDTHHmmssZ)
const formatIcsDate = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

// Escape special characters for iCalendar format
const escapeIcsText = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
};

export function useCalendarExport() {
  const { toast } = useToast();

  const generateIcsFile = useCallback((event: EventData): string => {
    const startDate = new Date(event.event_start_utc || event.date);
    const endDate = event.event_end_utc
      ? new Date(event.event_end_utc)
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Des Moines Insider//Event Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Des Moines Events',
      'X-WR-TIMEZONE:America/Chicago',
      'BEGIN:VEVENT',
      `UID:${event.id}@desmoinesinsider.com`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startDate)}`,
      `DTEND:${formatIcsDate(endDate)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
      event.venue || event.location
        ? `LOCATION:${escapeIcsText(event.venue || event.location || '')}`
        : '',
      `URL:https://desmoinesinsider.com/events/${event.slug || event.id}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Event reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    return icsContent;
  }, []);

  const downloadIcsFile = useCallback(
    (event: EventData) => {
      try {
        const icsContent = generateIcsFile(event);
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
        log.error('Failed to download ICS file', { action: 'downloadIcsFile', metadata: { error } });
        toast({
          title: 'Download Failed',
          description: 'Unable to download calendar file',
          variant: 'destructive',
        });
      }
    },
    [generateIcsFile, toast]
  );

  const addToGoogleCalendar = useCallback(
    (event: EventData) => {
      try {
        const startDate = new Date(event.event_start_utc || event.date);
        const endDate = event.event_end_utc
          ? new Date(event.event_end_utc)
          : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

        const formatGoogleDate = (date: Date): string => {
          return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const params = new URLSearchParams({
          action: 'TEMPLATE',
          text: event.title,
          dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
          details: event.description || '',
          location: event.venue || event.location || '',
          sf: 'true',
          output: 'xml',
        });

        const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');

        toast({
          title: 'Opening Google Calendar',
          description: 'Complete the process in the new tab',
        });
      } catch (error) {
        log.error('Failed to open Google Calendar', { action: 'addToGoogleCalendar', metadata: { error } });
        toast({
          title: 'Failed to Open',
          description: 'Unable to open Google Calendar',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const addToOutlookCalendar = useCallback(
    (event: EventData) => {
      try {
        const startDate = new Date(event.event_start_utc || event.date);
        const endDate = event.event_end_utc
          ? new Date(event.event_end_utc)
          : new Date(startDate.getTime() + 2 * 60 * 60 * 1000);

        const params = new URLSearchParams({
          path: '/calendar/action/compose',
          rru: 'addevent',
          subject: event.title,
          startdt: startDate.toISOString(),
          enddt: endDate.toISOString(),
          body: event.description || '',
          location: event.venue || event.location || '',
        });

        const url = `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
        window.open(url, '_blank', 'noopener,noreferrer');

        toast({
          title: 'Opening Outlook Calendar',
          description: 'Complete the process in the new tab',
        });
      } catch (error) {
        log.error('Failed to open Outlook Calendar', { action: 'addToOutlookCalendar', metadata: { error } });
        toast({
          title: 'Failed to Open',
          description: 'Unable to open Outlook Calendar',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  const addToAppleCalendar = useCallback(
    (event: EventData) => {
      // Apple Calendar uses .ics files
      downloadIcsFile(event);
    },
    [downloadIcsFile]
  );

  return {
    downloadIcsFile,
    addToGoogleCalendar,
    addToOutlookCalendar,
    addToAppleCalendar,
    generateIcsFile,
  };
}
