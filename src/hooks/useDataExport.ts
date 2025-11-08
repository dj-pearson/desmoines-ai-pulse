/**
 * Data Export Hook
 * Handles CSV export with loading state and notifications
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { downloadCSV, generateCsvFilename } from '@/lib/csvUtils';

interface ExportOptions {
  columns?: Array<{ key: string; label: string; type?: string }>;
  filename?: string;
  filenamePrefix?: string;
}

interface UseDataExportReturn {
  isExporting: boolean;
  exportData: (data: any[], options?: ExportOptions) => Promise<void>;
  exportToCSV: (data: any[], options?: ExportOptions) => void;
}

/**
 * Hook for exporting data to CSV with loading state and notifications
 */
export function useDataExport(): UseDataExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = (data: any[], options?: ExportOptions) => {
    try {
      if (!data || data.length === 0) {
        toast.error('No data to export');
        return;
      }

      const filename = options?.filename ||
        generateCsvFilename(options?.filenamePrefix || 'export');

      downloadCSV(data, filename, {
        columns: options?.columns
      });

      toast.success(`Exported ${data.length} items to ${filename}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
  };

  const exportData = async (data: any[], options?: ExportOptions): Promise<void> => {
    setIsExporting(true);

    try {
      // Simulate async operation for large datasets
      await new Promise(resolve => setTimeout(resolve, 100));

      exportToCSV(data, options);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  return {
    isExporting,
    exportData,
    exportToCSV
  };
}

/**
 * Export filtered/searched data with proper column configuration
 */
export function useContentExport(contentType: string) {
  const { isExporting, exportData } = useDataExport();

  const exportContent = async (
    data: any[],
    columns: Array<{ key: string; label: string; type?: string }>
  ) => {
    await exportData(data, {
      filenamePrefix: contentType,
      columns: columns
    });
  };

  return {
    isExporting,
    exportContent
  };
}
