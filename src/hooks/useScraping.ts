import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScrapingJob {
  id: string;
  name: string;
  status: "idle" | "running" | "completed" | "failed";
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

  // Mock scraping jobs for now - replace with real data when you have a scraping jobs table
  const mockJobs: ScrapingJob[] = [
    {
      id: "1",
      name: "Des Moines Events",
      status: "idle",
      lastRun: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      nextRun: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.desmoinesregister.com/events/",
        schedule: "0 */6 * * *", // Every 6 hours
        isActive: true,
      },
    },
    {
      id: "2",
      name: "Restaurant Openings",
      status: "idle",
      lastRun: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      nextRun: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(), // 18 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.desmoinesregister.com/story/entertainment/dining/",
        schedule: "0 0 */1 * *", // Daily
        isActive: true,
      },
    },
    {
      id: "3",
      name: "Arts & Culture",
      status: "idle",
      lastRun: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
      nextRun: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours from now
      eventsFound: 0,
      config: {
        url: "https://www.desmoinesartscenter.org/events",
        schedule: "0 0 */2 * *", // Every 2 days
        isActive: false,
      },
    },
  ];

  const fetchJobs = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // TODO: Replace with real API call when you have a scraping jobs table
      // For now, simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setState((prev) => ({
        ...prev,
        jobs: mockJobs,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error fetching scraping jobs:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch scraping jobs",
      }));
    }
  };

  const runScrapingJob = async (jobId: string) => {
    try {
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId ? { ...job, status: "running" as const } : job
        ),
      }));

      // Call the Supabase edge function
      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: { jobId },
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
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) =>
          job.id === jobId
            ? { ...job, config: { ...job.config, ...config } }
            : job
        ),
      }));

      // TODO: Save to database when you have a scraping jobs table
    } catch (error) {
      console.error("Error updating job config:", error);
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
  };
}
