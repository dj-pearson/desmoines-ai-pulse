import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminCleanupControls');

interface CleanupResult {
  success: boolean;
  retentionMonths: number;
  result?: any;
  message: string;
  dryRun?: boolean;
  eventsToDelete?: number;
  cutoffDate?: string;
}

export default function AdminCleanupControls() {
  const [isLoading, setIsLoading] = useState(false);
  const [retentionMonths, setRetentionMonths] = useState(6);
  const [isDryRun, setIsDryRun] = useState(true);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const { toast } = useToast();

  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-old-events', {
        body: {
          retentionMonths,
          dryRun: isDryRun
        }
      });

      if (error) throw error;

      setLastResult(data);
      
      toast({
        title: isDryRun ? "Dry Run Complete" : "Cleanup Complete",
        description: data.message,
        variant: data.success ? "default" : "destructive"
      });

    } catch (error) {
      log.error('Error running cleanup', { action: 'handleCleanup', metadata: { error } });
      toast({
        title: "Error",
        description: error.message || "Failed to run cleanup",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Event Cleanup Management
        </CardTitle>
        <CardDescription>
          Manage old events to keep the database optimized. Events are automatically purged monthly, 
          but you can trigger manual cleanups here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Automatic Schedule:</strong> Events older than 6 months are automatically purged 
            on the 1st of each month at 2 AM. This helps maintain database performance.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="retention">Retention Period (Months)</Label>
            <Input
              id="retention"
              type="number"
              min="1"
              max="24"
              value={retentionMonths}
              onChange={(e) => setRetentionMonths(parseInt(e.target.value) || 6)}
            />
            <p className="text-sm text-muted-foreground">
              Events older than this will be removed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dryrun" className="flex items-center gap-2">
              <Switch
                id="dryrun"
                checked={isDryRun}
                onCheckedChange={setIsDryRun}
              />
              Dry Run Mode
            </Label>
            <p className="text-sm text-muted-foreground">
              {isDryRun ? "Preview changes without deleting" : "Actually delete old events"}
            </p>
          </div>
        </div>

        <Button 
          onClick={handleCleanup} 
          disabled={isLoading}
          variant={isDryRun ? "outline" : "destructive"}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Running {isDryRun ? "Preview" : "Cleanup"}...
            </>
          ) : (
            <>
              {isDryRun ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Preview Cleanup
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Run Cleanup
                </>
              )}
            </>
          )}
        </Button>

        {lastResult && (
          <Alert className={lastResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">{lastResult.message}</p>
                {lastResult.dryRun && lastResult.eventsToDelete !== undefined && (
                  <p className="text-sm">
                    Would delete <strong>{lastResult.eventsToDelete}</strong> events 
                    {lastResult.cutoffDate && (
                      <> older than {new Date(lastResult.cutoffDate).toLocaleDateString()}</>
                    )}
                  </p>
                )}
                {lastResult.result && !lastResult.dryRun && (
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify(lastResult.result, null, 2)}
                  </pre>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Best Practices:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• <strong>6 months</strong> is recommended for most use cases</li>
            <li>• Always run a dry run first to preview changes</li>
            <li>• Old event URLs automatically show a helpful 404 page</li>
            <li>• Related data (photos, comments, ratings) are also cleaned up</li>
            <li>• Manual cleanups are logged for audit purposes</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}