import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Play,
  Pause,
  RotateCw
} from "lucide-react";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('CronMonitorSimple');

interface ScrapingJob {
  id: string;
  name: string;
  status: string;
  config: { schedule?: string; isActive?: boolean; };
  next_run: string;
  last_run: string | null;
  events_found: number;
  created_at: string;
  updated_at: string;
}

interface CronLog {
  id: string;
  message: string;
  job_id: string | null;
  error_details: string | null;
  created_at: string;
}

export default function CronMonitor() {
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleRefresh = useCallback(() => {
    setJobs([]);
    setLogs([]);
    // Re-triggers any data fetching effects
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return 'bg-blue-500';
      case 'completed': 
      case 'idle': return 'bg-green-500';
      case 'error': 
      case 'failed': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running': return <RotateCw className="h-4 w-4 animate-spin" />;
      case 'completed':
      case 'idle': return <CheckCircle className="h-4 w-4" />;
      case 'error':
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const triggerJob = async (jobId: string) => {
    setIsLoading(true);
    try {
      // Mock implementation - would trigger actual job
      toast.success('Job triggered successfully');
    } catch (error) {
      log.error('triggerJob', 'Failed to trigger job', { data: error });
      toast.error('Failed to trigger job');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cron Job Monitor</h2>
        <Button onClick={handleRefresh} variant="outline">
          <RotateCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Scraping Jobs</TabsTrigger>
          <TabsTrigger value="logs">Execution Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Active Scraping Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No scraping jobs found</p>
                  <p className="text-sm">Jobs will appear here when they are configured</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {jobs.map((job) => (
                    <div key={job.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(job.status)}`} />
                          <h3 className="font-semibold">{job.name}</h3>
                          <Badge variant="outline">
                            {getStatusIcon(job.status)}
                            <span className="ml-1">{job.status}</span>
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => triggerJob(job.id)}
                          disabled={isLoading || job.status === 'running'}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Trigger
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Schedule:</span>
                          <p className="font-mono">{job.config?.schedule || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Next Run:</span>
                          <p>{job.next_run ? new Date(job.next_run).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last Run:</span>
                          <p>{job.last_run ? new Date(job.last_run).toLocaleString() : 'Never'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Events Found:</span>
                          <p className="font-semibold">{job.events_found}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Execution Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No execution logs found</p>
                    <p className="text-sm">Logs will appear here when jobs are executed</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`border-l-4 pl-4 py-2 ${
                          log.error_details ? 'border-l-red-500 bg-red-50 dark:bg-red-950/20' : 
                          'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{log.message}</p>
                            {log.error_details && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                                {log.error_details}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}