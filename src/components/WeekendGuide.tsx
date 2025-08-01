import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarDays, MapPin, Loader2, RefreshCw, Calendar, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface WeekendGuide {
  id: string;
  week_start: string;
  content: string;
  events_count: number;
  events_featured?: any[];
  created_at: string;
  updated_at: string;
}

export default function WeekendGuide() {
  const [guide, setGuide] = useState<WeekendGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'root_admin'])
        .single();
      
      setIsAdmin(!!data);
    };
    
    checkAdminStatus();
  }, [user]);

  const fetchWeekendGuide = async () => {
    try {
      setLoading(true);
      
      // Get the most recent weekend guide
      const { data, error } = await supabase
        .from('weekend_guides')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching weekend guide:', error);
        throw error;
      }

      if (data) {
        setGuide({
          ...data,
          events_featured: Array.isArray(data.events_featured) ? data.events_featured : []
        } as WeekendGuide);
      } else {
        setGuide(null);
      }
    } catch (error) {
      console.error('Error fetching weekend guide:', error);
      toast.error('Failed to load weekend guide');
    } finally {
      setLoading(false);
    }
  };

  const regenerateGuide = async () => {
    if (!isAdmin) return;
    
    try {
      setRegenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-weekend-guide', {
        body: { trigger: 'manual' }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success('Weekend guide regenerated successfully!');
        await fetchWeekendGuide(); // Refresh the guide
      } else {
        throw new Error(data.error || 'Failed to regenerate guide');
      }
    } catch (error) {
      console.error('Error regenerating guide:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate guide');
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    fetchWeekendGuide();
  }, []);

  const formatWeekDate = (weekStart: string) => {
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 2); // Friday to Sunday
    
    const options: Intl.DateTimeFormatOptions = { 
      month: 'long', 
      day: 'numeric' 
    };
    
    return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
  };

  const formatContent = (content: string) => {
    // Split content into paragraphs and apply basic formatting
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    
    return paragraphs.map((paragraph, index) => {
      const trimmed = paragraph.trim();
      
      // Check if it's a day header (Friday, Saturday, Sunday)
      if (trimmed.match(/^(Friday|Saturday|Sunday)/i)) {
        return (
          <h3 key={index} className="text-xl font-semibold text-primary mt-6 mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {trimmed}
          </h3>
        );
      }
      
      // Check if it's a subheader or event title
      if (trimmed.length < 100 && trimmed.includes(':')) {
        return (
          <h4 key={index} className="text-lg font-medium text-gray-800 mt-4 mb-2">
            {trimmed}
          </h4>
        );
      }
      
      // Regular paragraph
      return (
        <p key={index} className="text-gray-700 mb-3 leading-relaxed">
          {trimmed}
        </p>
      );
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
              <span className="text-lg">Loading weekend guide...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          This Weekend in Des Moines
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Your AI-curated guide to the best events, activities, and experiences happening this weekend
        </p>
      </div>

      {guide ? (
        <div className="max-w-4xl mx-auto">
          {/* Guide Info Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-6 w-6 text-primary" />
                  <div>
                    <CardTitle className="text-2xl">
                      Weekend of {formatWeekDate(guide.week_start)}
                    </CardTitle>
                    <p className="text-gray-600 mt-1">
                      AI-generated guide featuring {guide.events_count} local events
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI Generated
                  </Badge>
                  {isAdmin && (
                    <Button
                      onClick={regenerateGuide}
                      disabled={regenerating}
                      variant="outline"
                      size="sm"
                    >
                      {regenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Regenerate
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Main Content */}
          <Card>
            <CardContent className="p-8">
              <div className="prose prose-lg max-w-none">
                {formatContent(guide.content)}
              </div>
              
              {/* Generated Info */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generated by AI on {new Date(guide.created_at).toLocaleDateString()} 
                  • Updated {new Date(guide.updated_at).toLocaleDateString()}
                  • Based on {guide.events_count} local events
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <Alert>
            <CalendarDays className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <p className="font-medium">No weekend guide available yet</p>
                <p>
                  Our AI-powered weekend guide is automatically generated every Sunday evening 
                  for the upcoming weekend. Check back soon for personalized recommendations!
                </p>
                {isAdmin && (
                  <Button
                    onClick={regenerateGuide}
                    disabled={regenerating}
                    className="mt-3"
                  >
                    {regenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate Guide Now
                  </Button>
                  )}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}