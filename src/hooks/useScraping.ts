import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger('useScraping');

interface ScrapingJobRow {
  id: string;
  name: string;
  status: string;
  last_run: string | null;
  next_run: string | null;
  events_found: number | null;
  config: Record<string, unknown>;
  results: Record<string, unknown> | null;
  error_message: string | null;
  job_type: string;
  created_at: string;
  updated_at: string;
}

interface ScrapingJob {
  id: string;
  name: string;
  status: "idle" | "running" | "completed" | "failed" | "stopped" | "scheduled_for_trigger";
  lastRun: string | null;
  nextRun: string | null;
  eventsFound: number;
  config: {
    url?: string;
    selectors?: Record<string, string>;
    schedule?: string;
    isActive?: boolean;
  };
}

interface ScrapingState {
  jobs: ScrapingJob[];
  isLoading: boolean;
  error: string | null;
  isGlobalRunning: boolean;
}

// Real scraping jobs for Des Moines area event sources (fallback when DB unavailable)
const FALLBACK_JOBS: ScrapingJob[] = [
  {
    id: "catch-des-moines",
    name: "Catch Des Moines Events",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.catchdesmoines.com/events/",
      schedule: "0 */6 * * *",
      isActive: true,
    },
  },
  {
    id: "iowa-cubs",
    name: "Iowa Cubs Schedule",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.milb.com/iowa/schedule",
      schedule: "0 */12 * * *",
      isActive: true,
    },
  },
  {
    id: "iowa-wolves",
    name: "Iowa Wolves G-League",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://iowa.gleague.nba.com/schedule",
      schedule: "0 */12 * * *",
      isActive: true,
    },
  },
  {
    id: "iowa-wild",
    name: "Iowa Wild Hockey",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.iowawild.com/games",
      schedule: "0 */12 * * *",
      isActive: true,
    },
  },
  {
    id: "iowa-barnstormers",
    name: "Iowa Barnstormers Arena Football",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://theiowabarnstormers.com/",
      schedule: "0 0 */2 * *",
      isActive: true,
    },
  },
  {
    id: "iowa-events-center",
    name: "Iowa Events Center",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.iowaeventscenter.com/",
      schedule: "0 */8 * * *",
      isActive: true,
    },
  },
  {
    id: "vibrant-music-hall",
    name: "Vibrant Music Hall",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.vibrantmusichall.com/",
      schedule: "0 */6 * * *",
      isActive: true,
    },
  },
  {
    id: "google-events-dsm",
    name: "Google Events - Des Moines",
    status: "idle",
    lastRun: null,
    nextRun: null,
    eventsFound: 0,
    config: {
      url: "https://www.google.com/search?q=events+in+des+moines+iowa",
      schedule: "0 */4 * * *",
      isActive: true,
    },
  },
];

function rowToJob(row: ScrapingJobRow): ScrapingJob {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ScrapingJob["status"],
    lastRun: row.last_run,
    nextRun: row.next_run,
    eventsFound: row.events_found || 0,
    config: row.config as ScrapingJob["config"],
  };
}

export function useScraping() {
  const [state, setState] = useState<ScrapingState>({
    jobs: [],
    isLoading: true,
    error: null,
    isGlobalRunning: false,
  });

  // AbortController ref for stopping running jobs
  const abortRef = useRef<AbortController | null>(null);

  const fetchJobs = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      log.debug('fetchJobs', 'Fetching scraping jobs from database');

      const { data, error } = await (
        supabase as unknown as {
          from: (table: string) => {
            select: (columns: string) => {
              order: (
                column: string,
                options: { ascending: boolean }
              ) => Promise<{
                data: unknown[] | null;
                error: Error | null;
              }>;
            };
          };
        }
      )
        .from("scraping_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        log.warn('fetchJobs', 'Database query error', { error: String(error) });
        throw error;
      }

      if (!data || data.length === 0) {
        log.info('fetchJobs', 'No jobs in database — using fallback data');
        setState((prev) => ({
          ...prev,
          jobs: FALLBACK_JOBS,
          error: "Using fallback data - database migration needed",
          isLoading: false,
        }));
        return;
      }

      const jobs = data.map((row: unknown) => rowToJob(row as ScrapingJobRow));

      log.debug('fetchJobs', `Loaded ${jobs.length} jobs from database`);

      setState((prev) => ({
        ...prev,
        jobs,
        isLoading: false,
      }));
    } catch (error) {
      log.warn('fetchJobs', 'Database query failed — falling back to defaults', { error: String(error) });

      setState((prev) => ({
        ...prev,
        jobs: FALLBACK_JOBS,
        error: "Using fallback data - database migration needed",
        isLoading: false,
      }));
    }
  };

  const forceRefresh = async () => {
    log.debug('forceRefresh', 'Force refreshing scraping jobs');
    await fetchJobs();
  };

  const runScrapingJob = async (jobId: string) => {
    try {
      // Update local state immediately
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "running" as const } : job
        ),
      }));

      // Update database status to running
      await (supabase as unknown as {
        from: (table: string) => {
          update: (data: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      })
        .from("scraping_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      // Call the Supabase edge function
      const { data, error } = await supabase.functions.invoke("ingest/scrape-events", {
        body: { jobId },
        headers: {
          "x-trigger-source": "admin-dashboard",
        },
      });

      if (error) throw error;

      const eventsFound = data?.eventsProcessed || 0;
      const now = new Date().toISOString();

      // Update local state
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "completed" as const,
                lastRun: now,
                eventsFound,
              }
            : job
        ),
      }));

      // Persist results to database
      await (supabase as unknown as {
        from: (table: string) => {
          update: (data: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      })
        .from("scraping_jobs")
        .update({
          status: "completed",
          last_run: now,
          events_found: eventsFound,
          results: data || {},
          error_message: null,
          updated_at: now,
        })
        .eq("id", jobId);

      return { success: true, eventsFound };
    } catch (error) {
      log.error('runScrapingJob', 'Job execution failed', { jobId, error: String(error) });

      const now = new Date().toISOString();
      const errorMsg = error instanceof Error ? error.message : String(error);

      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "failed" as const } : job
        ),
      }));

      // Persist failure to database
      await (supabase as unknown as {
        from: (table: string) => {
          update: (data: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: Error | null }>;
          };
        };
      })
        .from("scraping_jobs")
        .update({
          status: "failed",
          error_message: errorMsg,
          updated_at: now,
        })
        .eq("id", jobId);

      throw error;
    }
  };

  const runAllJobs = async () => {
    try {
      setState((prev) => ({ ...prev, isGlobalRunning: true }));
      abortRef.current = new AbortController();

      const activeJobs = state.jobs.filter((job) => job.config.isActive);

      for (const job of activeJobs) {
        if (abortRef.current?.signal.aborted) {
          log.info('runAllJobs', 'Run stopped by user');
          break;
        }
        await runScrapingJob(job.id);
      }

      setState((prev) => ({ ...prev, isGlobalRunning: false }));
    } catch (error) {
      log.error('runAllJobs', 'Batch run failed', { error: String(error) });
      setState((prev) => ({ ...prev, isGlobalRunning: false }));
      throw error;
    }
  };

  const stopAllJobs = async () => {
    try {
      // Signal the abort controller to stop the runAllJobs loop
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      // Update local state
      setState((prev) => ({
        ...prev,
        isGlobalRunning: false,
        jobs: prev.jobs.map((job) =>
          job.status === "running" ? { ...job, status: "stopped" as const } : job
        ),
      }));

      // Persist stopped status for any running jobs in the database
      const runningJobs = state.jobs.filter((j) => j.status === "running");
      for (const job of runningJobs) {
        await (supabase as unknown as {
          from: (table: string) => {
            update: (data: Record<string, unknown>) => {
              eq: (col: string, val: string) => Promise<{ error: Error | null }>;
            };
          };
        })
          .from("scraping_jobs")
          .update({ status: "stopped", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }

      log.info('stopAllJobs', 'All jobs stopped');
    } catch (error) {
      log.error('stopAllJobs', 'Error stopping jobs', { error: String(error) });
      throw error;
    }
  };

  const updateJobConfig = async (
    jobId: string,
    config: Partial<ScrapingJob["config"]>
  ) => {
    try {
      const currentJob = state.jobs.find(job => job.id === jobId);
      if (!currentJob) {
        throw new Error(`Job with id ${jobId} not found`);
      }

      const mergedConfig = { ...currentJob.config, ...config };

      // Update local state immediately for UI responsiveness
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId
            ? { ...job, config: mergedConfig }
            : job
        ),
      }));

      log.debug('updateJobConfig', 'Saving job config to database', { jobId });

      const { error } = await supabase
        .from('scraping_jobs')
        .update({
          config: mergedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        log.error('updateJobConfig', 'Database update error', { error: String(error) });
        throw error;
      }

      log.info('updateJobConfig', 'Job config saved successfully');

      await fetchJobs();

    } catch (error) {
      log.error('updateJobConfig', 'Error updating job config', { error: String(error) });
      await fetchJobs();
      throw error;
    }
  };

  const addJob = async (
    job: Omit<
      ScrapingJob,
      "id" | "status" | "lastRun" | "nextRun" | "eventsFound"
    >
  ) => {
    try {
      // Insert into database — let Supabase generate the UUID
      const { data, error } = await (
        supabase as unknown as {
          from: (table: string) => {
            insert: (row: Record<string, unknown>) => {
              select: () => {
                single: () => Promise<{
                  data: unknown | null;
                  error: Error | null;
                }>;
              };
            };
          };
        }
      )
        .from("scraping_jobs")
        .insert({
          name: job.name,
          job_type: "event_scraper",
          status: "idle",
          config: job.config,
        })
        .select()
        .single();

      if (error) {
        log.error('addJob', 'Database insert failed', { error: String(error) });
        throw error;
      }

      const newJob = rowToJob(data as ScrapingJobRow);

      setState((prev) => ({
        ...prev,
        jobs: [newJob, ...prev.jobs],
      }));

      log.info('addJob', 'New job created', { id: newJob.id, name: newJob.name });

      return newJob;
    } catch (error) {
      log.error('addJob', 'Error adding job', { error: String(error) });
      throw error;
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return {
    ...state,
    refetch: fetchJobs,
    runScrapingJob,
    runAllJobs,
    stopAllJobs,
    updateJobConfig,
    addJob,
    forceRefresh,
  };
}
