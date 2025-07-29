import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BulkUpdateResult {
  success: boolean;
  message: string;
  processed: number;
  updated: number;
  errors: number;
  errorDetails?: Array<{
    id: string;
    name: string;
    error: string;
  }>;
}

interface BulkUpdateOptions {
  batchSize?: number;
  forceUpdate?: boolean;
  clearEnhanced?: boolean;
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

      const { batchSize = 10, forceUpdate = false, clearEnhanced = false } = options;

      setProgress(`Updating restaurants (batch size: ${batchSize})...`);

      const { data, error } = await supabase.functions.invoke('bulk-update-restaurants', {
        body: {
          batchSize,
          forceUpdate,
          clearEnhanced
        }
      });

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
      console.error('Bulk restaurant update error:', error);
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
