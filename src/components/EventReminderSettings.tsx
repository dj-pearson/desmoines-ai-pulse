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

interface EventReminderSettingsProps {
  eventId: string;
  /** Unused since the Capacitor local-notification branch went (WEB-FEAT-020). Kept so callers still compile. */
  eventTitle?: string;
  /** Unused, see eventTitle. */
  eventDate?: Date;
  className?: string;
}

export function EventReminderSettings({ eventId, className = '' }: EventReminderSettingsProps) {
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

  const anyEnabled = reminderOptions.some(option => isReminderEnabled(option.type));

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
          return (
            <div
              key={option.type}
              className="flex items-center space-x-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                id={`reminder-${option.type}`}
                checked={enabled}
                onCheckedChange={() => toggleReminder(option.type)}
                disabled={isTogglingReminder}
                className="h-5 w-5"
              />
              <Label
                htmlFor={`reminder-${option.type}`}
                className="flex items-center gap-2 cursor-pointer flex-1 text-base"
              >
                {option.icon}
                <span>{option.label}</span>
              </Label>
              {enabled && (
                <span className="text-xs text-primary font-medium">Active</span>
              )}
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
