import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CalendarDays, 
  Loader2, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Sparkles,
  ExternalLink,
  Calendar
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { createLogger } from '@/lib/logger';

const log = createLogger('WeekendGuideManager');

interface WeekendGuide {
  id: string;
  week_start: string;
  content: string;
  events_count: number;
  events_featured?: any[];
  created_at: string;
  updated_at: string;
}

export default function WeekendGuideManager() {
  const [guides, setGuides] = useState<WeekendGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchGuides = async () => {
    try {
      setLoading(true);
      
      // Mock data since weekend_guides table doesn't exist yet
      const mockData = [
        {
          id: '1',
          week_start: new Date().toISOString().split('T')[0],
          content: 'Weekend events content',
          events_count: 5,
          events_featured: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ] as WeekendGuide[];
      
      const transformedData = mockData;

      setGuides(transformedData);
    } catch (error) {
      log.error('Error fetching weekend guides', { action: 'fetchGuides', metadata: { error } });
      toast.error('Failed to load weekend guides');
    } finally {
      setLoading(false);
    }
  };

  const generateGuide = async () => {
    try {
      setGenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-weekend-guide', {
        body: { trigger: 'manual' }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast.success('Weekend guide generated successfully!');
        await fetchGuides(); // Refresh the list
      } else {
        throw new Error(data.error || 'Failed to generate guide');
      }
    } catch (error) {
      log.error('Error generating guide', { action: 'generateGuide', metadata: { error } });
      toast.error(error instanceof Error ? error.message : 'Failed to generate guide');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchGuides();
  }, []);

  const formatWeekDate = (weekStart: string) => {
    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 2); // Friday to Sunday
    
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
  };

  const getStatusColor = (weekStart: string) => {
    const today = new Date();
    const weekDate = new Date(weekStart);
    const daysDiff = Math.floor((weekDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < -7) return "bg-gray-100 text-gray-600"; // Past
    if (daysDiff < 0) return "bg-orange-100 text-orange-600"; // This week
    if (daysDiff < 7) return "bg-green-100 text-green-600"; // Next week
    return "bg-blue-100 text-blue-600"; // Future
  };

  const getStatusText = (weekStart: string) => {
    const today = new Date();
    const weekDate = new Date(weekStart);
    const daysDiff = Math.floor((weekDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < -7) return "Past";
    if (daysDiff < 0) return "Current Week";
    if (daysDiff < 7) return "Next Week";
    return "Future";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <CalendarDays className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Weekend Guide Manager</h1>
            <p className="text-gray-600">Manage AI-generated weekend guides</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
              <span className="text-lg">Loading weekend guides...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <CalendarDays className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Weekend Guide Manager</h1>
            <p className="text-gray-600">Manage AI-generated weekend guides</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            onClick={generateGuide}
            disabled={generating}
            className="bg-primary hover:bg-blue-700 text-white"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate Guide
          </Button>
          
          <Button
            onClick={fetchGuides}
            variant="outline"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          Weekend guides are automatically generated every Sunday at 9 PM CDT using Claude AI. 
          They analyze upcoming events and create engaging content for the next weekend (Friday-Sunday).
        </AlertDescription>
      </Alert>

      {/* Guides List */}
      <div className="space-y-4">
        {guides.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No weekend guides found</p>
              <Button onClick={generateGuide} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate First Guide
              </Button>
            </CardContent>
          </Card>
        ) : (
          guides.map((guide) => (
            <Card key={guide.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle className="text-lg">
                        Weekend of {formatWeekDate(guide.week_start)}
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        Generated on {format(new Date(guide.created_at), 'MMM d, yyyy')} • 
                        {guide.events_count} events featured
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(guide.week_start)}>
                      {getStatusText(guide.week_start)}
                    </Badge>
                    
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                    >
                      <a
                        href="/weekend"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Live
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">
                    <strong>Content Length:</strong> {guide.content.length.toLocaleString()} characters
                  </div>
                  
                  {guide.events_featured && guide.events_featured.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <strong>Featured Events:</strong>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {guide.events_featured.slice(0, 3).map((event, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {event.title}
                          </Badge>
                        ))}
                        {guide.events_featured.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{guide.events_featured.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="text-sm text-gray-500">
                    <strong>Last Updated:</strong> {format(new Date(guide.updated_at), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}