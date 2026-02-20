import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search,
  TrendingUp,
  Users,
  FileText,
  Bell,
  Globe,
  Bot,
  FileCode2,
  Sparkles,
  Code,
  Gauge,
  Link2,
  AlertTriangle,
  Network,
  FileCheck,
  Map,
  Image,
  ArrowRight,
  Copy,
  Shield,
  Smartphone,
  Zap,
  BarChart3,
} from "lucide-react";
import { createLogger } from '@/lib/logger';

const log = createLogger('SEOManager');

interface AuditResult {
  url: string;
  overallScore: number;
  technicalScore: number;
  contentScore: number;
  recommendations: any[];
}

export function SEOManager() {
  const [activeTab, setActiveTab] = useState("audit");
  const [loading, setLoading] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  // Run SEO Audit
  const runAudit = async () => {
    if (!auditUrl) {
      toast.error("Please enter a URL to audit");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("seo-audit", {
        body: { url: auditUrl, auditType: "full", saveResults: true },
      });

      if (error) throw error;

      setAuditResult(data.audit);
      toast.success(`Audit completed! Score: ${data.audit.overallScore}/100`);
    } catch (error: any) {
      log.error('audit', 'Audit error', { data: error });
      toast.error(error.message || "Failed to run audit");
    } finally {
      setLoading(false);
    }
  };

  // Check Core Web Vitals
  const checkCoreWebVitals = async (url: string, device: "mobile" | "desktop" = "mobile") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-core-web-vitals", {
        body: { url, device, saveResults: true },
      });

      if (error) throw error;

      toast.success(
        `Core Web Vitals: ${data.coreWebVitals.overallAssessment} (Score: ${data.coreWebVitals.performanceScore})`
      );
      return data;
    } catch (error: any) {
      log.error('coreWebVitals', 'Core Web Vitals error', { data: error });
      toast.error(error.message || "Failed to check Core Web Vitals");
    } finally {
      setLoading(false);
    }
  };

  // Crawl Site
  const crawlSite = async (startUrl: string, maxPages: number = 50) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crawl-site", {
        body: { startUrl, maxPages, maxDepth: 3, saveResults: true },
      });

      if (error) throw error;

      toast.success(
        `Crawled ${data.summary.pagesCrawled} pages in ${Math.round(data.summary.executionTime / 1000)}s`
      );
      return data;
    } catch (error: any) {
      log.error('crawl', 'Crawl error', { data: error });
      toast.error(error.message || "Failed to crawl site");
    } finally {
      setLoading(false);
    }
  };

  // Analyze Content
  const analyzeContent = async (url: string, targetKeyword?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-content", {
        body: { url, targetKeyword, saveResults: true },
      });

      if (error) throw error;

      toast.success(
        `Content Score: ${data.analysis.scores.overall}/100 (${data.analysis.metrics.wordCount} words)`
      );
      return data;
    } catch (error: any) {
      log.error('analyzeContent', 'Content analysis error', { data: error });
      toast.error(error.message || "Failed to analyze content");
    } finally {
      setLoading(false);
    }
  };

  // Analyze Images
  const analyzeImages = async (url: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-images", {
        body: { url, saveResults: true },
      });

      if (error) throw error;

      toast.success(
        `Found ${data.summary.totalImages} images (${data.summary.imagesWithoutAlt} missing alt text)`
      );
      return data;
    } catch (error: any) {
      log.error('analyzeImages', 'Image analysis error', { data: error });
      toast.error(error.message || "Failed to analyze images");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">SEO Management</h2>
        <p className="text-muted-foreground">
          Comprehensive SEO analysis, monitoring, and optimization tools
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-6 lg:grid-cols-11 gap-2 h-auto">
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Audit</span>
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Keywords</span>
          </TabsTrigger>
          <TabsTrigger value="competitors" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Competitors</span>
          </TabsTrigger>
          <TabsTrigger value="pages" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Pages</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Monitoring</span>
          </TabsTrigger>
          <TabsTrigger value="meta" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Meta Tags</span>
          </TabsTrigger>
          <TabsTrigger value="robots" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Robots</span>
          </TabsTrigger>
          <TabsTrigger value="sitemap" className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            <span className="hidden sm:inline">Sitemap</span>
          </TabsTrigger>
          <TabsTrigger value="structured" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">Schema</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="links" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Links</span>
          </TabsTrigger>
        </TabsList>

        {/* Additional tabs row */}
        <TabsList className="grid grid-cols-6 lg:grid-cols-11 gap-2 h-auto">
          <TabsTrigger value="broken" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Broken Links</span>
          </TabsTrigger>
          <TabsTrigger value="structure" className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            <span className="hidden sm:inline">Link Structure</span>
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Content</span>
          </TabsTrigger>
          <TabsTrigger value="crawler" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Site Crawler</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="redirects" className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            <span className="hidden sm:inline">Redirects</span>
          </TabsTrigger>
          <TabsTrigger value="duplicate" className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">Duplicates</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="mobile" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Mobile</span>
          </TabsTrigger>
          <TabsTrigger value="budget" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Budget</span>
          </TabsTrigger>
          <TabsTrigger value="backlinks" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Backlinks</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab Contents */}

        {/* 1. Audit Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO Audit</CardTitle>
              <CardDescription>
                Run comprehensive SEO audit to identify issues and opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="audit-url">URL to Audit</Label>
                <div className="flex gap-2">
                  <Input
                    id="audit-url"
                    placeholder="https://desmoinesinsider.com"
                    value={auditUrl}
                    onChange={(e) => setAuditUrl(e.target.value)}
                  />
                  <Button onClick={runAudit} disabled={loading}>
                    {loading ? "Auditing..." : "Run Audit"}
                  </Button>
                </div>
              </div>

              {auditResult && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{auditResult.overallScore}/100</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Technical Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{auditResult.technicalScore}/100</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Content Score</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{auditResult.contentScore}/100</div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {auditResult.recommendations.map((rec: any, i: number) => (
                          <Alert key={i}>
                            <AlertDescription>
                              <div className="flex items-start gap-2">
                                <Badge
                                  variant={
                                    rec.priority === "critical"
                                      ? "destructive"
                                      : rec.priority === "high"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {rec.priority}
                                </Badge>
                                <div className="flex-1">
                                  <p className="font-medium">{rec.title}</p>
                                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                                </div>
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Keywords Tab */}
        <TabsContent value="keywords" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Keyword Tracking</CardTitle>
              <CardDescription>
                Monitor keyword rankings and performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription>
                  Keyword tracking feature coming soon. This will integrate with Google Search
                  Console for real-time keyword performance data.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3-10. More tabs with placeholders */}
        {[
          { value: "competitors", title: "Competitor Analysis", icon: Users },
          { value: "pages", title: "Page Scores", icon: FileText },
          { value: "monitoring", title: "Automated Monitoring", icon: Bell },
          { value: "meta", title: "Meta Tags Management", icon: Globe },
          { value: "robots", title: "Robots.txt", icon: Bot },
          { value: "sitemap", title: "XML Sitemap", icon: FileCode2 },
          { value: "structured", title: "Structured Data", icon: Code },
          { value: "performance", title: "Core Web Vitals", icon: Gauge },
        ].map(({ value, title, icon: Icon }) => (
          <TabsContent key={value} value={value} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {title}
                </CardTitle>
                <CardDescription>
                  Advanced {title.toLowerCase()} features and analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertDescription>
                    {title} feature is available. The database tables and edge functions are
                    ready. Frontend implementation coming soon.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        {/* 11. Site Crawler Tab */}
        <TabsContent value="crawler" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Crawler</CardTitle>
              <CardDescription>
                Crawl your entire site to find SEO issues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crawl-url">Start URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="crawl-url"
                    placeholder="https://desmoinesinsider.com"
                  />
                  <Button
                    onClick={() => {
                      const url = (document.getElementById("crawl-url") as HTMLInputElement).value;
                      if (url) crawlSite(url);
                    }}
                    disabled={loading}
                  >
                    {loading ? "Crawling..." : "Start Crawl"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 12. Images Tab */}
        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Image SEO Analysis</CardTitle>
              <CardDescription>
                Analyze images for alt text, size, and format optimization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="images-url">Page URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="images-url"
                    placeholder="https://desmoinesinsider.com"
                  />
                  <Button
                    onClick={() => {
                      const url = (document.getElementById("images-url") as HTMLInputElement).value;
                      if (url) analyzeImages(url);
                    }}
                    disabled={loading}
                  >
                    {loading ? "Analyzing..." : "Analyze Images"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 13. Content Tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Analysis</CardTitle>
              <CardDescription>
                Analyze content quality, readability, and keyword optimization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content-url">Page URL</Label>
                <Input
                  id="content-url"
                  placeholder="https://desmoinesinsider.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-keyword">Target Keyword (Optional)</Label>
                <Input
                  id="target-keyword"
                  placeholder="des moines events"
                />
              </div>
              <Button
                onClick={() => {
                  const url = (document.getElementById("content-url") as HTMLInputElement).value;
                  const keyword = (document.getElementById("target-keyword") as HTMLInputElement).value;
                  if (url) analyzeContent(url, keyword || undefined);
                }}
                disabled={loading}
              >
                {loading ? "Analyzing..." : "Analyze Content"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Remaining tabs with placeholders */}
        {[
          "links",
          "broken",
          "structure",
          "redirects",
          "duplicate",
          "security",
          "mobile",
          "budget",
          "backlinks",
        ].map((value) => (
          <TabsContent key={value} value={value} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{value.charAt(0).toUpperCase() + value.slice(1)}</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertDescription>
                    This feature is available. Database tables and edge functions are ready.
                    Frontend implementation coming soon.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
