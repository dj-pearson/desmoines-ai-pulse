import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
} from "lucide-react";
import { useScraping } from "@/hooks/useScraping";
import { useToast } from "@/components/ui/use-toast";

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

interface JobFormData {
  name?: string;
  url?: string;
  schedule?: string;
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

  const handleEditJob = (job: ScrapingJob) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      url: job.config.url || "",
      schedule: job.config.schedule || "",
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
      await updateJobConfig(editingJob.id, {
        url: formData.url,
        schedule: formData.schedule || editingJob.config.schedule || "",
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage Scraping Jobs
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {jobs.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No scraping jobs found. Create your first scraper to get started.
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
                          variant={job.config.isActive ? "default" : "secondary"}
                        >
                          {job.config.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge
                          variant={job.status === "running" ? "default" : "outline"}
                        >
                          {job.status}
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
                          {job.config.schedule}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Last Run:</p>
                        <p>{formatLastRun(job.lastRun)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-600">Events Found:</p>
                        <p>{job.eventsFound || 0}</p>
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
                        variant="default"
                        onClick={() => handleRunJob(job.id)}
                        disabled={job.status === "running"}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Run Now
                      </Button>
                    </div>
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
                  <Label htmlFor="job-schedule">Schedule (Cron Expression)</Label>
                  <Input
                    id="job-schedule"
                    value={formData.schedule || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, schedule: e.target.value })
                    }
                    placeholder="0 */6 * * * (every 6 hours)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use cron syntax: minute hour day month weekday
                  </p>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Note:</strong> Advanced selector configuration is coming soon. 
                    For now, you can update basic job settings.
                  </AlertDescription>
                </Alert>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditingJob(null)}
                >
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