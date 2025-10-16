import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, Zap, DollarSign, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ScraperSettings() {
  const [backend, setBackend] = useState<string>("puppeteer");
  const [waitTime, setWaitTime] = useState<string>("5000");
  const [timeout, setTimeout] = useState<string>("30000");
  const { toast } = useToast();

  const backendInfo = {
    puppeteer: {
      name: "Puppeteer",
      icon: <Zap className="h-4 w-4" />,
      description: "Fast, Chromium-based, runs locally",
      cost: "Free",
      status: "Recommended",
    },
    playwright: {
      name: "Playwright",
      icon: <Zap className="h-4 w-4" />,
      description: "Very reliable, multi-browser support",
      cost: "Free",
      status: "Alternative",
    },
    firecrawl: {
      name: "Firecrawl",
      icon: <DollarSign className="h-4 w-4" />,
      description: "Cloud-based, reliable, requires credits",
      cost: "$0.50/1000 pages",
      status: "Fallback",
    },
  };

  const currentBackend = backendInfo[backend as keyof typeof backendInfo];

  const handleSaveSettings = () => {
    toast({
      title: "Settings Saved",
      description: (
        <div className="space-y-2">
          <p>Scraper backend: <strong>{currentBackend.name}</strong></p>
          <p className="text-sm text-muted-foreground">
            To apply these settings, update your Supabase Edge Function environment variables:
          </p>
          <div className="bg-muted p-2 rounded text-xs font-mono">
            SCRAPER_BACKEND={backend}<br/>
            SCRAPER_WAIT_TIME={waitTime}<br/>
            SCRAPER_TIMEOUT={timeout}
          </div>
        </div>
      ),
      duration: 10000,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <CardTitle>Scraper Configuration</CardTitle>
        </div>
        <CardDescription>
          Configure which scraping backend to use for crawling websites
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Backend Selection */}
        <div className="space-y-2">
          <Label htmlFor="backend">Scraper Backend</Label>
          <Select value={backend} onValueChange={setBackend}>
            <SelectTrigger id="backend">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="puppeteer">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Puppeteer (Default)
                </div>
              </SelectItem>
              <SelectItem value="playwright">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Playwright
                </div>
              </SelectItem>
              <SelectItem value="firecrawl">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Firecrawl (Paid)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Backend Info Card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{currentBackend.icon}</div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{currentBackend.name}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {currentBackend.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentBackend.description}
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Cost: </span>
                    <span className="font-medium">{currentBackend.cost}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Advanced Settings</h4>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waitTime">Wait Time (ms)</Label>
              <Input
                id="waitTime"
                type="number"
                value={waitTime}
                onChange={(e) => setWaitTime(e.target.value)}
                placeholder="5000"
              />
              <p className="text-xs text-muted-foreground">
                Time to wait for JavaScript to render
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(e.target.value)}
                placeholder="30000"
              />
              <p className="text-xs text-muted-foreground">
                Maximum time to wait for page load
              </p>
            </div>
          </div>
        </div>

        {/* Automatic Failover Notice */}
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-green-900 dark:text-green-100">
                  Automatic Failover Enabled
                </h4>
                <p className="text-xs text-green-700 dark:text-green-300">
                  If Puppeteer or Playwright fails and you have FIRECRAWL_API_KEY configured,
                  the system will automatically fall back to Firecrawl to ensure scraping succeeds.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleSaveSettings} className="flex-1">
            Save Configuration
          </Button>
          <Button variant="outline" asChild>
            <a 
              href="https://supabase.com/dashboard/project/wtkhfqpmcegzcbngroui/settings/functions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Edge Function Settings →
            </a>
          </Button>
        </div>

        {/* Documentation Link */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            For detailed setup instructions, see{" "}
            <a 
              href="/README-SCRAPER-SETUP.md" 
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              README-SCRAPER-SETUP.md
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
