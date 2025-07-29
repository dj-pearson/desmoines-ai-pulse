import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Activity,
  Calendar,
  Zap
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface CronLog {
  id: string;
  message: string;
  job_id?: string;
  error_details?: string;
  created_at: string;
  job_name?: string;
}

interface ScrapingJob {
  id: string;
  name: string;
  status: string;
  last_run?: string;
  next_run?: string;
  events_found?: number;
  config: {
    schedule?: string;
    isActive?: boolean;
  };
}

export function CronMonitor() {
  const { toast } = useToast();

  // Fetch cron logs
  const { data: cronLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['cron-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cron_logs')
        .select(`
          *,
          scraping_jobs(name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      
      return data?.map(log => ({
        ...log,
        job_name: log.scraping_jobs?.name
      })) || [];
    },
  });

  // Fetch scraping jobs status
  const { data: scrapingJobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['scraping-jobs-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraping_jobs')
        .select('*')
        .order('next_run', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Manual trigger for cron function
  const triggerCronManually = async () => {
    try {
      const { data, error } = await supabase.rpc('run_scraping_jobs');
      
      if (error) throw error;
      
      toast({
        title: "Cron Job Triggered",
        description: "Manual cron job execution started",
      });
      
      // Refetch data after trigger
      setTimeout(() => {
        refetchLogs();
        refetchJobs();
      }, 2000);
      
    } catch (error) {
      console.error('Error triggering cron:', error);
      toast({
        title: "Error",
        description: "Failed to trigger cron job manually",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      idle: "secondary",
      running: "default", 
      completed: "success",
      failed: "destructive"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status}
      </Badge>
    );
  };

  const getScheduleDisplay = (schedule?: string) => {
    const scheduleMap = {
      '0 */6 * * *': 'Every 6 hours',
      '0 */3 * * *': 'Every 3 hours', 
      '0 */8 * * *': 'Every 8 hours',
      '0 */12 * * *': 'Every 12 hours',
      '0 6 * * *': 'Daily at 6 AM',
      '*/30 * * * *': 'Every 30 minutes'
    };
    
    return scheduleMap[schedule as keyof typeof scheduleMap] || schedule || 'No schedule';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Cron Job Monitor
          </h2>
          <p className="text-muted-foreground">
            Monitor automated scraping job execution and scheduling
          </p>
        </div>
        <Button onClick={triggerCronManually} className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Trigger Jobs Manually
        </Button>
      </div>

      {/* Job Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Scheduled Jobs Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="text-center py-4">Loading jobs...</div>
          ) : (
            <div className="space-y-4">
              {scrapingJobs?.map((job: ScrapingJob) => (
                <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold">{job.name}</h4>
                      {getStatusBadge(job.status)}
                      {job.config.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    
                    <div className="mt-2 text-sm text-muted-foreground grid grid-cols-2 gap-4">
                      <div>
                        <strong>Schedule:</strong> {getScheduleDisplay(job.config.schedule)}
                      </div>
                      <div>
                        <strong>Events Found:</strong> {job.events_found || 0}
                      </div>
                      <div>
                        <strong>Last Run:</strong> {
                          job.last_run 
                            ? format(new Date(job.last_run), 'MMM dd, yyyy HH:mm')
                            : 'Never'
                        }
                      </div>
                      <div>
                        <strong>Next Run:</strong> {
                          job.next_run 
                            ? format(new Date(job.next_run), 'MMM dd, yyyy HH:mm')
                            : 'Not scheduled'
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {!scrapingJobs?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No scraping jobs found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cron Execution Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Execution Logs
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetchLogs()}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-4">Loading logs...</div>
          ) : (
            <div className="space-y-3">
              {cronLogs?.map((log: CronLog) => (
                <div 
                  key={log.id} 
                  className={`p-3 rounded-lg border ${
                    log.error_details ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {log.error_details ? (
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    )}
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{log.message}</span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                        </span>
                      </div>
                      
                      {log.job_name && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Job: {log.job_name}
                        </div>
                      )}
                      
                      {log.error_details && (
                        <div className="text-sm text-red-600 mt-2 font-mono bg-red-100 p-2 rounded">
                          {log.error_details}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {!cronLogs?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No cron logs found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
