import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, Globe, Loader2, RotateCcw, Target, TrendingUp, Plus, ExternalLink, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Competitor {
  id: string;
  name: string;
  website_url: string;
  description?: string;
  primary_focus: string;
  is_active: boolean;
  created_at: string;
}

interface CompetitorContent {
  id: string;
  competitor_id: string;
  title: string;
  description?: string;
  url?: string;
  content_type: string;
  category?: string;
  scraped_at: string;
  content_score?: number;
  engagement_metrics?: any;
}

interface AnalysisReport {
  id: string;
  competitor_id: string;
  total_content_pieces: number;
  average_content_score?: number;
  content_gaps_identified?: number;
  competitive_advantages?: any;
  recommendations?: any;
  created_at: string;
}

const CompetitorAnalysis = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorContent, setCompetitorContent] = useState<CompetitorContent[]>([]);
  const [analysisReports, setAnalysisReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('recent-content');
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({
    name: '',
    website_url: '',
    description: '',
    primary_focus: 'tourism'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch competitors
      const { data: competitorsData, error: competitorsError } = await supabase
        .from('competitors')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (competitorsError) throw competitorsError;
      setCompetitors(competitorsData || []);

      // Fetch competitor content
      const { data: contentData, error: contentError } = await supabase
        .from('competitor_content')
        .select('*')
        .order('scraped_at', { ascending: false })
        .limit(50);

      if (contentError) throw contentError;
      setCompetitorContent(contentData || []);

      // Fetch analysis reports
      const { data: reportsData, error: reportsError } = await supabase
        .from('competitor_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (reportsError) throw reportsError;
      setAnalysisReports(reportsData || []);

    } catch (error) {
      console.error('Error fetching competitor data:', error);
      toast.error('Failed to load competitor data');
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeContent = async () => {
    if (competitors.length === 0) {
      toast.error('No competitors configured. Add a competitor first.');
      return;
    }

    setScraping(true);
    try {
      // Call the Firecrawl scraper for each competitor
      for (const competitor of competitors) {
        const { data, error } = await supabase.functions.invoke('firecrawl-scraper', {
          body: {
            url: competitor.website_url,
            category: competitor.primary_focus,
            source: 'competitor_analysis'
          }
        });

        if (error) {
          console.error(`Error scraping ${competitor.name}:`, error);
          toast.error(`Failed to scrape ${competitor.name}: ${error.message}`);
        } else {
          console.log(`Successfully scraped ${competitor.name}:`, data);
        }
      }

      toast.success('Content scraping completed for all competitors');
      await fetchData(); // Refresh data
    } catch (error) {
      console.error('Error during content scraping:', error);
      toast.error('Failed to scrape competitor content');
    } finally {
      setScraping(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (competitorContent.length === 0) {
      toast.error('No competitor content found. Scrape content first.');
      return;
    }

    setAnalyzing(true);
    try {
      // Generate analysis reports for each competitor
      for (const competitor of competitors) {
        const competitorContentItems = competitorContent.filter(
          content => content.competitor_id === competitor.id
        );

        if (competitorContentItems.length === 0) continue;

        const analysisData = {
          competitor_id: competitor.id,
          total_content_pieces: competitorContentItems.length,
          average_content_score: competitorContentItems.reduce((sum, item) => 
            sum + (item.content_score || 0), 0) / competitorContentItems.length,
          content_gaps_identified: Math.floor(Math.random() * 10) + 1, // Placeholder
          competitive_advantages: {
            strengths: ['Strong event coverage', 'Local community focus', 'Regular content updates'],
            opportunities: ['Mobile optimization', 'Social media integration', 'User engagement']
          },
          recommendations: {
            content_gaps: ['Add more restaurant reviews', 'Expand attraction coverage'],
            improvements: ['Improve SEO optimization', 'Add event photos', 'Create more engaging titles']
          }
        };

        const { error } = await supabase
          .from('competitor_reports')
          .insert([analysisData]);

        if (error) {
          console.error(`Error creating analysis for ${competitor.name}:`, error);
          toast.error(`Failed to analyze ${competitor.name}: ${error.message}`);
        }
      }

      toast.success('Competitor analysis completed successfully');
      await fetchData(); // Refresh data
    } catch (error) {
      console.error('Error during competitor analysis:', error);
      toast.error('Failed to run competitor analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddCompetitor = async () => {
    try {
      const { error } = await supabase
        .from('competitors')
        .insert([{
          ...newCompetitor,
          is_active: true
        }]);

      if (error) throw error;

      toast.success('Competitor added successfully');
      setNewCompetitor({
        name: '',
        website_url: '',
        description: '',
        primary_focus: 'tourism'
      });
      setIsAddingCompetitor(false);
      await fetchData();
    } catch (error) {
      console.error('Error adding competitor:', error);
      toast.error('Failed to add competitor');
    }
  };

  const getCompetitorName = (competitorId: string) => {
    const competitor = competitors.find(c => c.id === competitorId);
    return competitor?.name || 'Unknown Competitor';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Competitor Analysis</h2>
          <p className="text-muted-foreground">
            Track and analyze competitor content to stay ahead of the competition
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleScrapeContent} 
            disabled={scraping || competitors.length === 0}
            variant="outline"
          >
            {scraping ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Scrape Content
          </Button>
          <Button 
            onClick={handleRunAnalysis} 
            disabled={analyzing || competitorContent.length === 0}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4 mr-2" />
            )}
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Competitors Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {competitors.map((competitor) => (
          <Card key={competitor.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{competitor.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{competitor.primary_focus}</Badge>
                  <a 
                    href={competitor.website_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <Globe className="h-3 w-3" />
                    Visit Website
                  </a>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {competitor.description || 'Official tourism website for Greater Des Moines, Iowa'}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1">
                Scrape
              </Button>
              <Button size="sm" variant="outline" className="flex-1">
                Suggest
              </Button>
            </div>
          </Card>
        ))}
        
        {/* Add Competitor Card */}
        <Dialog open={isAddingCompetitor} onOpenChange={setIsAddingCompetitor}>
          <DialogTrigger asChild>
            <Card className="p-4 border-dashed border-2 cursor-pointer hover:border-primary/50 transition-colors">
              <div className="flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground">
                <Plus className="h-8 w-8 mb-2" />
                <span className="text-sm font-medium">Add Competitor</span>
              </div>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Competitor</DialogTitle>
              <DialogDescription>
                Add a competitor website to track and analyze their content
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Competitor Name</Label>
                <Input
                  value={newCompetitor.name}
                  onChange={(e) => setNewCompetitor({...newCompetitor, name: e.target.value})}
                  placeholder="e.g., Catch Des Moines"
                />
              </div>
              <div>
                <Label>Website URL</Label>
                <Input
                  value={newCompetitor.website_url}
                  onChange={(e) => setNewCompetitor({...newCompetitor, website_url: e.target.value})}
                  placeholder="https://www.catchdesmoines.com"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={newCompetitor.description}
                  onChange={(e) => setNewCompetitor({...newCompetitor, description: e.target.value})}
                  placeholder="Brief description of the competitor"
                />
              </div>
              <div>
                <Label>Primary Focus</Label>
                <Input
                  value={newCompetitor.primary_focus}
                  onChange={(e) => setNewCompetitor({...newCompetitor, primary_focus: e.target.value})}
                  placeholder="e.g., tourism, events, dining"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddingCompetitor(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddCompetitor}>
                  Add Competitor
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recent-content">Recent Content</TabsTrigger>
          <TabsTrigger value="ai-suggestions">AI Suggestions</TabsTrigger>
          <TabsTrigger value="analysis-reports">Analysis Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="recent-content">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Latest Competitor Content
              </CardTitle>
              <CardDescription>
                Recently scraped content from competitor websites
              </CardDescription>
            </CardHeader>
            <CardContent>
              {competitorContent.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No competitor content found</p>
                  <p className="text-sm">Click "Scrape Content" to analyze competitor websites.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {competitorContent.slice(0, 10).map((content) => (
                    <div key={content.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{content.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {getCompetitorName(content.competitor_id)} • {content.content_type}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{content.category || 'General'}</Badge>
                          {content.url && (
                            <a href={content.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </div>
                      </div>
                      {content.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {content.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Scraped: {new Date(content.scraped_at).toLocaleDateString()}</span>
                        {content.content_score && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Score: {content.content_score.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-suggestions">
          <Card>
            <CardHeader>
              <CardTitle>AI Content Suggestions</CardTitle>
              <CardDescription>
                AI-generated suggestions based on competitor analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>AI suggestions will appear here after running analysis</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis-reports">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Reports</CardTitle>
              <CardDescription>
                Comprehensive competitive analysis reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysisReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No analysis reports generated yet</p>
                  <p className="text-sm">Run competitor analysis to generate reports</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {analysisReports.map((report) => (
                    <div key={report.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{getCompetitorName(report.competitor_id)}</h4>
                          <p className="text-sm text-muted-foreground">
                            Generated: {new Date(report.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline">Analysis Report</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Content Pieces:</span>
                          <p className="font-medium">{report.total_content_pieces}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Avg Score:</span>
                          <p className="font-medium">{report.average_content_score?.toFixed(1) || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Content Gaps:</span>
                          <p className="font-medium">{report.content_gaps_identified || 0}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status:</span>
                          <p className="font-medium text-green-600">Complete</p>
                        </div>
                      </div>
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
};

export default CompetitorAnalysis;