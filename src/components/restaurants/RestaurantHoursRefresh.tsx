import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useBulkRestaurantUpdate } from '@/hooks/useBulkRestaurantUpdate';
import {
  buildHoursRefreshBody,
  clampBatchSize,
  clampStaleDays,
  hoursRefreshSummary,
  HOURS_BATCH_MAX,
  STALE_DAYS_DEFAULT,
  STALE_DAYS_MAX,
  STALE_DAYS_MIN,
  type HoursRefreshAction,
} from '@/lib/restaurantHoursRefresh';

/**
 * WEB-FEAT-086. On-demand runs of bulk-update-restaurants' two hours-only
 * modes, which until now only the daily cron could start: fill hours for rows
 * that have none, and re-read hours last checked more than N days ago (after
 * a holiday-hours change, say). Neither touches descriptions, photos or
 * ratings. Failures reach handleError inside the hook; the panel shows the
 * function's own message.
 */
export function RestaurantHoursRefresh() {
  const { updateRestaurants, isLoading, result } = useBulkRestaurantUpdate();
  const [batchSize, setBatchSize] = useState(20);
  const [staleDays, setStaleDays] = useState(STALE_DAYS_DEFAULT);
  const [lastAction, setLastAction] = useState<HoursRefreshAction | null>(null);
  // Fill works through rows in id order; a place Google has no hours for
  // stays null, so the next fill starts after the previous batch's last id.
  const [fillCursor, setFillCursor] = useState<string | null>(null);

  const run = async (action: HoursRefreshAction) => {
    setLastAction(action);
    const body = buildHoursRefreshBody(action, { batchSize, staleDays, afterId: fillCursor });
    try {
      const data = await updateRestaurants(body);
      if (action === 'fill') {
        setFillCursor(data?.processed > 0 && typeof data.lastId === 'string' ? data.lastId : null);
      }
    } catch {
      // Reported by the hook (handleError); its result carries the message.
    }
  };

  return (
    <section aria-labelledby="hours-refresh-heading" className="space-y-4">
      <div className="space-y-1">
        <h3 id="hours-refresh-heading" className="text-lg font-semibold">
          Opening hours
        </h3>
        <p className="text-sm text-muted-foreground">
          Fill reads only hours and open/closed status from Google Places. Refresh also re-reads Google&apos;s rating, review
          count, phone, website, price level, reservations and listing link; a field Google leaves out keeps its stored
          value, and fields an owner or admin set are left alone. Descriptions and photos are never touched.
          The daily job refreshes hours older than {STALE_DAYS_DEFAULT} days; use these after a holiday-hours change.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hoursBatchSize">Restaurants per run</Label>
          <Input
            id="hoursBatchSize"
            type="number"
            min={1}
            max={HOURS_BATCH_MAX}
            value={batchSize}
            onChange={(e) => setBatchSize(clampBatchSize(Number(e.target.value)))}
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hoursStaleDays">Refresh hours older than (days)</Label>
          <Input
            id="hoursStaleDays"
            type="number"
            min={STALE_DAYS_MIN}
            max={STALE_DAYS_MAX}
            value={staleDays}
            onChange={(e) => setStaleDays(Number(e.target.value))}
            onBlur={() => setStaleDays(clampStaleDays(staleDays))}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => run('fill')} disabled={isLoading}>
          {fillCursor ? 'Fill missing hours (next batch)' : 'Fill missing hours'}
        </Button>
        <Button variant="outline" onClick={() => run('stale')} disabled={isLoading}>
          Refresh stale hours
        </Button>
        {fillCursor && (
          <Button variant="ghost" onClick={() => setFillCursor(null)} disabled={isLoading}>
            Start fill from the beginning
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Asking Google Places...
        </p>
      )}

      {!isLoading && result && lastAction && (
        <Alert variant={result.success ? 'default' : 'destructive'}>
          <AlertDescription role="status">
            {result.success ? hoursRefreshSummary(lastAction, result) : result.message}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
