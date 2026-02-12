import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, AlertTriangle, CheckCircle2, XCircle, Loader2, Link, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('CatchDesmoinUrlExtractor');

interface ExtractionResult {
  success: boolean;
  processed: number;
  errors: Array<{ eventId: string; error: string }>;
  updated: Array<{ eventId: string; oldUrl: string; newUrl: string }>;
  message?: string;
}

export default function CatchDesmoinUrlExtractor() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [dryRunResult, setDryRunResult] = useState<ExtractionResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [batchSize, setBatchSize] = useState(20);
  const [remainingCount, setRemainingCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  const fetchRemainingCount = async () => {
    setIsLoadingCount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/extract-catchdesmoines-urls`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRemainingCount(data.remaining);
      }
    } catch (error) {
      log.error('Failed to fetch count', { action: 'fetchRemainingCount', metadata: { error } });
    } finally {
      setIsLoadingCount(false);
    }
  };

  useEffect(() => {
    fetchRemainingCount();
  }, []);

  const handleExtractUrls = async (dryRun: boolean = false) => {
    if (dryRun) {
      setIsDryRunning(true);
      setDryRunResult(null);
    } else {
      setIsExtracting(true);
      setResult(null);
    }
    setProgress(0);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Authentication required");
        return;
      }

      // Show progress animation
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90;
          return prev + 5;
        });
      }, 1000);

      const response = await fetch(`https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/extract-catchdesmoines-urls`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize, dryRun })
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: ExtractionResult = await response.json();
      
      if (dryRun) {
        setDryRunResult(data);
        if (data.success) {
          toast.success(`Dry Run Complete: Would process ${data.processed} events and update ${data.updated.length} URLs`);
        }
      } else {
        setResult(data);
        if (data.success) {
          toast.success(`Successfully processed ${data.processed} events! Updated ${data.updated.length} URLs.`);
          // Refresh count after successful extraction
          fetchRemainingCount();
        } else {
          toast.error("URL extraction completed with errors");
        }
      }

    } catch (error) {
      log.error('URL extraction error', { action: 'handleExtractUrls', metadata: { error } });
      toast.error(`Failed to extract URLs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const errorResult = {
        success: false,
        processed: 0,
        errors: [{ eventId: 'system', error: error instanceof Error ? error.message : 'Unknown error' }],
        updated: []
      };
      
      if (dryRun) {
        setDryRunResult(errorResult);
      } else {
        setResult(errorResult);
      }
    } finally {
      if (dryRun) {
        setIsDryRunning(false);
      } else {
        setIsExtracting(false);
      }
      if (progress < 100) setProgress(100);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          CatchDesMoines URL Extractor
        </CardTitle>
        <CardDescription>
          Extract real event URLs from CatchDesMoines event pages and update the database.
          This tool will scan events with catchdesmoines.com source URLs and replace them with the actual event organizer URLs.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Remaining Count Badge */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Link className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">Remaining CatchDesMoines URLs</div>
              <div className="text-sm text-muted-foreground">Events still using catchdesmoines.com source URLs</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoadingCount ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {remainingCount ?? '-'}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRemainingCount}
              disabled={isLoadingCount}
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingCount ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Batch Size Control */}
        <div className="space-y-2">
          <Label htmlFor="batchSize">Batch Size (events per run)</Label>
          <div className="flex items-center gap-3">
            <Input
              id="batchSize"
              type="number"
              min="1"
              max="50"
              value={batchSize}
              onChange={(e) => setBatchSize(Math.min(50, Math.max(1, parseInt(e.target.value) || 20)))}
              disabled={isExtracting}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              (Max: 50, Recommended: 10-20 for reliability)
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={() => handleExtractUrls(true)}
            disabled={isExtracting || isDryRunning || remainingCount === 0}
            variant="outline"
            className="flex-1"
          >
            {isDryRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Dry Run (Test)
              </>
            )}
          </Button>
          
          <Button 
            onClick={() => handleExtractUrls(false)}
            disabled={isExtracting || isDryRunning || remainingCount === 0}
            className="flex-1"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting URLs...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Extract URLs
              </>
            )}
          </Button>
        </div>
        
        {(isExtracting || isDryRunning) && (
          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isDryRunning ? 'Testing' : 'Processing'} {batchSize} events...
          </Badge>
        )}

        {/* Progress Bar */}
        {(isExtracting || isDryRunning) && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{isDryRunning ? 'Testing events...' : 'Processing events...'}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {/* Dry Run Results */}
        {dryRunResult && (
          <div className="space-y-4">
            {/* Dry Run Summary */}
            <Alert className="border-blue-200 bg-blue-50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <div className="space-y-1">
                    <div className="font-medium">
                      Dry Run Complete (No Database Changes Made)
                    </div>
                    <div className="text-sm">
                      Would process: {dryRunResult.processed} events • 
                      Would update: {dryRunResult.updated.length} URLs • 
                      Errors found: {dryRunResult.errors.length}
                    </div>
                  </div>
                </AlertDescription>
              </div>
            </Alert>

            {/* URLs That Would Be Updated */}
            {dryRunResult.updated.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-blue-700">URLs That Would Be Updated</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {dryRunResult.updated.map((update, index) => (
                      <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-xs text-blue-600 font-medium mb-1">
                          Event ID: {update.eventId}
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="text-gray-600">
                            <span className="font-medium">From:</span> 
                            <a 
                              href={update.oldUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-600 hover:underline break-all"
                            >
                              {update.oldUrl}
                            </a>
                          </div>
                          <div className="text-blue-700">
                            <span className="font-medium">To:</span> 
                            <a 
                              href={update.newUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="ml-1 text-green-600 hover:underline break-all font-medium"
                            >
                              {update.newUrl}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dry Run Errors */}
            {dryRunResult.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-red-700">Errors That Would Occur</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {dryRunResult.errors.map((error, index) => (
                      <div key={index} className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="text-xs text-red-600 font-medium mb-1">
                          Event ID: {error.eventId}
                        </div>
                        <div className="text-sm text-red-700">
                          {error.error}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Real Run Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <Alert className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {result.success ? "URL Extraction Complete!" : "URL Extraction Failed"}
                    </div>
                    <div className="text-sm">
                      Processed: {result.processed} events • 
                      Updated: {result.updated.length} • 
                      Errors: {result.errors.length}
                    </div>
                    {result.message && <div className="text-sm italic">{result.message}</div>}
                  </div>
                </AlertDescription>
              </div>
            </Alert>

            {/* Updated URLs */}
            {result.updated.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-green-700">Successfully Updated URLs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.updated.map((update, index) => (
                      <div key={index} className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="text-xs text-green-600 font-medium mb-1">
                          Event ID: {update.eventId}
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="text-gray-600">
                            <span className="font-medium">From:</span> 
                            <a 
                              href={update.oldUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-600 hover:underline break-all"
                            >
                              {new URL(update.oldUrl).hostname}
                            </a>
                          </div>
                          <div className="text-green-700">
                            <span className="font-medium">To:</span> 
                            <a 
                              href={update.newUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-600 hover:underline break-all"
                            >
                              {new URL(update.newUrl).hostname}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-red-700">Errors & Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {result.errors.map((error, index) => (
                      <div key={index} className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="text-xs text-red-600 font-medium mb-1">
                          Event ID: {error.eventId}
                        </div>
                        <div className="text-sm text-red-700">
                          {error.error}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Info */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">How it works:</div>
              <ul className="text-sm space-y-1 ml-4 list-disc">
                <li>Run "Dry Run (Test)" first to preview changes without updating the database</li>
                <li>Review the dry run results to confirm URLs are extracted correctly</li>
                <li>Once confident, click "Extract URLs" to update the database</li>
                <li>Scans events with catchdesmoines.com source URLs</li>
                <li>Visits each CatchDesMoines event page</li>
                <li>Looks for "Visit Website" links and external URLs</li>
                <li>Updates the database with the extracted organizer URLs</li>
                <li>Processes events in batches (configurable size) with rate limiting</li>
                <li>Uses proven multi-strategy URL extraction from AI Crawler</li>
                <li>Run multiple times until all catchdesmoines.com URLs are replaced</li>
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}