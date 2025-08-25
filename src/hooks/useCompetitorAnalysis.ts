import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export interface Competitor {
  id: string;
  name: string;
  website_url: string;
  description: string;
  primary_focus: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompetitorContent {
  id: string;
  competitor_id: string;
  content_type: string;
  title: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  publish_date: string;
  content_score: number;
  engagement_metrics: any;
  scraped_at: string;
  updated_at: string;
}

export interface ContentSuggestion {
  id: string;
  competitor_content_id: string;
  suggestion_type: string;
  suggested_title: string;
  suggested_description: string;
  suggested_tags: string[];
  improvement_areas: string[];
  priority_score: number;
  status: string;
  ai_analysis: any;
  created_at: string;
  updated_at: string;
}

export interface CompetitorReport {
  id: string;
  competitor_id: string;
  report_date: string;
  total_content_pieces: number;
  average_content_score: number;
  top_performing_categories: string[];
  content_gaps_identified: number;
  suggestions_generated: number;
  competitive_advantages: any;
  recommendations: any;
  created_at: string;
}

export function useCompetitorAnalysis() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [content, setContent] = useState<CompetitorContent[]>([]);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);
  const [reports, setReports] = useState<CompetitorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load all competitor data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [competitorsRes, contentRes, suggestionsRes, reportsRes] = await Promise.all([
        supabase
          .from('competitors')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false }),
        
        supabase
          .from('competitor_content')
          .select('*')
          .order('scraped_at', { ascending: false })
          .limit(50),
        
        supabase
          .from('content_suggestions')
          .select('*')
          .order('priority_score', { ascending: false })
          .limit(25),
        
        supabase
          .from('competitor_reports')
          .select('*')
          .order('report_date', { ascending: false })
          .limit(10)
      ]);

      if (competitorsRes.error) throw competitorsRes.error;
      if (contentRes.error) throw contentRes.error;
      if (suggestionsRes.error) throw suggestionsRes.error;
      if (reportsRes.error) throw reportsRes.error;

      setCompetitors(competitorsRes.data || []);
      setContent(contentRes.data || []);
      setSuggestions(suggestionsRes.data || []);
      setReports(reportsRes.data || []);

    } catch (err: any) {
      console.error('Error loading competitor data:', err);
      setError(err.message);
      toast({
        title: "Error",
        description: "Failed to load competitor analysis data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Run competitor analysis
  const runAnalysis = async (
    type: 'scrape' | 'analyze' | 'suggest',
    competitorId?: string
  ) => {
    try {
      const response = await supabase.functions.invoke('analyze-competitor', {
        body: {
          competitorId,
          analysisType: type,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} analysis completed successfully`,
      });

      // Reload data to show updates
      await loadData();

      return response.data;
    } catch (err: any) {
      console.error(`Error running ${type} analysis:`, err);
      toast({
        title: "Error",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} analysis failed: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  // Add a new competitor
  const addCompetitor = async (competitorData: { name: string; website_url: string; description?: string; primary_focus?: string }) => {
    try {
      const { data, error } = await supabase
        .from('competitors')
        .insert([competitorData])
        .select()
        .single();

      if (error) throw error;

      setCompetitors(prev => [data, ...prev]);
      
      toast({
        title: "Success",
        description: "Competitor added successfully",
      });

      return data;
    } catch (err: any) {
      console.error('Error adding competitor:', err);
      toast({
        title: "Error",
        description: `Failed to add competitor: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  // Update competitor
  const updateCompetitor = async (id: string, updates: Partial<Competitor>) => {
    try {
      const { data, error } = await supabase
        .from('competitors')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setCompetitors(prev => 
        prev.map(comp => comp.id === id ? data : comp)
      );

      toast({
        title: "Success",
        description: "Competitor updated successfully",
      });

      return data;
    } catch (err: any) {
      console.error('Error updating competitor:', err);
      toast({
        title: "Error",
        description: `Failed to update competitor: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  // Update suggestion status
  const updateSuggestionStatus = async (id: string, status: string) => {
    try {
      const { data, error } = await supabase
        .from('content_suggestions')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setSuggestions(prev =>
        prev.map(suggestion => 
          suggestion.id === id ? data : suggestion
        )
      );

      toast({
        title: "Success",
        description: `Suggestion marked as ${status}`,
      });

      return data;
    } catch (err: any) {
      console.error('Error updating suggestion status:', err);
      toast({
        title: "Error",
        description: `Failed to update suggestion: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  // Get competitor insights
  const getCompetitorInsights = () => {
    const totalCompetitors = competitors.length;
    const totalContent = content.length;
    const pendingSuggestions = suggestions.filter(s => s.status === 'pending').length;
    const highPrioritySuggestions = suggestions.filter(s => s.priority_score >= 80).length;
    
    const averageContentScore = content.length > 0 
      ? content.reduce((sum, item) => sum + item.content_score, 0) / content.length 
      : 0;

    const topCategories = content.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedCategories = Object.entries(topCategories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    return {
      totalCompetitors,
      totalContent,
      pendingSuggestions,
      highPrioritySuggestions,
      averageContentScore: Math.round(averageContentScore),
      topCategories: sortedCategories.map(([category, count]) => ({ category, count })),
      recentActivity: {
        lastScrapeDate: content[0]?.scraped_at || null,
        lastReportDate: reports[0]?.report_date || null,
      }
    };
  };

  useEffect(() => {
    loadData();
  }, []);

  return {
    // Data
    competitors,
    content,
    suggestions,
    reports,
    loading,
    error,
    
    // Actions
    loadData,
    runAnalysis,
    addCompetitor,
    updateCompetitor,
    updateSuggestionStatus,
    
    // Insights
    insights: getCompetitorInsights(),
  };
}