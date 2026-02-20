import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Edit3,
  Trash2,
  Play,
  Pause,
  Clock,
  Globe,
  AlertCircle,
  Save,
  X,
  Settings,
  Calendar,
  MapPin,
  Eye,
} from "lucide-react";
import { useScraping } from "@/hooks/useScraping";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  scheduleOptions,
  cronToFriendly,
  friendlyToCron,
} from "@/lib/cronUtils";
import { createLogger } from '@/lib/logger';

const log = createLogger('ScrapingJobManager');

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

interface RecentEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  category: string;
  source_url: string;
  created_at: string;
}

interface JobFormData {
  name?: string;
  url?: string;
  schedule?: string;
  scheduleType?: string; // friendly schedule type
  isActive?: boolean;
  selectors?: Record<string, string>;
}

interface ScrapingJobManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ScrapingJobManager: React.FC<ScrapingJobManagerProps> = ({
  isOpen,
  onClose,
}) => {
  const { jobs, runScrapingJob, updateJobConfig } = useScraping();
  const { toast } = useToast();
  const [editingJob, setEditingJob] = useState<ScrapingJob | null>(null);
  const [formData, setFormData] = useState<JobFormData>({});
  const [recentEvents, setRecentEvents] = useState<Record<string, RecentEvent[]>>({});
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [loadingEvents, setLoadingEvents] = useState<Set<string>>(new Set());

  // Fetch recent events for a specific job
  const fetchRecentEventsForJob = async (job: ScrapingJob) => {
    if (!job.config.url || loadingEvents.has(job.id)) return;

    setLoadingEvents(prev => new Set(prev).add(job.id));
    
    try {
      // Get domain from URL to match source_url
      const urlObj = new URL(job.config.url);
      const domain = urlObj.hostname;
      
      // Fetch events from the last 7 days that match this job's source domain
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, venue, category, source_url, created_at')
        .ilike('source_url', `%${domain}%`)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setRecentEvents(prev => ({
        ...prev,
        [job.id]: data || []
      }));
    } catch (error) {
      log.error('fetchRecentEvents', `Error fetching recent events for ${job.name}`, { data: error });
      toast({
        title: "Error",
        description: `Failed to load recent events for ${job.name}`,
        variant: "destructive",
      });
    } finally {
      setLoadingEvents(prev => {
        const newSet = new Set(prev);
        newSet.delete(job.id);
        return newSet;
      });
    }
  };

  // Toggle expanded state and fetch events if needed
  const toggleJobExpansion = (job: ScrapingJob) => {
    const newExpandedJobs = new Set(expandedJobs);
    if (expandedJobs.has(job.id)) {
      newExpandedJobs.delete(job.id);
    } else {
      newExpandedJobs.add(job.id);
      // Fetch recent events when expanding
      if (!recentEvents[job.id]) {
        fetchRecentEventsForJob(job);
      }
    }
    setExpandedJobs(newExpandedJobs);
  };

  const handleEditJob = (job: ScrapingJob) => {
    setEditingJob(job);

    // Find the schedule type from the cron expression
    const scheduleType =
      scheduleOptions.find((opt) => opt.cron === job.config.schedule)?.value ||
      "custom";

    setFormData({
      name: job.name,
      url: job.config.url || "",
      schedule: job.config.schedule || "",
      scheduleType: scheduleType,
      isActive: job.config.isActive || false,
      selectors: { ...(job.config.selectors || {}) },
    });
  };

  const handleSaveJob = async () => {
    if (!editingJob || !formData.name || !formData.url) {
      toast({
        title: "Error",
        description: "Name and URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert friendly schedule type to cron expression
      const cronExpression =
        formData.scheduleType === "custom"
          ? formData.schedule || ""
          : friendlyToCron(formData.scheduleType || "never");

      await updateJobConfig(editingJob.id, {
        url: formData.url,
        schedule: cronExpression,
        isActive: formData.isActive ?? editingJob.config.isActive ?? true,
        selectors: formData.selectors || editingJob.config.selectors || {},
      });

      toast({
        title: "Success",
        description: "Scraping job updated successfully",
      });

      setEditingJob(null);
      setFormData({});
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update scraping job",
        variant: "destructive",
      });
    }
  };

  const handleRunJob = async (jobId: string) => {
    try {
      const job = jobs.find((j) => j.id === jobId);

      await runScrapingJob(jobId);

      toast({
        title: "Success",
        description: "Scraping job started successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start scraping job",
        variant: "destructive",
      });
    }
  };

  const formatLastRun = (lastRun?: string) => {
    if (!lastRun) return "Never";
    return new Date(lastRun).toLocaleString();
  };

  const readyToTriggerJobs = jobs.filter(
    (job) => job.status === "scheduled_for_trigger" || job.status === "idle"
  );
  const runningJobs = jobs.filter((job) => job.status === "running");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage Scraping Jobs
          </DialogTitle>
        </DialogHeader>

        {/* Status Summary */}
        {jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="font-medium">Ready to Trigger</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {readyToTriggerJobs.length}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">Currently Running</span>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {runningJobs.length}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                <span className="font-medium">Total Jobs</span>
              </div>
              <p className="text-2xl font-bold text-gray-600">{jobs.length}</p>
            </Card>
          </div>
        )}

        <div className="space-y-4">
          {jobs.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No scraping jobs found. Create your first scraper to get
                started.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4">
              {jobs.map((job) => (
                <Card key={job.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        {job.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            job.config.isActive ? "default" : "secondary"
                          }
                        >
                          {job.config.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge
                          variant={
                            job.status === "running"
                              ? "default"
                              : job.status === "scheduled_for_trigger"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            job.status === "running"
                              ? "animate-pulse"
                              : job.status === "scheduled_for_trigger"
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : ""
                          }
                        >
                          {job.status === "running"
                            ? "🔵 Running"
                            : job.status === "scheduled_for_trigger"
                            ? "⚡ Ready to Run"
                            : job.status === "completed"
                            ? "✅ Completed"
                            : job.status === "failed"
                            ? "❌ Failed"
                            : job.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium text-gray-600">URL:</p>
                        <p className="break-all">{job.config.url}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Schedule:</p>
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {cronToFriendly(job.config.schedule || "")}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Last Run:</p>
                        <p>{formatLastRun(job.lastRun)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">
                          Events Found:
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="font-bold">
                            {job.eventsFound || 0}
                          </p>
                          {job.status === "scheduled_for_trigger" && (
                            <Badge variant="outline" className="text-xs">
                              Ready to run
                            </Badge>
                          )}
                          {(job.eventsFound || 0) > 0 && (
                            <span className="text-green-600 text-xs">
                              ✓ Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditJob(job)}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          job.status === "scheduled_for_trigger"
                            ? "default"
                            : job.status === "idle"
                            ? "secondary"
                            : "outline"
                        }
                        onClick={() => handleRunJob(job.id)}
                        disabled={job.status === "running"}
                        className={
                          job.status === "scheduled_for_trigger"
                            ? "bg-blue-600 hover:bg-blue-700 animate-pulse shadow-lg"
                            : job.status === "idle"
                            ? "bg-gray-100 hover:bg-gray-200"
                            : ""
                        }
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {job.status === "scheduled_for_trigger"
                          ? "🚀 Run Now!"
                          : job.status === "running"
                          ? "Running..."
                          : "Run Now"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleJobExpansion(job)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {expandedJobs.has(job.id) ? "Hide Events" : "Show Recent Events"}
                      </Button>
                    </div>

                    {/* Recent Events Section */}
                    {expandedJobs.has(job.id) && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <h4 className="font-semibold">Recent Events (Last 7 Days)</h4>
                          {loadingEvents.has(job.id) && (
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </div>
                        
                        {recentEvents[job.id] ? (
                          recentEvents[job.id].length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {recentEvents[job.id].map((event) => (
                                <div
                                  key={event.id}
                                  className="p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-sm text-gray-900 truncate">
                                        {event.title}
                                      </h5>
                                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          <span>
                                            {new Date(event.date).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3" />
                                          <span className="truncate">{event.venue}</span>
                                        </div>
                                      </div>
                                      <div className="mt-1">
                                        <Badge variant="outline" className="text-xs">
                                          {event.category}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-500 text-right">
                                      <div>Added</div>
                                      <div>
                                        {new Date(event.created_at).toLocaleString()}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-gray-500">
                              <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                              <p>No events found in the last 7 days</p>
                              <p className="text-xs">
                                Try running the scraper to find new events
                              </p>
                            </div>
                          )
                        ) : (
                          loadingEvents.has(job.id) ? (
                            <div className="text-center py-4 text-gray-500">
                              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                              <p>Loading recent events...</p>
                            </div>
                          ) : null
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Edit Job Dialog */}
        {editingJob && (
          <Dialog open={!!editingJob} onOpenChange={() => setEditingJob(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Scraping Job</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="job-name">Job Name</Label>
                    <Input
                      id="job-name"
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Enter job name"
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="job-active"
                      checked={formData.isActive || false}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, isActive: checked })
                      }
                    />
                    <Label htmlFor="job-active">Active</Label>
                  </div>
                </div>

                <div>
                  <Label htmlFor="job-url">Target URL</Label>
                  <Input
                    id="job-url"
                    value={formData.url || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                    placeholder="https://example.com/events"
                  />
                </div>

                <div>
                  <Label htmlFor="job-schedule">Schedule</Label>
                  <Select
                    value={formData.scheduleType || "never"}
                    onValueChange={(value) => {
                      setFormData({
                        ...formData,
                        scheduleType: value,
                        schedule:
                          value === "custom"
                            ? formData.schedule
                            : friendlyToCron(value),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select schedule frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {scheduleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">
                        <div className="flex flex-col">
                          <span>Custom</span>
                          <span className="text-xs text-muted-foreground">
                            Enter custom cron expression
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {formData.scheduleType === "custom" && (
                    <div className="mt-2">
                      <Input
                        id="job-schedule-custom"
                        value={formData.schedule || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, schedule: e.target.value })
                        }
                        placeholder="0 */6 * * * (custom cron expression)"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use cron syntax: minute hour day month weekday
                      </p>
                    </div>
                  )}

                  {formData.scheduleType &&
                    formData.scheduleType !== "custom" &&
                    formData.scheduleType !== "never" && (
                      <p className="text-xs text-green-600 mt-1">
                        Cron expression: {friendlyToCron(formData.scheduleType)}
                      </p>
                    )}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Note:</strong> Advanced selector configuration is
                    coming soon. For now, you can update basic job settings.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingJob(null)}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSaveJob}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapingJobManager;
