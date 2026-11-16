import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, Search, Globe, Link2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
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
  /** True only when a server-side OAuth flow exists for this provider. */
  connectable: boolean;
}

const providers: OAuthProvider[] = [
  {
    provider_name: "google_analytics",
    label: "Google Analytics",
    icon: <BarChart3 className="h-6 w-6" />,
    description: "Track website traffic, user behavior, and conversion metrics",
    connectable: false,
  },
  {
    provider_name: "google_search_console",
    label: "Google Search Console",
    icon: <Search className="h-6 w-6" />,
    description: "Monitor search performance, keywords, and indexing status",
    connectable: true,
  },
  {
    provider_name: "bing_webmaster",
    label: "Bing Webmaster Tools",
    icon: <Globe className="h-6 w-4" />,
    description: "Access Bing search data and webmaster tools",
    connectable: false,
  },
  {
    provider_name: "yandex_webmaster",
    label: "Yandex Webmaster",
    icon: <Link2 className="h-6 w-6" />,
    description: "Monitor Yandex search performance and indexing",
    connectable: false,
  },
];

export function OAuthProviderSetup({ onComplete }: OAuthProviderSetupProps) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async (providerName: string) => {
    try {
      setLoading(true);

      // Google Search Console uses the dedicated gsc-oauth edge function.
      // The edge function reads `action` from URL query params, so we call it
      // directly via fetch (GET) rather than supabase.functions.invoke (POST).
      if (providerName === "google_search_console") {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("You must be logged in.");

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const authorizeUrl = new URL(`${supabaseUrl}/functions/v1/gsc-oauth`);
        authorizeUrl.searchParams.set("action", "authorize");

        const res = await fetch(authorizeUrl.toString(), {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Failed to start OAuth flow.");
        }

        const { authorizationUrl } = await res.json();
        if (!authorizationUrl) throw new Error("No authorization URL returned.");

        // Save provider state for callback identification
        storage.setString("oauth_connecting_provider", providerName);

        window.location.href = authorizationUrl;
        return;
      }

      // WEB-SEC-079: there is no other flow. The generic branch that used to
      // live here read oauth_providers with select('*'), which shipped
      // client_secret to the browser, and sent the provider back to
      // /admin/oauth/callback, which only ever calls gsc-oauth, so a Bing,
      // Yandex or Analytics connect could never finish. A provider gets a
      // Connect button again when it has a server-side flow of its own.
      throw new Error("This platform cannot be connected yet.");
    } catch (error: unknown) {
      log.error('oauthConnect', 'OAuth connection error', { data: error });
      toast.error("Failed to connect", {
        description: (error instanceof Error && error.message) || "Please try again",
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
                {provider.connectable ? (
                  <Button
                    onClick={() => handleConnect(provider.provider_name)}
                    disabled={loading}
                    className="w-full gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {loading ? "Connecting..." : "Connect"}
                  </Button>
                ) : (
                  <Button variant="secondary" disabled className="w-full">
                    Not available yet
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Alert className="mt-6">
          <AlertDescription>
            {/* WEB-SEC-080: there is no credentials form. Every flow that
                exists (gsc-oauth, gsc-fetch-properties, gsc-sync-data) reads
                the Google client from edge-function secrets, so a client_secret
                typed here was stored in oauth_providers and read by nothing. */}
            <p className="text-sm">
              Search Console signs in with the Google OAuth client set in the
              GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI
              edge-function secrets (supabase secrets set). The redirect URI in
              Google Cloud Console must match GOOGLE_REDIRECT_URI exactly. Nothing
              on this page asks for or stores an OAuth secret.
            </p>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
