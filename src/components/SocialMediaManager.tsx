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
} from "lucide-react";
import { useSocialMediaManager } from "@/hooks/useSocialMediaManager";
import { format } from "date-fns";

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
    deletePost,
  } = useSocialMediaManager();

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
      await generatePost(contentType, subjectType);
    } catch (error) {
      console.error("Failed to generate post:", error);
    }
  };

  const handlePublishPost = async (postId: string) => {
    try {
      await publishPost(postId);
    } catch (error) {
      console.error("Failed to publish post:", error);
    }
  };

  const handleAddWebhook = async () => {
    try {
      await addWebhook(newWebhook);
      setNewWebhook({
        name: "",
        platform: "",
        webhook_url: "",
        is_active: true,
        headers: {},
      });
      setIsAddingWebhook(false);
    } catch (error) {
      console.error("Failed to add webhook:", error);
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
                    console.error("Debug failed:", error);
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
                              updateWebhook(webhook.id, {
                                is_active: !webhook.is_active,
                              })
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
