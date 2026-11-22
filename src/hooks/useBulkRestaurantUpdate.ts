import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';
import type { BulkUpdateRequestBody } from '@/lib/restaurantHoursRefresh';

export interface BulkUpdateResult {
  success: boolean;
  message: string;
  processed: number;
  updated: number;
  errors: number;
  /** Hours-only modes (WEB-FEAT-086): 'hoursOnly' (fill) or 'hoursOnly-stale'. */
  mode?: string;
  noHours?: number;
  /** Stale mode only: Places answered 404 for the place id. */
  gone?: number;
  /** Fill mode, and the full enrichment (WEB-BE-066): pass back as afterId
   *  so the next run starts after the rows this one read. */
  lastId?: string | null;
  /** Full enrichment only (WEB-BE-066): rows no search hit matched by name. */
  unmatched?: number;
  errorDetails?: Array<{
    id: string;
    name: string;
    error: string;
  }>;
}

export interface BulkUpdateOptions {
  batchSize?: number;
  forceUpdate?: boolean;
  clearEnhanced?: boolean;
  /** Hours and business_status only, never the full enrichment (SEO-054). */
  hoursOnly?: boolean;
  /** With hoursOnly: re-read hours last checked more than N days ago (WEB-FEAT-079). */
  staleDays?: number;
  /** With hoursOnly and no staleDays, or with forceUpdate: the previous run's lastId. */
  afterId?: string | null;
}

/**
 * The body bulk-update-restaurants reads. Hours fields are sent only when
 * asked for, so the enrichment call is byte-for-byte what it was.
 */
export function bulkUpdateRequestBody(options: BulkUpdateOptions = {}): BulkUpdateRequestBody {
  const { batchSize = 10, forceUpdate = false, clearEnhanced = false, hoursOnly = false, staleDays, afterId } = options;
  if (!hoursOnly) {
    // WEB-BE-066: a force run walks the table in id order, so it needs the
    // cursor to reach rows past the first batch. Sent only when given.
    const enrich: BulkUpdateRequestBody = { batchSize, forceUpdate, clearEnhanced };
    if (forceUpdate && afterId) enrich.afterId = afterId;
    return enrich;
  }
  const body: BulkUpdateRequestBody = { batchSize, hoursOnly: true };
  if (staleDays !== undefined) body.staleDays = staleDays;
  else if (afterId) body.afterId = afterId;
  return body;
}

export function useBulkRestaurantUpdate() {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<BulkUpdateResult | null>(null);

  const updateRestaurants = async (options: BulkUpdateOptions = {}) => {
    try {
      setIsLoading(true);
      setProgress('Starting bulk restaurant update...');
      setResult(null);

      const body = bulkUpdateRequestBody(options);

      setProgress(
        body.hoursOnly
          ? `Refreshing hours (batch size: ${body.batchSize})...`
          : `Updating restaurants (batch size: ${body.batchSize})...`,
      );

      const { data, error } = await supabase.functions.invoke('bulk-update-restaurants', { body });

      if (error) {
        throw new Error(error.message || 'Failed to update restaurants');
      }

      setResult(data);
      
      if (data.success) {
        setProgress(`Successfully updated ${data.updated} out of ${data.processed} restaurants`);
      } else {
        setProgress('Update completed with errors');
      }

      return data;

    } catch (error) {
      handleError(error, {
        component: 'useBulkRestaurantUpdate',
        action: options.hoursOnly ? 'refreshHours' : 'bulkUpdate',
      });
      const errorResult: BulkUpdateResult = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        processed: 0,
        updated: 0,
        errors: 1
      };
      setResult(errorResult);
      setProgress('Update failed');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const clearResult = () => {
    setResult(null);
    setProgress('');
  };

  return {
    updateRestaurants,
    isLoading,
    progress,
    result,
    clearResult
  };
}
