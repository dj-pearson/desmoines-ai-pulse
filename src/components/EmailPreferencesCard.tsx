import React from 'react';
import { useEmailPreferences } from '@/hooks/useEmailPreferences';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Clock, Calendar } from 'lucide-react';

export function EmailPreferencesCard() {
  const { preferences, isLoading, updatePreferences, isUpdating } = useEmailPreferences();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!preferences) return null;

  const handleToggleWeeklyDigest = (enabled: boolean) => {
    updatePreferences({ weekly_digest_enabled: enabled });
  };

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Email Preferences</CardTitle>
        </div>
        <CardDescription>
          Manage your email notifications and weekly digest settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Weekly Digest Toggle */}
        <div className="flex items-center justify-between space-x-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="weekly-digest" className="text-base font-semibold">
              Weekly Event Digest
            </Label>
            <p className="text-sm text-muted-foreground">
              Receive a personalized roundup of events every week, including your upcoming RSVPs,
              favorited events, and recommendations based on your interests
            </p>
          </div>
          <Switch
            id="weekly-digest"
            checked={preferences.weekly_digest_enabled}
            onCheckedChange={handleToggleWeeklyDigest}
            disabled={isUpdating}
          />
        </div>

        {/* Digest Schedule Info */}
        {preferences.weekly_digest_enabled && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Delivery Schedule</p>
                <p className="text-sm text-muted-foreground">
                  Every {dayNames[preferences.digest_day_of_week]} at{' '}
                  {preferences.digest_time_hour === 0
                    ? '12:00 AM'
                    : preferences.digest_time_hour < 12
                    ? `${preferences.digest_time_hour}:00 AM`
                    : preferences.digest_time_hour === 12
                    ? '12:00 PM'
                    : `${preferences.digest_time_hour - 12}:00 PM`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">What's Included</p>
                <ul className="text-sm text-muted-foreground space-y-1 mt-1">
                  <li>• Your upcoming events (RSVPs & saved)</li>
                  <li>• Personalized recommendations</li>
                  <li>• Trending events in Des Moines</li>
                  <li>• Events in your favorite categories</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">Smart Personalization</h4>
              <p className="text-xs text-muted-foreground">
                Your digest is automatically personalized based on your favorites, RSVPs, and
                browsing history. The more you interact with events, the better your recommendations
                become!
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
