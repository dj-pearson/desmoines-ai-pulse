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

      // TODO: Replace with real API call when you have a scraping jobs table
      // For now, simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setState((prev) => ({
        ...prev,
        jobs: realJobs,
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
