import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Plus,
  Send,
  Edit,
  Trash2,
  Globe,
  Calendar,
  Bot,
  ExternalLink,
  Repeat,
  Clock,
  Settings,
  Play,
  Pause,
} from "lucide-react";
import { useSocialMediaManager } from "@/hooks/useSocialMediaManager";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('SocialMediaManager');

const SocialMediaManager = () => {
  const {
    posts,
    webhooks,
    isLoading,
    isGenerating,
    generatePost,
    debugContent,
    publishPost,
    addWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
    deletePost,
    repostPost,
  } = useSocialMediaManager();

  const [automationSettings, setAutomationSettings] = useState({
    enabled: true,
    eventTime: "09:00",
    restaurantTime: "18:00",
    timezone: "America/Chicago",
  });

  // Load automation settings from database on mount
  React.useEffect(() => {
    const loadAutomationSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('social_media_automation_settings')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          log.error('Failed to load automation settings', { action: 'loadAutomationSettings', metadata: { error } });
          return;
        }
        
        if (data) {
          setAutomationSettings({
            enabled: data.enabled,
            eventTime: data.event_time,
            restaurantTime: data.restaurant_time,
            timezone: data.timezone,
          });
        }
      } catch (error) {
        log.error('Failed to load automation settings', { action: 'loadAutomationSettings', metadata: { error } });
      }
    };

    loadAutomationSettings();
  }, []);

  // Save automation settings to database when changed
  const saveAutomationSettings = async (newSettings: typeof automationSettings) => {
    try {
      const { error } = await supabase
        .from('social_media_automation_settings')
        .upsert({
          enabled: newSettings.enabled,
          event_time: newSettings.eventTime,
          restaurant_time: newSettings.restaurantTime,
          timezone: newSettings.timezone,
          updated_at: new Date().toISOString(),
        });
      
      if (error) {
        log.error('Failed to save automation settings', { action: 'saveAutomationSettings', metadata: { error } });
        toast.error(`Failed to save settings: ${error.message}`);
        return;
      }
      
      toast.success("Automation settings saved - Changes will take effect on the next scheduled run");
    } catch (error) {
      log.error('Failed to save automation settings', { action: 'saveAutomationSettings', metadata: { error } });
      toast.error("Failed to save settings - Please try again");
    }
  };

  const [isAddingWebhook, setIsAddingWebhook] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    name: "",
    platform: "",
    webhook_url: "",
    is_active: true,
    headers: {},
  });

  const handleGeneratePost = async (
    contentType: "event" | "restaurant",
    subjectType: string
  ) => {
    try {
      await generatePost({ contentType, subjectType });
    } catch (error) {
      log.error("Failed to generate post", { action: 'handleGeneratePost', metadata: { error } });
    }
  };

  const handlePublishPost = async (postId: string) => {
    try {
      await publishPost(postId);
    } catch (error) {
      log.error("Failed to publish post", { action: 'handlePublishPost', metadata: { error } });
    }
  };

  const handleRepostPost = async (postId: string) => {
    try {
      await repostPost(postId, "repost");
    } catch (error) {
      log.error("Failed to repost", { action: 'handleRepostPost', metadata: { error } });
    }
  };

  const handleAddWebhook = async () => {
    try {
      await addWebhook(newWebhook.webhook_url);
      setNewWebhook({
        name: "",
        platform: "",
        webhook_url: "",
        is_active: true,
        headers: {},
      });
      setIsAddingWebhook(false);
    } catch (error) {
      log.error("Failed to add webhook", { action: 'handleAddWebhook', metadata: { error } });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500 text-white">Scheduled</Badge>;
      case "posted":
        return <Badge className="bg-green-500 text-white">Posted</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "twitter_threads":
        return "🐦";
      case "facebook_linkedin":
        return "📘";
      default:
        return "📱";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Social Media Manager
          </h2>
          <p className="text-muted-foreground">
            AI-powered social media content generation and distribution
          </p>
        </div>
      </div>

      <Tabs defaultValue="posts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Posts</CardTitle>
              <CardDescription>
                All generated and published social media posts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No posts generated yet
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <Card key={post.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">
                            {getPlatformIcon(post.platform_type)}
                          </span>
                          <div>
                            <h3 className="font-semibold">{post.post_title}</h3>
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                              <Badge variant="outline">
                                {post.content_type}
                              </Badge>
                              <Badge variant="outline">
                                {post.subject_type.replace("_", " ")}
                              </Badge>
                              <Badge variant="outline">
                                {post.platform_type}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getStatusBadge(post.status)}
                          {post.status === "draft" && (
                            <Button
                              size="sm"
                              onClick={() => handlePublishPost(post.id)}
                              className="ml-2"
                            >
                              <Send className="h-4 w-4 mr-1" />
                              Publish
                            </Button>
                          )}
                          {post.status === "posted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRepostPost(post.id)}
                              className="ml-2"
                            >
                              <Repeat className="h-4 w-4 mr-1" />
                              Repost
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Post</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this post?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deletePost(post.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="bg-muted p-3 rounded-md mb-3">
                        <p className="text-sm">{post.post_content}</p>
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center space-x-4">
                          {post.content_url && (
                            <a
                              href={post.content_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center hover:text-primary"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View Content
                            </a>
                          )}
                          {post.scheduled_for && (
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Scheduled:{" "}
                              {format(
                                new Date(post.scheduled_for),
                                "MMM dd, HH:mm"
                              )}
                            </div>
                          )}
                          {post.posted_at && (
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Posted:{" "}
                              {format(
                                new Date(post.posted_at),
                                "MMM dd, HH:mm"
                              )}
                            </div>
                          )}
                        </div>
                        <span>
                          Created:{" "}
                          {format(new Date(post.created_at), "MMM dd, HH:mm")}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="h-5 w-5 mr-2" />
                  Event of the Day
                </CardTitle>
                <CardDescription>
                  Generate AI-powered posts about upcoming events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() =>
                    handleGeneratePost("event", "event_of_the_day")
                  }
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4 mr-2" />
                  )}
                  Generate Event Post
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="h-5 w-5 mr-2" />
                  Restaurant of the Day
                </CardTitle>
                <CardDescription>
                  Generate AI-powered posts about restaurants and openings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() =>
                    handleGeneratePost("restaurant", "restaurant_of_the_day")
                  }
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4 mr-2" />
                  )}
                  Generate Restaurant Post
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>AI Content Generation</CardTitle>
              <CardDescription>
                The AI will automatically select content that hasn't been
                featured recently and generate both Twitter/Threads (under 200
                chars) and Facebook/LinkedIn (longer format) versions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold mb-2">
                      Twitter/Threads Format
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Under 200 characters</li>
                      <li>• Concise and engaging</li>
                      <li>• Relevant hashtags</li>
                      <li>• Clear call to action</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">
                      Facebook/LinkedIn Format
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 200-500 characters</li>
                      <li>• Detailed storytelling</li>
                      <li>• Professional tone</li>
                      <li>• Strong call to action</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Debug & Troubleshooting</CardTitle>
              <CardDescription>
                Check what content is available for social media generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={async () => {
                  try {
                    await debugContent();
                  } catch (error) {
                    log.error("Debug failed", { action: 'debugContent', metadata: { error } });
                  }
                }}
                variant="outline"
                className="w-full"
              >
                <Bot className="h-4 w-4 mr-2" />
                Check Available Content
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Daily Automation Schedule
              </CardTitle>
              <CardDescription>
                Configure when social media posts are automatically generated and published
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {automationSettings.enabled ? (
                    <Play className="h-5 w-5 text-green-500" />
                  ) : (
                    <Pause className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <h3 className="font-semibold">
                      Automation {automationSettings.enabled ? "Enabled" : "Disabled"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {automationSettings.enabled 
                        ? "Posts will be automatically generated daily"
                        : "Automation is currently paused"
                      }
                    </p>
                  </div>
                </div>
                <Switch
                  checked={automationSettings.enabled}
                  onCheckedChange={async (checked) => {
                    const newSettings = { ...automationSettings, enabled: checked };
                    setAutomationSettings(newSettings);
                    await saveAutomationSettings(newSettings);
                  }}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="event-time">Event Posts (Morning)</Label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="event-time"
                      type="time"
                      value={automationSettings.eventTime}
                      onChange={async (e) => {
                        const newSettings = {
                          ...automationSettings,
                          eventTime: e.target.value,
                        };
                        setAutomationSettings(newSettings);
                        await saveAutomationSettings(newSettings);
                      }}
                      disabled={!automationSettings.enabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current setting: Events posted at {automationSettings.eventTime} Central Time
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="restaurant-time">Restaurant Posts (Evening)</Label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="restaurant-time"
                      type="time"
                      value={automationSettings.restaurantTime}
                      onChange={async (e) => {
                        const newSettings = {
                          ...automationSettings,
                          restaurantTime: e.target.value,
                        };
                        setAutomationSettings(newSettings);
                        await saveAutomationSettings(newSettings);
                      }}
                      disabled={!automationSettings.enabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current setting: Restaurants posted at {automationSettings.restaurantTime} Central Time
                  </p>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center">
                  <Bot className="h-4 w-4 mr-2" />
                  How Daily Automation Works
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>Event Posts:</strong> Generated every morning featuring upcoming events</li>
                  <li>• <strong>Restaurant Posts:</strong> Generated every evening highlighting local restaurants</li>
                  <li>• <strong>Smart Selection:</strong> AI chooses content that hasn't been featured recently</li>
                  <li>• <strong>Webhook Distribution:</strong> Posts are automatically sent to configured webhooks</li>
                  <li>• <strong>Duplicate Prevention:</strong> Won't post if content was already posted within 20 hours</li>
                </ul>
              </div>

              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-4">
                  <div className="flex items-start space-x-3">
                    <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-blue-900">Current CRON Status</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        The automation system runs every 30 minutes and checks for the configured posting times.
                        Posts are generated using your existing webhook configuration and AI settings.
                      </p>
                      <div className="mt-3 text-xs text-blue-600">
                        <div>Next Event Check: Today at {automationSettings.eventTime}</div>
                        <div>Next Restaurant Check: Today at {automationSettings.restaurantTime}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleGeneratePost("event", "event_of_the_day")}
                  disabled={isGenerating}
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Test Event Post
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleGeneratePost("restaurant", "restaurant_of_the_day")}
                  disabled={isGenerating}
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Test Restaurant Post
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Webhook Configuration</CardTitle>
                <CardDescription>
                  Configure webhooks to automatically distribute posts to social
                  media platforms
                </CardDescription>
              </div>
              <Dialog open={isAddingWebhook} onOpenChange={setIsAddingWebhook}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Webhook
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Webhook</DialogTitle>
                    <DialogDescription>
                      Configure a webhook URL to receive social media post data
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="webhook-name">Name</Label>
                      <Input
                        id="webhook-name"
                        value={newWebhook.name}
                        onChange={(e) =>
                          setNewWebhook({ ...newWebhook, name: e.target.value })
                        }
                        placeholder="e.g., Twitter Bot"
                      />
                    </div>
                    <div>
                      <Label htmlFor="webhook-platform">Platform</Label>
                      <Select
                        value={newWebhook.platform}
                        onValueChange={(value) =>
                          setNewWebhook({ ...newWebhook, platform: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="twitter">Twitter</SelectItem>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="linkedin">LinkedIn</SelectItem>
                          <SelectItem value="threads">Threads</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="webhook-url">Webhook URL</Label>
                      <Input
                        id="webhook-url"
                        value={newWebhook.webhook_url}
                        onChange={(e) =>
                          setNewWebhook({
                            ...newWebhook,
                            webhook_url: e.target.value,
                          })
                        }
                        placeholder="https://your-webhook-endpoint.com"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="webhook-active"
                        checked={newWebhook.is_active}
                        onCheckedChange={(checked) =>
                          setNewWebhook({ ...newWebhook, is_active: checked })
                        }
                      />
                      <Label htmlFor="webhook-active">Active</Label>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsAddingWebhook(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddWebhook}>Add Webhook</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {webhooks.length === 0 ? (
                <div className="text-center py-8">
                  <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No webhooks configured
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {webhooks.map((webhook) => (
                    <Card key={webhook.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{webhook.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {webhook.webhook_url}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="outline">{webhook.platform}</Badge>
                            {webhook.is_active ? (
                              <Badge className="bg-green-500 text-white">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              testWebhook(webhook.id)
                            }
                          >
                            Test
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              updateWebhook(webhook.id, webhook.webhook_url)
                            }
                          >
                            {webhook.is_active ? "Disable" : "Enable"}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Webhook
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this webhook?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteWebhook(webhook.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SocialMediaManager;
