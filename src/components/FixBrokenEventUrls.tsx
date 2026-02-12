import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { createLogger } from '@/lib/logger';

const log = createLogger('FixBrokenEventUrls');

export default function FixBrokenEventUrls() {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleFixUrls = async () => {
    setIsFixing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fix-broken-event-urls', {
        method: 'POST'
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: "URL Fix Complete",
        description: `Fixed ${data.fixed} out of ${data.processed} events`,
      });
    } catch (error: any) {
      log.error('Error fixing URLs', { action: 'handleFixUrls', metadata: { error } });
      toast({
        title: "Error",
        description: error.message || "Failed to fix URLs",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Fix Broken Event URLs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This will search Google to find correct URLs for events that were incorrectly updated with social media or backend URLs.
        </p>
        
        <Button 
          onClick={handleFixUrls} 
          disabled={isFixing}
          className="w-full"
        >
          {isFixing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fixing URLs...
            </>
          ) : (
            'Fix Broken URLs'
          )}
        </Button>

        {result && (
          <div className="space-y-2">
            <div className="text-sm">
              <strong>Results:</strong>
              <ul className="mt-2 space-y-1">
                <li>Processed: {result.processed} events</li>
                <li>Fixed: {result.fixed} events</li>
                <li>Errors: {result.errors?.length || 0} events</li>
              </ul>
            </div>
            
            {result.updates?.length > 0 && (
              <div className="text-xs">
                <strong>Updated Events:</strong>
                <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {result.updates.map((update: any, index: number) => (
                    <li key={index} className="p-2 bg-muted rounded">
                      <div className="font-medium">{update.title}</div>
                      <div className="text-muted-foreground truncate">
                        {update.newUrl}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {result.errors?.length > 0 && (
              <div className="text-xs">
                <strong>Errors:</strong>
                <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((error: any, index: number) => (
                    <li key={index} className="p-2 bg-destructive/10 rounded text-destructive">
                      Event {error.eventId}: {error.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}