import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BarChart3, Search, Globe, Link2, ExternalLink, CheckCircle2, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { storage } from "@/lib/safeStorage";
import { createLogger } from '@/lib/logger';

const log = createLogger('OAuthProviderSetup');

interface OAuthProviderSetupProps {
  onComplete: () => void;
}

interface OAuthProvider {
  provider_name: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  setupInstructions: string;
  docsUrl: string;
}

const providers: OAuthProvider[] = [
  {
    provider_name: "google_analytics",
    label: "Google Analytics",
    icon: <BarChart3 className="h-6 w-6" />,
    description: "Track website traffic, user behavior, and conversion metrics",
    setupInstructions: "1. Go to Google Cloud Console\n2. Create OAuth 2.0 credentials\n3. Add authorized redirect URI\n4. Enable Analytics API",
    docsUrl: "https://developers.google.com/analytics/devguides/reporting/core/v4/quickstart/service-py",
  },
  {
    provider_name: "google_search_console",
    label: "Google Search Console",
    icon: <Search className="h-6 w-6" />,
    description: "Monitor search performance, keywords, and indexing status",
    setupInstructions: "1. Use same OAuth credentials as Analytics\n2. Enable Search Console API\n3. Verify site ownership",
    docsUrl: "https://developers.google.com/webmaster-tools/search-console-api-original/v3/quickstart",
  },
  {
    provider_name: "bing_webmaster",
    label: "Bing Webmaster Tools",
    icon: <Globe className="h-6 w-4" />,
    description: "Access Bing search data and webmaster tools",
    setupInstructions: "1. Register app in Azure AD\n2. Configure API permissions\n3. Add site to Bing Webmaster Tools",
    docsUrl: "https://docs.microsoft.com/en-us/bingwebmaster/getting-access",
  },
  {
    provider_name: "yandex_webmaster",
    label: "Yandex Webmaster",
    icon: <Link2 className="h-6 w-6" />,
    description: "Monitor Yandex search performance and indexing",
    setupInstructions: "1. Create app in Yandex OAuth\n2. Request webmaster API access\n3. Verify site ownership",
    docsUrl: "https://yandex.com/dev/webmaster/doc/dg/concepts/about.html",
  },
];

export function OAuthProviderSetup({ onComplete }: OAuthProviderSetupProps) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);

  const handleConnect = async (providerName: string) => {
    try {
      setLoading(true);

      // Get OAuth configuration
      const { data: providerData, error: providerError } = await supabase
        .from("oauth_providers")
        .select("*")
        .eq("provider_name", providerName)
        .single();

      if (providerError) throw providerError;

      // Build OAuth URL
      const redirectUri = `${window.location.origin}/admin/oauth/callback`;
      const state = btoa(JSON.stringify({
        provider: providerName,
        timestamp: Date.now(),
      }));

      let authUrl = providerData.authorization_url;
      authUrl += `?client_id=${encodeURIComponent(providerData.client_id || clientId)}`;
      authUrl += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
      authUrl += `&response_type=code`;
      authUrl += `&scope=${encodeURIComponent(providerData.scopes.join(" "))}`;
      authUrl += `&state=${encodeURIComponent(state)}`;
      authUrl += `&access_type=offline`; // Request refresh token
      authUrl += `&prompt=consent`; // Force consent screen

      // Save state to secure storage for verification
      storage.setString("oauth_state", state);

      // Redirect to OAuth provider
      window.location.href = authUrl;
    } catch (error: any) {
      log.error('oauthConnect', 'OAuth connection error', { data: error });
      toast.error("Failed to connect", {
        description: error.message || "Please try again",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!selectedProvider || !clientId || !clientSecret) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);

      // Update provider configuration with credentials
      const { error } = await supabase
        .from("oauth_providers")
        .update({
          client_id: clientId,
          client_secret: clientSecret,
          updated_at: new Date().toISOString(),
        })
        .eq("provider_name", selectedProvider);

      if (error) throw error;

      toast.success("Credentials saved successfully!");
      setShowSetupDialog(false);
      setClientId("");
      setClientSecret("");
      setSelectedProvider(null);
    } catch (error: any) {
      log.error('saveCredentials', 'Save credentials error', { data: error });
      toast.error("Failed to save credentials", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Analytics Platforms</CardTitle>
        <CardDescription>
          Connect your analytics platforms to start tracking unified metrics
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((provider) => (
            <Card key={provider.provider_name} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {provider.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.label}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {provider.description}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Dialog open={showSetupDialog && selectedProvider === provider.provider_name}
                  onOpenChange={(open) => {
                    setShowSetupDialog(open);
                    if (!open) {
                      setSelectedProvider(null);
                      setClientId("");
                      setClientSecret("");
                    }
                  }}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => {
                        setSelectedProvider(provider.provider_name);
                        setShowSetupDialog(true);
                      }}
                    >
                      <Settings className="h-4 w-4" />
                      Configure Credentials
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Setup {provider.label}</DialogTitle>
                      <DialogDescription>
                        Configure OAuth credentials for {provider.label}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Alert>
                        <AlertDescription className="space-y-2">
                          <p className="font-medium">Setup Instructions:</p>
                          <pre className="text-xs whitespace-pre-wrap bg-muted p-2 rounded">
                            {provider.setupInstructions}
                          </pre>
                          <a
                            href={provider.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                          >
                            View Documentation <ExternalLink className="h-3 w-3" />
                          </a>
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-2">
                        <Label htmlFor="client_id">Client ID</Label>
                        <Input
                          id="client_id"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="Enter your OAuth Client ID"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="client_secret">Client Secret</Label>
                        <Input
                          id="client_secret"
                          type="password"
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                          placeholder="Enter your OAuth Client Secret"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Redirect URI (Add this to your OAuth app)</Label>
                        <Input
                          readOnly
                          value={`${window.location.origin}/admin/oauth/callback`}
                          className="font-mono text-xs"
                        />
                      </div>

                      <Button
                        onClick={handleSaveCredentials}
                        disabled={loading || !clientId || !clientSecret}
                        className="w-full"
                      >
                        {loading ? "Saving..." : "Save Credentials"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  onClick={() => handleConnect(provider.provider_name)}
                  disabled={loading}
                  className="w-full gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {loading ? "Connecting..." : "Connect"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Alert className="mt-6">
          <AlertDescription>
            <p className="font-medium mb-2">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>OAuth credentials are stored securely in your database</li>
              <li>You'll need to create OAuth apps in each platform's developer console</li>
              <li>Make sure to add the redirect URI to your OAuth app settings</li>
              <li>Data will sync automatically once connected</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
