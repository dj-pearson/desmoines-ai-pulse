import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, MapPin, RefreshCw, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('CoordinateManager');

interface BackfillResult {
  status: string;
  results: Record<string, { updated: number; skipped: number; errors: number }>;
  totalUpdated: number;
  message: string;
}

const CoordinateManager = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BackfillResult | null>(null);
  const [progress, setProgress] = useState(0);

  const runCoordinateBackfill = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults(null);

    try {
      toast.info("Starting coordinate backfill...");

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 1000);

      const { data, error } = await supabase.functions.invoke('backfill-all-coordinates');

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        throw error;
      }

      setResults(data);
      toast.success(`Successfully updated coordinates for ${data.totalUpdated} records!`);
    } catch (error) {
      log.error('backfill', 'Coordinate backfill error', { data: error });
      toast.error('Failed to update coordinates. Please try again.');
    } finally {
      setIsRunning(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const testGeocodingFunction = async () => {
    try {
      toast.info("Testing geocoding function...");
      
      const { data, error } = await supabase.functions.invoke('geocode-location', {
        body: { location: "Des Moines, IA" }
      });

      if (error) {
        throw error;
      }

      if (data.latitude && data.longitude) {
        toast.success(`Geocoding works! Des Moines coordinates: ${data.latitude}, ${data.longitude}`);
      } else {
        toast.error("Geocoding failed - no coordinates returned");
      }
    } catch (error) {
      log.error('geocodeTest', 'Geocoding test error', { data: error });
      toast.error('Geocoding test failed');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Coordinate Management
          </CardTitle>
          <CardDescription>
            Manage latitude and longitude coordinates for all content types
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This will populate latitude and longitude coordinates for all events, restaurants, 
              attractions, and playgrounds that currently have null coordinates. The process uses 
              the OpenStreetMap geocoding service to convert location strings into coordinates.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={testGeocodingFunction}
              variant="outline"
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              <MapPin className="h-4 w-4" />
              Test Geocoding Function
            </Button>

            <Button
              onClick={runCoordinateBackfill}
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {isRunning ? "Running Backfill..." : "Run Coordinate Backfill"}
            </Button>
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing coordinates...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {results && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Backfill Results</CardTitle>
                <CardDescription>{results.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(results.results).map(([table, stats]) => (
                    <div key={table} className="space-y-2">
                      <h4 className="font-medium capitalize">{table}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Updated:</span>
                          <Badge variant="secondary">{stats.updated}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Skipped:</span>
                          <Badge variant="outline">{stats.skipped}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Errors:</span>
                          <Badge variant={stats.errors > 0 ? "destructive" : "secondary"}>
                            {stats.errors}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Records Updated:</span>
                    <Badge variant="default" className="text-lg">
                      {results.totalUpdated}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoordinateManager;