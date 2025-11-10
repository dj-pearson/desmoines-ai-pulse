import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Repeat, Calendar, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RecurringEventFieldsProps {
  isRecurring: boolean;
  onIsRecurringChange: (value: boolean) => void;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  onFrequencyChange: (value: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY') => void;
  interval: number;
  onIntervalChange: (value: number) => void;
  endDate?: string;
  onEndDateChange: (value: string) => void;
}

export function RecurringEventFields({
  isRecurring,
  onIsRecurringChange,
  frequency,
  onFrequencyChange,
  interval,
  onIntervalChange,
  endDate,
  onEndDateChange,
}: RecurringEventFieldsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-primary" />
          <CardTitle>Recurring Event</CardTitle>
        </div>
        <CardDescription>
          Make this event repeat on a schedule
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable Recurring Toggle */}
        <div className="flex items-center justify-between space-x-4">
          <div className="flex-1 space-y-1">
            <Label htmlFor="is-recurring" className="text-base font-semibold">
              This is a recurring event
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatically generate future event instances
            </p>
          </div>
          <Switch
            id="is-recurring"
            checked={isRecurring}
            onCheckedChange={onIsRecurringChange}
          />
        </div>

        {/* Recurrence Options */}
        {isRecurring && (
          <div className="space-y-4 pt-4 border-t">
            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Repeats</Label>
              <Select value={frequency} onValueChange={onFrequencyChange}>
                <SelectTrigger id="frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interval */}
            <div className="space-y-2">
              <Label htmlFor="interval">
                Every {interval} {frequency === 'DAILY' ? 'day(s)' : frequency === 'WEEKLY' ? 'week(s)' : frequency === 'MONTHLY' ? 'month(s)' : 'year(s)'}
              </Label>
              <Input
                id="interval"
                type="number"
                min="1"
                max="52"
                value={interval}
                onChange={(e) => onIntervalChange(parseInt(e.target.value) || 1)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                Example: "2" with "Weekly" = Every 2 weeks
              </p>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date (Optional)</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                placeholder="Leave empty for ongoing"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty if the event continues indefinitely
              </p>
            </div>

            {/* Info Alert */}
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>How it works:</strong> Your event will be used as a template.
                The system will automatically generate individual event instances based on
                your recurrence pattern. Each instance will appear as a separate event on
                the calendar.
              </AlertDescription>
            </Alert>

            {/* Preview */}
            <div className="bg-muted/50 p-4 rounded-lg border">
              <p className="text-sm font-semibold mb-2">Preview:</p>
              <p className="text-sm text-muted-foreground">
                This event will repeat{' '}
                <strong>
                  every {interval > 1 ? interval + ' ' : ''}
                  {frequency === 'DAILY' ? interval > 1 ? 'days' : 'day' : ''}
                  {frequency === 'WEEKLY' ? interval > 1 ? 'weeks' : 'week' : ''}
                  {frequency === 'MONTHLY' ? interval > 1 ? 'months' : 'month' : ''}
                  {frequency === 'YEARLY' ? interval > 1 ? 'years' : 'year' : ''}
                </strong>
                {endDate ? ` until ${new Date(endDate).toLocaleDateString()}` : ' indefinitely'}.
              </p>
            </div>

            {/* Warning */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                <strong>Note:</strong> Future instances will be generated automatically every
                night. You can edit or delete individual instances without affecting the
                recurring pattern.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
