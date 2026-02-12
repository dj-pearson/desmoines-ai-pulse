import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, TrendingUp, Target, Lightbulb, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('CompetitorAnalysisDashboard');

interface Competitor {
  id: string;
  name: string;
  website_url: string;
  description: string;
  primary_focus: string;
  is_active: boolean;
}

interface CompetitorContent {
  id: string;
  title: string;
  content_type: string;
  category: string;
  content_score: number;
  url: string;
  scraped_at: string;
  competitors: { name: string };
}

interface ContentSuggestion {
  id: string;
  suggested_title: string;
  suggested_description: string;
  priority_score: number;
  suggestion_type: string;
  improvement_areas: string[];
  status: string;
  created_at: string;
}

interface CompetitorReport {
  id: string;
  competitor_id: string;
  total_content_pieces: number;
  average_content_score: number;
  top_performing_categories: string[];
  competitive_advantages: any;
  recommendations: any;
  report_date: string;
  competitors: { name: string };
}

export function CompetitorAnalysisDashboard() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [content, setContent] = useState<CompetitorContent[]>([]);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);
  const [reports, setReports] = useState<CompetitorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [competitorsRes, contentRes, suggestionsRes, reportsRes] = await Promise.all([
        supabase.from('competitors').select('*').eq('is_active', true),
        supabase.from('competitor_content').select('*, competitors(name)').order('scraped_at', { ascending: false }).limit(20),
        supabase.from('content_suggestions').select('*').order('priority_score', { ascending: false }).limit(10),
        supabase.from('competitor_reports').select('*, competitors(name)').order('report_date', { ascending: false }).limit(5)
      ]);

      setCompetitors(competitorsRes.data || []);
      setContent(contentRes.data || []);
      setSuggestions(suggestionsRes.data || []);
      setReports(reportsRes.data || []);
    } catch (error) {
      log.error('Error loading data', { action: 'loadData', metadata: { error } });
      toast({
        title: "Error",
        description: "Failed to load competitor analysis data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async (type: 'scrape' | 'analyze' | 'suggest', competitorId?: string) => {
    setAnalyzing(true);
    try {
      const response = await supabase.functions.invoke('analyze-competitor', {
        body: { competitorId, analysisType: type }
      });

      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} completed successfully`,
      });

      // Reload data to show updates
      await loadData();
    } catch (error) {
      log.error(`Error running ${type}`, { action: 'runAnalysis', metadata: { error, type } });
      toast({
        title: "Error",
        description: `Failed to run ${type} analysis`,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const getSuggestionTypeColor = (type: string) => {
    switch (type) {
      case 'improve': return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'counter': return 'bg-red-500/10 text-red-700 dark:text-red-300';
      case 'gap_fill': return 'bg-green-500/10 text-green-700 dark:text-green-300';
      default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading competitor analysis...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Competitor Analysis</h1>
          <p className="text-muted-foreground">
            Track and analyze competitor content to stay ahead of the competition
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => runAnalysis('scrape')}
            disabled={analyzing}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${analyzing ? 'animate-spin' : ''}`} />
            Scrape Content
          </Button>
          <Button
            onClick={() => runAnalysis('analyze')}
            disabled={analyzing}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Competitor Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        {competitors.map((competitor) => (
          <Card key={competitor.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                {competitor.name}
                <Badge variant="outline">{competitor.primary_focus}</Badge>
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                <a 
                  href={competitor.website_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Visit Website
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {competitor.description}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAnalysis('scrape', competitor.id)}
                  disabled={analyzing}
                >
                  Scrape
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runAnalysis('suggest', competitor.id)}
                  disabled={analyzing}
                >
                  Suggest
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">Recent Content</TabsTrigger>
          <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
          <TabsTrigger value="reports">Analysis Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Latest Competitor Content
              </CardTitle>
              <CardDescription>
                Recently scraped content from competitor websites
              </CardDescription>
            </CardHeader>
            <CardContent>
              {content.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No competitor content found. Click "Scrape Content" to analyze competitor websites.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {content.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold">{item.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {item.competitors?.name} • {item.category}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.content_type}</Badge>
                          <div className="text-right">
                            <div className="text-sm font-semibold">Score: {item.content_score}/100</div>
                            <Progress value={item.content_score} className="w-20 h-2 mt-1" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Scraped: {new Date(item.scraped_at).toLocaleDateString()}</span>
                        {item.url && (
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                AI Content Suggestions
              </CardTitle>
              <CardDescription>
                AI-generated recommendations to outperform competitors
              </CardDescription>
            </CardHeader>
            <CardContent>
              {suggestions.length === 0 ? (
                <div className="text-center py-8">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No suggestions available. Run "AI Analysis" to generate content recommendations.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    className="mt-4"
                    onClick={() => runAnalysis('suggest')}
                    disabled={analyzing}
                  >
                    Generate Suggestions
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{suggestion.suggested_title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            {suggestion.suggested_description}
                          </p>
                          <div className="flex gap-2 mb-2">
                            <Badge className={getSuggestionTypeColor(suggestion.suggestion_type)}>
                              {suggestion.suggestion_type.replace('_', ' ')}
                            </Badge>
                            <Badge variant="outline">
                              Priority: {suggestion.priority_score}/100
                            </Badge>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {suggestion.improvement_areas.map((area, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {area.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <Progress value={suggestion.priority_score} className="w-20 h-2 mb-2" />
                          <Badge variant={suggestion.status === 'pending' ? 'outline' : 'default'}>
                            {suggestion.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Created: {new Date(suggestion.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Analysis Reports
              </CardTitle>
              <CardDescription>
                Comprehensive competitor analysis insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No analysis reports found. Run competitor analysis to generate insights.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-6">
                  {reports.map((report) => (
                    <div key={report.id} className="border rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-lg">{report.competitors?.name}</h4>
                        <Badge variant="outline">
                          {new Date(report.report_date).toLocaleDateString()}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold">{report.total_content_pieces}</div>
                          <div className="text-sm text-muted-foreground">Content Pieces</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">{report.average_content_score}/100</div>
                          <div className="text-sm text-muted-foreground">Avg Score</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">{report.top_performing_categories?.length || 0}</div>
                          <div className="text-sm text-muted-foreground">Categories</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">
                            {report.competitive_advantages?.recommendations?.length || 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Recommendations</div>
                        </div>
                      </div>

                      {report.top_performing_categories && report.top_performing_categories.length > 0 && (
                        <div className="mb-4">
                          <h5 className="font-medium mb-2">Top Categories</h5>
                          <div className="flex gap-2 flex-wrap">
                            {report.top_performing_categories.map((category, index) => (
                              <Badge key={index} variant="secondary">{category}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {report.competitive_advantages?.summary && (
                        <div>
                          <h5 className="font-medium mb-2">Analysis Summary</h5>
                          <p className="text-sm text-muted-foreground">
                            {report.competitive_advantages.summary}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}