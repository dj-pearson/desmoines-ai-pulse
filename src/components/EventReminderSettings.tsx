import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Bell, BellOff } from "lucide-react";
import { useEventReminders, type ReminderType } from '@/hooks/useEventReminders';
import { Skeleton } from '@/components/ui/skeleton';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { signInHref } from '@/components/header/navigationConfig';
import { ReminderEmailsUnsubscribedNotice } from '@/components/ReminderEmailsUnsubscribedNotice';
import { useAuth } from '@/hooks/useAuth';
import { reminderAvailability, type ReminderAvailability } from '@/lib/reminderAvailability';
import type { EventTimeFields } from '@/lib/eventTime';

interface EventReminderSettingsProps {
  eventId: string;
  /** Unused since the Capacitor local-notification branch went (WEB-FEAT-020). Kept so callers still compile. */
  eventTitle?: string;
  /** Unused, see eventTitle. */
  eventDate?: Date;
  /**
   * The event's start fields (WEB-FEAT-092). With them the card disables the
   * options get_pending_reminders would never send. Without them every option
   * is offered, as before.
   */
  eventTiming?: Pick<EventTimeFields, 'date' | 'event_start_utc' | 'time_tbd'>;
  className?: string;
}

/** Shown next to an option that cannot be ticked. */
const UNAVAILABLE_COPY: Record<NonNullable<ReminderAvailability['reason']>, string> = {
  too_late: 'Too close to the start',
  no_start_time: 'No start time listed',
};

/** Shown next to a saved reminder that will not be sent from here on. */
const SAVED_UNAVAILABLE_COPY: Record<NonNullable<ReminderAvailability['reason']>, string> = {
  too_late: 'No longer scheduled',
  no_start_time: "Won't send: no start time listed",
};

const ALWAYS_AVAILABLE: ReminderAvailability = { available: true, reason: null };

export function EventReminderSettings({ eventId, eventTiming, className = '' }: EventReminderSettingsProps) {
  const {
    isAuthenticated,
    isLoading,
    isReminderEnabled,
    toggleReminder,
    isTogglingReminder,
    emailsUnsubscribed,
  } = useEventReminders(eventId);
  const location = useLocation();
  const { user } = useAuth();

  if (!isAuthenticated) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Event Reminders
          </CardTitle>
          <CardDescription>
            <Link
              to={signInHref(location.pathname, location.search)}
              className="font-medium text-primary underline underline-offset-4"
            >
              Sign in
            </Link>{' '}
            to receive email reminders before this event
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Event Reminders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>
    );
  }

  const reminderOptions: Array<{ type: ReminderType; label: string; icon: React.ReactNode }> = [
    {
      type: '1_day',
      label: '1 day before',
      icon: <SpriteIcon name="calendar" className="h-4 w-4" />,
    },
    {
      type: '3_hours',
      label: '3 hours before',
      icon: <SpriteIcon name="clock" className="h-4 w-4" />,
    },
    {
      type: '1_hour',
      label: '1 hour before',
      icon: <SpriteIcon name="clock" className="h-4 w-4" />,
    },
  ];

  const now = new Date();
  const availabilityOf = (type: ReminderType): ReminderAvailability =>
    eventTiming ? reminderAvailability(type, eventTiming, now) : ALWAYS_AVAILABLE;

  // Only a reminder that can still be sent counts as set.
  const anyEnabled = reminderOptions.some(
    option => isReminderEnabled(option.type) && availabilityOf(option.type).available,
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {anyEnabled ? (
            <Bell className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5" />
          )}
          Event Reminders
        </CardTitle>
        <CardDescription>
          Get reminders before this event starts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {emailsUnsubscribed && <ReminderEmailsUnsubscribedNotice email={user?.email} />}
        {reminderOptions.map((option) => {
          const enabled = isReminderEnabled(option.type);
          const { available, reason } = availabilityOf(option.type);
          // A saved reminder that can no longer fire stays untickable, so it can be removed.
          const blocked = !available && !enabled;
          const statusId = `reminder-${option.type}-status`;
          let status: React.ReactNode = null;
          if (reason && !available) {
            status = (
              <span id={statusId} className="text-xs text-muted-foreground">
                {enabled ? SAVED_UNAVAILABLE_COPY[reason] : UNAVAILABLE_COPY[reason]}
              </span>
            );
          } else if (enabled) {
            status = <span className="text-xs text-primary font-medium">Active</span>;
          }
          return (
            <div
              key={option.type}
              className="flex items-center space-x-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                id={`reminder-${option.type}`}
                checked={enabled}
                onCheckedChange={() => toggleReminder(option.type)}
                disabled={isTogglingReminder || blocked}
                aria-describedby={reason && !available ? statusId : undefined}
                className="h-5 w-5"
              />
              <Label
                htmlFor={`reminder-${option.type}`}
                className={`flex items-center gap-2 flex-1 text-base ${
                  blocked ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
                }`}
              >
                {option.icon}
                <span>{option.label}</span>
              </Label>
              {status}
            </div>
          );
        })}

        {anyEnabled && !emailsUnsubscribed && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground flex items-start gap-2">
              <Bell className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                We'll send you email reminders at the times you've selected. You can change these anytime.
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
