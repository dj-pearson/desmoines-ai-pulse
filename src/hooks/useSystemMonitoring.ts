import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/lib/safeStorage';
import { createLogger } from '@/lib/logger';

const log = createLogger('useSystemMonitoring');

/**
 * What System Controls can actually observe from the browser (non-core review
 * WP5).
 *
 * This hook used to report CPU load, memory, disk and "active connections" as
 * Math.random() values, "uptime" as the time since the newest cron_logs row,
 * and the same row as "last backup". It also offered restart-web-server and
 * refresh-cdn-cache (no such functions), a backup (system-backup answers 501,
 * not implemented) and optimize_database_performance (it runs VACUUM inside a
 * function, which Postgres refuses, so it can never succeed). All of that is
 * gone. What is left is measured.
 */
export interface SystemStatus {
  /** Whether a trivial read of `events` succeeded; null before the first check. */
  databaseReachable: boolean | null;
  /** Round trip of that read, as the browser saw it. */
  databaseLatencyMs: number | null;
  /** Newest cron_logs row, if any. */
  lastJob: { at: string; message: string; failed: boolean } | null;
  checkedAt: string | null;
}

/**
 * Keys that System Controls and Application Settings wrote. Nothing ever read
 * them, and adminApplicationSettings could hold an SMTP password typed into a
 * form that saved it only to this browser. Cleared on load and by
 * clearCache so they don't outlive the screens.
 */
export const RETIRED_SETTINGS_KEYS = ['adminSystemSettings', 'adminApplicationSettings'] as const;

export function clearRetiredSettings(): void {
  for (const key of RETIRED_SETTINGS_KEYS) storage.remove(key);
}

export function useSystemMonitoring() {
  const queryClient = useQueryClient();
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    databaseReachable: null,
    databaseLatencyMs: null,
    lastJob: null,
    checkedAt: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  // useCallback: the component's effect depends on this, and a new function
  // per render re-ran the effect, reloaded, re-rendered and re-ran it again.
  const loadSystemStatus = useCallback(async () => {
    const started = performance.now();
    const { error: dbError } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    const latency = Math.round(performance.now() - started);

    const { data: cronLogs, error: cronError } = await supabase
      .from('cron_logs')
      .select('created_at, message, error_details')
      .order('created_at', { ascending: false })
      .limit(1);
    if (cronError) {
      log.warn('loadSystemStatus', 'cron_logs read failed', { error: cronError.message });
    }
    const newest = cronLogs?.[0];

    setSystemStatus({
      databaseReachable: !dbError,
      databaseLatencyMs: dbError ? null : latency,
      lastJob: newest?.created_at
        ? { at: newest.created_at, message: newest.message, failed: !!newest.error_details }
        : null,
      checkedAt: new Date().toISOString(),
    });
  }, []);

  /**
   * Clears every cache this application actually has (XPLAT-008 AC1).
   *
   * There is no server-side cache to clear: nothing in the database caches,
   * and the caches that exist are module-scope Maps inside individual edge
   * functions, each in its own isolate, which an HTTP call to another function
   * cannot reach. So this drops the client's query cache, so every read
   * refetches, and the retired local settings.
   */
  const clearCache = useCallback(async () => {
    setIsLoading(true);
    try {
      queryClient.clear();
      clearRetiredSettings();
      return { success: true as const };
    } catch (error) {
      log.error('clearCache', 'Failed to clear cache', { error: String(error) });
      return { success: false as const, error };
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  return {
    systemStatus,
    isLoading,
    loadSystemStatus,
    clearCache,
  };
}
