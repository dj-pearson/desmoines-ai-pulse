import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Webhook, Save } from "lucide-react";

export function ArticleWebhookConfig() {
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: webhook, isLoading } = useQuery({
    queryKey: ["article-webhook"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("article_webhooks")
        .select("*")
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setWebhookUrl(data.webhook_url);
        setIsActive(data.is_active);
      }
      
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!webhookUrl.trim()) {
        throw new Error("Webhook URL is required");
      }

      // Validate URL format
      try {
        new URL(webhookUrl);
      } catch {
        throw new Error("Invalid webhook URL format");
      }

      const payload = {
        webhook_url: webhookUrl,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (webhook?.id) {
        // Update existing
        const { error } = await supabase
          .from("article_webhooks")
          .update(payload)
          .eq("id", webhook.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("article_webhooks")
          .insert([payload]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-webhook"] });
      toast.success("Webhook configuration saved successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to save webhook: ${error.message}`);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!webhook?.webhook_url) {
        throw new Error("Please save a webhook URL first");
      }

      // Send a test payload
      const testPayload = {
        test: true,
        article_id: "test-id",
        article_title: "Test Article",
        article_url: "https://desmoinesguide.com/articles/test",
        short_description: "This is a test short description for Twitter (280 chars max)",
        long_description: "This is a test longer description for Facebook. It contains more details about the article and can be up to 500 characters long.",
        excerpt: "Test excerpt",
        category: "Test",
        tags: ["test", "webhook"],
        seo_keywords: ["test", "webhook", "article"],
        featured_image_url: "https://example.com/image.jpg",
        published_at: new Date().toISOString(),
      };

      const response = await fetch(webhook.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayload),
      });

      if (!response.ok) {
        throw new Error(`Webhook test failed: ${response.status} ${response.statusText}`);
      }

      return response;
    },
    onSuccess: () => {
      toast.success("Test webhook sent successfully! Check your Make.com scenario.");
    },
    onError: (error: Error) => {
      toast.error(`Webhook test failed: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Article Publication Webhook
        </CardTitle>
        <CardDescription>
          Configure a webhook to automatically send article data with AI-generated social media descriptions to Make.com when articles are published
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="webhook-url">Make.com Webhook URL</Label>
          <Input
            id="webhook-url"
            type="url"
            placeholder="https://hook.us1.make.com/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            The webhook will include: article title, URL, short description (Twitter), long description (Facebook), keywords, and more
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Active</Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable the webhook
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !webhookUrl.trim()}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !webhook?.webhook_url}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Webhook"
            )}
          </Button>
        </div>

        <div className="rounded-lg bg-muted p-4 text-sm">
          <p className="font-medium mb-2">Webhook Payload Structure:</p>
          <pre className="text-xs overflow-x-auto">
{`{
  "article_id": "uuid",
  "article_title": "string",
  "article_url": "string",
  "short_description": "280 chars (Twitter)",
  "long_description": "500 chars (Facebook)",
  "excerpt": "string",
  "category": "string",
  "tags": ["array"],
  "seo_keywords": ["array"],
  "featured_image_url": "string",
  "published_at": "timestamp",
  "author_id": "uuid"
}`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
