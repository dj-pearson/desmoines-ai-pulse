import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Globe, 
  Rss, 
  Zap, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  Send,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createLogger } from '@/lib/logger';

const log = createLogger('EventSubmissionManager');

interface PlatformConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  webhookUrl?: string;
  apiKey?: string;
  requiresSetup: boolean;
  setupUrl?: string;
  submissionType: 'webhook' | 'rss' | 'api' | 'manual';
}

const DEFAULT_PLATFORMS: PlatformConfig[] = [
  {
    id: 'eventbrite',
    name: 'Eventbrite',
    description: 'Automatically submit events to Eventbrite for wider reach',
    enabled: false,
    requiresSetup: true,
    setupUrl: 'https://www.eventbrite.com/platform/api',
    submissionType: 'api'
  },
  {
    id: 'meetup',
    name: 'Meetup',
    description: 'Share community events on Meetup platform',
    enabled: false,
    requiresSetup: true,
    setupUrl: 'https://www.meetup.com/api',
    submissionType: 'api'
  },
  {
    id: 'facebook',
    name: 'Facebook Events',
    description: 'Post events to Facebook for social media reach',
    enabled: false,
    requiresSetup: true,
    setupUrl: 'https://developers.facebook.com/docs/graph-api',
    submissionType: 'api'
  },
  {
    id: 'allevents',
    name: 'AllEvents.in',
    description: 'Submit to AllEvents.in directory',
    enabled: false,
    requiresSetup: true,
    setupUrl: 'https://allevents.in',
    submissionType: 'webhook'
  },
  {
    id: 'local-news',
    name: 'Local News Outlets',
    description: 'Send to local Des Moines news calendars',
    enabled: false,
    requiresSetup: true,
    submissionType: 'webhook'
  },
  {
    id: 'google-events',
    name: 'Google Events Feed',
    description: 'Submit to Google Events via structured feed',
    enabled: true,
    requiresSetup: false,
    submissionType: 'rss'
  }
];

export default function EventSubmissionManager() {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(DEFAULT_PLATFORMS);
  const [masterWebhook, setMasterWebhook] = useState('');
  const [rssEnabled, setRssEnabled] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testEvent, setTestEvent] = useState({
    title: 'Test Event Submission',
    description: 'This is a test event to verify submission systems',
    date: new Date().toISOString(),
    location: 'Des Moines, IA'
  });
  const { toast } = useToast();

  // Load saved configuration
  useEffect(() => {
    const savedConfig = localStorage.getItem('eventSubmissionConfig');
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      setPlatforms(config.platforms || DEFAULT_PLATFORMS);
      setMasterWebhook(config.masterWebhook || '');
      setRssEnabled(config.rssEnabled ?? true);
      setAutoSubmit(config.autoSubmit ?? false);
    }
  }, []);

  const saveConfiguration = () => {
    const config = {
      platforms,
      masterWebhook,
      rssEnabled,
      autoSubmit,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('eventSubmissionConfig', JSON.stringify(config));
    toast({
      title: "Configuration Saved",
      description: "Event submission settings have been saved successfully.",
    });
  };

  const updatePlatform = (id: string, updates: Partial<PlatformConfig>) => {
    setPlatforms(prev => prev.map(p => 
      p.id === id ? { ...p, ...updates } : p
    ));
  };

  const handleTestSubmission = async () => {
    if (!masterWebhook && !platforms.some(p => p.enabled)) {
      toast({
        title: "No Submission Methods",
        description: "Please configure at least one submission method or webhook URL.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Test master webhook if configured
      if (masterWebhook) {
        const webhookData = {
          event: testEvent,
          platforms: platforms.filter(p => p.enabled).map(p => p.id),
          submissionType: 'test',
          timestamp: new Date().toISOString(),
          source: 'des-moines-insider'
        };

        await fetch(masterWebhook, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          mode: "no-cors",
          body: JSON.stringify(webhookData),
        });
      }

      // Test individual platform webhooks
      for (const platform of platforms.filter(p => p.enabled && p.webhookUrl)) {
        try {
          await fetch(platform.webhookUrl!, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            mode: "no-cors",
            body: JSON.stringify({
              event: testEvent,
              platform: platform.id,
              submissionType: 'test',
              timestamp: new Date().toISOString()
            }),
          });
        } catch (error) {
          log.error('testPlatform', `Error testing ${platform.name}`, { data: error });
        }
      }

      toast({
        title: "Test Submitted",
        description: "Test event has been sent to configured platforms. Check your Zapier history to confirm delivery.",
      });
    } catch (error) {
      log.error('testSubmission', 'Test submission error', { data: error });
      toast({
        title: "Test Failed",
        description: "Failed to send test event. Please check your configuration.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyRssUrl = () => {
    const rssUrl = `${window.location.origin}/api/events/feed.xml`;
    navigator.clipboard.writeText(rssUrl);
    toast({
      title: "RSS URL Copied",
      description: "The RSS feed URL has been copied to your clipboard.",
    });
  };

  const enabledPlatforms = platforms.filter(p => p.enabled);
  const rssUrl = `${window.location.origin}/api/events/feed.xml`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Event Submission Manager</h2>
          <p className="text-muted-foreground">
            Automatically distribute events to multiple platforms for maximum reach
          </p>
        </div>
        <Button onClick={saveConfiguration} className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Save Configuration
        </Button>
      </div>

      <Tabs defaultValue="platforms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="feeds">RSS Feeds</TabsTrigger>
          <TabsTrigger value="test">Test & Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="platforms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Platform Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {platforms.map((platform) => (
                <div key={platform.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{platform.name}</h4>
                        <Badge variant={platform.enabled ? "default" : "secondary"}>
                          {platform.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline">{platform.submissionType}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{platform.description}</p>
                    </div>
                    <Switch
                      checked={platform.enabled}
                      onCheckedChange={(enabled) => updatePlatform(platform.id, { enabled })}
                    />
                  </div>

                  {platform.enabled && (
                    <div className="space-y-3">
                      {platform.submissionType === 'webhook' && (
                        <div>
                          <Label htmlFor={`${platform.id}-webhook`}>Zapier Webhook URL</Label>
                          <Input
                            id={`${platform.id}-webhook`}
                            placeholder="https://hooks.zapier.com/hooks/catch/..."
                            value={platform.webhookUrl || ''}
                            onChange={(e) => updatePlatform(platform.id, { webhookUrl: e.target.value })}
                          />
                        </div>
                      )}

                      {platform.submissionType === 'api' && (
                        <div>
                          <Label htmlFor={`${platform.id}-api`}>API Key</Label>
                          <Input
                            id={`${platform.id}-api`}
                            type="password"
                            placeholder="Enter API key..."
                            value={platform.apiKey || ''}
                            onChange={(e) => updatePlatform(platform.id, { apiKey: e.target.value })}
                          />
                        </div>
                      )}

                      {platform.requiresSetup && platform.setupUrl && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          asChild
                        >
                          <a href={platform.setupUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Setup Guide
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Automation Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-submit">Automatic Submission</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically submit new events to all enabled platforms
                  </p>
                </div>
                <Switch
                  id="auto-submit"
                  checked={autoSubmit}
                  onCheckedChange={setAutoSubmit}
                />
              </div>

              <div>
                <Label htmlFor="master-webhook">Master Zapier Webhook (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Single webhook that receives all events and can distribute to multiple platforms
                </p>
                <Input
                  id="master-webhook"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={masterWebhook}
                  onChange={(e) => setMasterWebhook(e.target.value)}
                />
              </div>

              {autoSubmit && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900">Automation Active</h4>
                      <p className="text-sm text-blue-700">
                        New events will be automatically submitted to {enabledPlatforms.length} platform(s)
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feeds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rss className="h-5 w-5" />
                RSS & Structured Feeds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="rss-enabled">Enable RSS Feed</Label>
                  <p className="text-sm text-muted-foreground">
                    Generate RSS feed with Schema.org Event markup for aggregators
                  </p>
                </div>
                <Switch
                  id="rss-enabled"
                  checked={rssEnabled}
                  onCheckedChange={setRssEnabled}
                />
              </div>

              {rssEnabled && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">RSS Feed URL</h4>
                    <Button variant="outline" size="sm" onClick={copyRssUrl}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy URL
                    </Button>
                  </div>
                  <code className="text-sm bg-white px-2 py-1 rounded border block">
                    {rssUrl}
                  </code>
                  <p className="text-sm text-muted-foreground mt-2">
                    This feed includes full Schema.org Event markup and can be consumed by:
                  </p>
                  <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside">
                    <li>Google Events (via RSS ingestion)</li>
                    <li>Bing/Yahoo event discovery</li>
                    <li>Local news calendar systems</li>
                    <li>Event aggregator platforms</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Test Submission
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="test-title">Test Event Title</Label>
                  <Input
                    id="test-title"
                    value={testEvent.title}
                    onChange={(e) => setTestEvent(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="test-location">Location</Label>
                  <Input
                    id="test-location"
                    value={testEvent.location}
                    onChange={(e) => setTestEvent(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="test-description">Description</Label>
                <Textarea
                  id="test-description"
                  value={testEvent.description}
                  onChange={(e) => setTestEvent(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Will submit to {enabledPlatforms.length} enabled platform(s)
                    {masterWebhook && " + master webhook"}
                  </p>
                  {enabledPlatforms.length === 0 && !masterWebhook && (
                    <div className="flex items-center gap-2 mt-1">
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      <span className="text-sm text-orange-600">No platforms configured</span>
                    </div>
                  )}
                </div>
                <Button 
                  onClick={handleTestSubmission}
                  disabled={isLoading || (enabledPlatforms.length === 0 && !masterWebhook)}
                  className="flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {isLoading ? "Sending..." : "Send Test Event"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Integrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {enabledPlatforms.map((platform) => (
                  <div key={platform.id} className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">{platform.name}</span>
                    <Badge variant="outline" className="text-xs">{platform.submissionType}</Badge>
                  </div>
                ))}
                {rssEnabled && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
                    <Rss className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">RSS Feed</span>
                    <Badge variant="outline" className="text-xs">feed</Badge>
                  </div>
                )}
              </div>
              {enabledPlatforms.length === 0 && !rssEnabled && (
                <p className="text-muted-foreground text-center py-4">
                  No integrations currently active
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}