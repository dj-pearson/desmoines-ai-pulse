import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Sparkles, 
  Clock, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Play, 
  Calendar,
  FileText,
  TrendingUp,
  AlertTriangle,
  Bot
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const log = createLogger('AIEnhancementManager');

interface EnhancementStats {
  totalEvents: number;
  enhancedEvents: number;
  pendingEvents: number;
  lastRunTime: string | null;
  enhancementRate: number;
}

interface EnhancementHistory {
  id: string;
  message: string;
  created_at: string;
  error_details?: string;
  success?: boolean;
}

interface BulkEnhancementResult {
  success: boolean;
  message: string;
  eventsProcessed: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    eventId: string;
    title: string;
    success: boolean;
    error?: string;
  }>;
}

export default function AIEnhancementManager() {
  const [stats, setStats] = useState<EnhancementStats>({
    totalEvents: 0,
    enhancedEvents: 0,
    pendingEvents: 0,
    lastRunTime: null,
    enhancementRate: 0
  });
  const [history, setHistory] = useState<EnhancementHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [lastResult, setLastResult] = useState<BulkEnhancementResult | null>(null);

  // Fetch enhancement statistics
  const fetchStats = async () => {
    try {
      // Get total future events
      const { count: totalEvents } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .gte('date', new Date().toISOString());

      // Get enhanced events (future events with AI writeups)
      const { count: enhancedEvents } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .gte('date', new Date().toISOString())
        .not('ai_writeup', 'is', null);

      // Get last enhancement run time from cron logs
      const { data: lastRun } = await supabase
        .from('cron_logs')
        .select('created_at')
        .ilike('message', '%AI bulk enhancement%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const pendingEvents = (totalEvents || 0) - (enhancedEvents || 0);
      const enhancementRate = totalEvents ? ((enhancedEvents || 0) / totalEvents) * 100 : 0;

      setStats({
        totalEvents: totalEvents || 0,
        enhancedEvents: enhancedEvents || 0,
        pendingEvents,
        lastRunTime: lastRun?.created_at || null,
        enhancementRate
      });
    } catch (error) {
      log.error('Error fetching enhancement stats', { action: 'fetchStats', metadata: { error } });
      toast.error('Failed to load enhancement statistics');
    }
  };

  // Fetch enhancement history from cron logs
  const fetchHistory = async () => {
    try {
      const { data } = await supabase
        .from('cron_logs')
        .select('id, message, created_at, error_details')
        .or('message.ilike.%AI%,message.ilike.%enhancement%,message.ilike.%bulk%')
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        const historyData = data.map(log => ({
          ...log,
          success: !log.error_details && !log.message.includes('❌') && !log.message.includes('Failed')
        }));
        setHistory(historyData);
      }
    } catch (error) {
      log.error('Error fetching enhancement history', { action: 'fetchHistory', metadata: { error } });
    }
  };

  // Trigger manual enhancement
  const triggerEnhancement = async (batchSize: number = 15) => {
    setIsEnhancing(true);
    setLastResult(null);
    
    try {
      toast.info('Starting AI bulk enhancement...', {
        description: `Processing up to ${batchSize} events`
      });

      const { data, error } = await supabase.functions.invoke('bulk-enhance-events', {
        body: {
          batchSize,
          triggerSource: 'manual'
        }
      });

      if (error) {
        throw error;
      }

      setLastResult(data);
      
      if (data.success) {
        toast.success(`Enhancement completed!`, {
          description: `${data.successCount}/${data.eventsProcessed} events enhanced successfully`
        });
      } else {
        toast.error('Enhancement failed', {
          description: data.message
        });
      }

      // Refresh data
      await Promise.all([fetchStats(), fetchHistory()]);
      
    } catch (error) {
      log.error('Error triggering enhancement', { action: 'triggerEnhancement', metadata: { error } });
      toast.error('Failed to trigger enhancement', {
        description: error.message
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchStats(), fetchHistory()]);
      setIsLoading(false);
    };

    loadData();

    // Refresh every 2 minutes
    const interval = setInterval(() => {
      fetchStats();
      fetchHistory();
    }, 120000);

    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (isSuccess: boolean, message: string) => {
    if (message.includes('❌') || message.includes('Failed')) {
      return <Badge variant="destructive" className="ml-2">Failed</Badge>;
    }
    if (message.includes('✨') || message.includes('completed')) {
      return <Badge variant="default" className="ml-2">Success</Badge>;
    }
    if (message.includes('🤖') || message.includes('Triggering')) {
      return <Badge variant="outline" className="ml-2">Started</Badge>;
    }
    return <Badge variant="secondary" className="ml-2">Info</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Enhancement Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading enhancement data...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Total Events</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.totalEvents}</p>
            <p className="text-xs text-muted-foreground">Future events only</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Enhanced</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.enhancedEvents}</p>
            <p className="text-xs text-muted-foreground">With AI writeups</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">Pending</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.pendingEvents}</p>
            <p className="text-xs text-muted-foreground">Need enhancement</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Coverage</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.enhancementRate.toFixed(1)}%</p>
            <Progress value={stats.enhancementRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Enhancement Controls
          </CardTitle>
          <CardDescription>
            Manually trigger bulk AI enhancement for events that need writeups. 
            The system automatically skips events that already have AI writeups to prevent duplication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <strong>No Duplicates:</strong> Only events without existing AI writeups will be processed. 
              Events with existing writeups are automatically skipped.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button 
              onClick={() => triggerEnhancement(10)} 
              disabled={isEnhancing}
              className="flex items-center gap-2"
            >
              {isEnhancing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Enhance 10 Events
            </Button>
            
            <Button 
              onClick={() => triggerEnhancement(20)} 
              disabled={isEnhancing}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isEnhancing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Enhance 20 Events
            </Button>

            <Button 
              onClick={() => fetchStats()} 
              variant="ghost"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Stats
            </Button>
          </div>

          {stats.lastRunTime && (
            <p className="text-sm text-muted-foreground">
              Last automatic run: {formatDistanceToNow(new Date(stats.lastRunTime), { addSuffix: true })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last Result */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              Last Enhancement Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span>Events Processed:</span>
                <Badge variant="outline">{lastResult.eventsProcessed}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Successful:</span>
                <Badge variant="default">{lastResult.successCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Failed:</span>
                <Badge variant="destructive">{lastResult.failureCount}</Badge>
              </div>
              
              {lastResult.results && lastResult.results.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Processed Events:</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {lastResult.results.map((result) => (
                      <div key={result.eventId} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                        <span className="truncate flex-1">{result.title}</span>
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 ml-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhancement History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Enhancement History
          </CardTitle>
          <CardDescription>
            Recent AI enhancement activity and CRON job logs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No enhancement history found</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{entry.message}</span>
                      {getStatusBadge(entry.success || false, entry.message)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </p>
                    {entry.error_details && (
                      <p className="text-xs text-red-600 mt-1 font-mono bg-red-50 p-1 rounded">
                        {entry.error_details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}