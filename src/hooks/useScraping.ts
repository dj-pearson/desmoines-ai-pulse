import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScrapingJobRow {
  id: string;
  name: string;
  status: string;
  last_run: string | null;
  next_run: string | null;
  events_found: number | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ScrapingJob {
  id: string;
  name: string;
  status: "idle" | "running" | "completed" | "failed" | "scheduled_for_trigger";
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

export function useScraping() {
  const [state, setState] = useState<ScrapingState>({
    jobs: [],
    isLoading: true,
    error: null,
    isGlobalRunning: false,
  });

  // Real scraping jobs for Des Moines area event sources
  const realJobs: ScrapingJob[] = [
    {
      id: "catch-des-moines",
      name: "Catch Des Moines Events",
      status: "idle",
      lastRun: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
      nextRun: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.catchdesmoines.com/events/",
        schedule: "0 */6 * * *", // Every 6 hours
        selectors: {
          title: ".event-title, h2.title, h3.title",
          description: ".event-description, .description, .summary",
          date: ".event-date, .date, time[datetime]",
          location: ".event-location, .location, .venue",
          price: ".event-price, .price, .cost",
          category: ".event-category, .category, .event-type",
        },
        isActive: true,
      },
    },
    {
      id: "iowa-cubs",
      name: "Iowa Cubs Schedule",
      status: "idle",
      lastRun: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      nextRun: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(), // 11 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.milb.com/iowa/schedule",
        schedule: "0 */12 * * *", // Every 12 hours (games don't change often)
        selectors: {
          title: ".game-matchup, .opponent, .game-title",
          description: ".game-info, .promotion-info, .special-event",
          date: ".game-date, .date, .schedule-date, [data-date]",
          location: ".venue, .location, .park-name",
          price: ".ticket-price, .price, .buy-tickets",
          category: ".game-type, .promotion-type",
        },
        isActive: true,
      },
    },
    {
      id: "iowa-wolves",
      name: "Iowa Wolves G-League",
      status: "idle",
      lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      nextRun: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(), // 10 hours from now
      eventsFound: 0,
      config: {
        url: "https://iowa.gleague.nba.com/schedule",
        schedule: "0 */12 * * *", // Every 12 hours
        selectors: {
          title: ".game-matchup, .opponent, .vs, .game-info",
          description: ".game-details, .special-event, .promotion",
          date: ".game-date, .date, .schedule-date, time",
          location: ".venue, .arena, .location",
          price: ".ticket-info, .price, .tickets",
          category: ".game-type, .season-type",
        },
        isActive: true,
      },
    },
    {
      id: "iowa-wild",
      name: "Iowa Wild Hockey",
      status: "idle",
      lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      nextRun: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.iowawild.com/games",
        schedule: "0 */12 * * *", // Every 12 hours
        selectors: {
          title: ".game-matchup, .opponent, .vs-opponent",
          description: ".game-info, .promotion, .special-event",
          date: ".game-date, .date, .game-time",
          location: ".venue, .arena, .rink",
          price: ".ticket-price, .pricing, .tickets",
          category: ".game-type, .promotion-type",
        },
        isActive: true,
      },
    },
    {
      id: "iowa-barnstormers",
      name: "Iowa Barnstormers Arena Football",
      status: "idle",
      lastRun: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
      nextRun: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(), // 7 hours from now
      eventsFound: 0,
      config: {
        url: "https://theiowabarnstormers.com/",
        schedule: "0 0 */2 * *", // Every 2 days (less frequent schedule changes)
        selectors: {
          title: ".game-title, .matchup, .opponent",
          description: ".game-details, .event-info, .description",
          date: ".game-date, .date, .schedule-date",
          location: ".venue, .stadium, .arena",
          price: ".ticket-info, .pricing, .tickets",
          category: ".game-type, .event-type",
        },
        isActive: true,
      },
    },
    {
      id: "iowa-events-center",
      name: "Iowa Events Center",
      status: "idle",
      lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      nextRun: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.iowaeventscenter.com/",
        schedule: "0 */8 * * *", // Every 8 hours
        selectors: {
          title: ".event-title, .show-title, h2, h3",
          description: ".event-description, .show-description, .summary",
          date: ".event-date, .show-date, .date, time",
          location: ".venue, .location, .hall",
          price: ".ticket-price, .pricing, .cost",
          category: ".event-type, .show-type, .category",
        },
        isActive: true,
      },
    },
    {
      id: "vibrant-music-hall",
      name: "Vibrant Music Hall",
      status: "idle",
      lastRun: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      nextRun: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.vibrantmusichall.com/",
        schedule: "0 */6 * * *", // Every 6 hours
        selectors: {
          title: ".show-title, .artist-name, .event-title, h1, h2",
          description: ".show-description, .event-details, .artist-bio",
          date: ".show-date, .event-date, .date, time",
          location: ".venue, .hall, .room",
          price: ".ticket-price, .pricing, .cost, .price-range",
          category: ".genre, .show-type, .music-type",
        },
        isActive: true,
      },
    },
    {
      id: "google-events-dsm",
      name: "Google Events - Des Moines",
      status: "idle",
      lastRun: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      nextRun: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.google.com/search?q=events+in+des+moines+iowa",
        schedule: "0 */4 * * *", // Every 4 hours
        selectors: {
          title: ".event-title, .g-card h3, .event-name",
          description: ".event-description, .snippet, .event-details",
          date: ".event-date, .date, .when",
          location: ".event-location, .location, .where",
          price: ".price, .cost, .ticket-info",
          category: ".event-type, .category",
        },
        isActive: true,
      },
    },
  ];

  const fetchJobs = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      console.log("Fetching scraping jobs from database...");

      // Direct query with type casting
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
        console.error("Database query error:", error);
        throw error;
      }

      console.log("Raw database response:", data);

      if (!data || data.length === 0) {
        console.log(
          "No scraping jobs found in database - using fallback real jobs data"
        );
        setState((prev) => ({
          ...prev,
          jobs: realJobs,
          error: "Using fallback data - database migration needed",
          isLoading: false,
        }));
        return;
      }

      // Transform the database data
      const jobs: ScrapingJob[] = data.map((row: unknown) => {
        const typedRow = row as ScrapingJobRow;
        return {
          id: typedRow.id,
          name: typedRow.name,
          status: typedRow.status as
            | "idle"
            | "running" 
            | "completed"
            | "failed"
            | "scheduled_for_trigger",
          lastRun: typedRow.last_run,
          nextRun: typedRow.next_run,
          eventsFound: typedRow.events_found || 0,
          config: typedRow.config as {
            url?: string;
            selectors?: Record<string, string>;
            schedule?: string;
            isActive?: boolean;
          },
        };
      });

      console.log("Successfully transformed jobs:", jobs);

      setState((prev) => ({
        ...prev,
        jobs,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error fetching scraping jobs:", error);

      // If database query fails, it might be because the table doesn't exist or migration wasn't run
      console.log(
        "Database query failed - falling back to empty array. Make sure to run the migration!"
      );

      setState((prev) => ({
        ...prev,
        jobs: [],
        error:
          "Failed to fetch scraping jobs. Please run the database migration.",
        isLoading: false,
      }));

      // Fallback to real jobs data so the interface still works
      console.log("Using fallback real jobs data...");
      setState((prev) => ({
        ...prev,
        jobs: realJobs,
        error: "Using fallback data - database migration needed",
        isLoading: false,
      }));
    }
  };

  const forceRefresh = async () => {
    console.log("Force refreshing scraping jobs from database...");
    await fetchJobs();
  };

  const runScrapingJob = async (jobId: string) => {
    try {
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "running" as const } : job
        ),
      }));

      // Call the Supabase edge function with authentication header
      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: { jobId },
        headers: {
          "x-trigger-source": "admin-dashboard",
        },
      });

      if (error) throw error;

      const eventsFound = data?.eventsProcessed || 0;

      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "completed" as const,
                lastRun: new Date().toISOString(),
                eventsFound,
              }
            : job
        ),
      }));

      return { success: true, eventsFound };
    } catch (error) {
      console.error("Error running scraping job:", error);

      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "failed" as const } : job
        ),
      }));

      throw error;
    }
  };

  const runAllJobs = async () => {
    try {
      setState((prev) => ({ ...prev, isGlobalRunning: true }));

      const activeJobs = state.jobs.filter((job) => job.config.isActive);

      for (const job of activeJobs) {
        await runScrapingJob(job.id);
      }

      setState((prev) => ({ ...prev, isGlobalRunning: false }));
    } catch (error) {
      console.error("Error running all jobs:", error);
      setState((prev) => ({ ...prev, isGlobalRunning: false }));
      throw error;
    }
  };

  const stopAllJobs = async () => {
    try {
      // TODO: Implement job stopping logic
      setState((prev) => ({
        ...prev,
        isGlobalRunning: false,
        jobs: prev.jobs.map((job) => ({ ...job, status: "idle" as const })),
      }));
    } catch (error) {
      console.error("Error stopping all jobs:", error);
      throw error;
    }
  };

  const updateJobConfig = async (
    jobId: string,
    config: Partial<ScrapingJob["config"]>
  ) => {
    try {
      // Find the current job to get the existing config
      const currentJob = state.jobs.find(job => job.id === jobId);
      if (!currentJob) {
        throw new Error(`Job with id ${jobId} not found`);
      }

      // Merge the new config with the existing config
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

      console.log("💾 Saving job config to database:", { jobId, mergedConfig });

      // Save to database with the merged config
      const { error } = await supabase
        .from('scraping_jobs')
        .update({ 
          config: mergedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      if (error) {
        console.error("❌ Database update error:", error);
        throw error;
      }

      console.log("✅ Job config saved to database successfully");
      
      // Refresh jobs from database to ensure consistency
      await fetchJobs();
      
    } catch (error) {
      console.error("❌ Error updating job config:", error);
      // Revert local state on error
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
      const newJob: ScrapingJob = {
        ...job,
        id: Date.now().toString(), // TODO: Use proper ID generation
        status: "idle",
        lastRun: null,
        nextRun: null,
        eventsFound: 0,
      };

      setState((prev) => ({
        ...prev,
        jobs: [...prev.jobs, newJob],
      }));

      // TODO: Save to database when you have a scraping jobs table

      return newJob;
    } catch (error) {
      console.error("Error adding job:", error);
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
