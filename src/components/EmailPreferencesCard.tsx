import { useEmailPreferences } from '@/hooks/useEmailPreferences';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { formatInCentralTime } from '@/lib/timezone';

/**
 * The weekly digest switch (account plan WP5 item 4).
 *
 * It says only what the digest does. The old card described "Every Sunday at
 * 8:00 AM" (the cron is `0 14 * * 0`, which is 9 AM while Iowa is on CDT, and
 * digest_day_of_week / digest_time_hour are never read) and listed RSVPs from an
 * `event_rsvps` table that doesn't exist. What the page can know for certain is
 * whether the switch is on and when the last one was actually sent, so that is
 * what it shows.
 *
 * Rendered inside EmailStreams, which supplies the card and the heading.
 */
export function EmailPreferencesCard() {
  const {
    preferences,
    isLoading,
    isError,
    error,
    refetch,
    lastSentAt,
    lastSentError,
    updatePreferences,
    isUpdating,
  } = useEmailPreferences();

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (isError || !preferences) {
    return (
      <ErrorState
        compact
        error={error}
        title="Couldn't load your digest setting"
        description="Your setting hasn't changed. Try again in a moment."
        onRetry={() => void refetch()}
      />
    );
  }

  const lastSent = lastSentError
    ? null
    : lastSentAt
      ? `Last sent ${formatInCentralTime(lastSentAt, 'MMM d')}.`
      : 'Not sent to you yet.';

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="weekly-digest" className="text-base font-medium">
          Weekly event digest
        </Label>
        <p className="text-sm text-muted-foreground">
          One email a week with upcoming Des Moines events. {lastSent}
        </p>
      </div>
      <Switch
        id="weekly-digest"
        checked={preferences.weekly_digest_enabled}
        onCheckedChange={(enabled) => updatePreferences({ weekly_digest_enabled: enabled })}
        disabled={isUpdating}
      />
    </div>
  );
}
