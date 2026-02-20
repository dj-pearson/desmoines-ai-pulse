import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('WebsiteAnalysisDialog');

interface WebsiteAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void; // Callback when selectors are updated
  scrapingJob: {
    id: string;
    name: string;
    config: {
      url: string;
      selectors: {
        title: string;
        description: string;
        date: string;
        location: string;
        price?: string;
        category?: string;
      };
    };
  };
}

interface AnalysisResult {
  success: boolean;
  analysis?: {
    suggestedSelectors: {
      title: string[];
      description: string[];
      date: string[];
      location: string[];
      price: string[];
      category: string[];
    };
    htmlStructureAnalysis: string;
    recommendations: string;
  };
  error?: string;
}

export default function WebsiteAnalysisDialog({
  open,
  onOpenChange,
  onUpdate,
  scrapingJob,
}: WebsiteAnalysisDialogProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const analyzeWebsite = async () => {
    setIsAnalyzing(true);
    try {
      log.info('analyze', 'Starting website analysis', { data: { url: scrapingJob.config.url } });

      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: {
          websiteUrl: scrapingJob.config.url,
        },
        headers: {
          "x-endpoint": "analyze",
        },
      });

      if (error) {
        log.error('analyze', 'Analysis error', { data: error });
        throw error;
      }

      log.debug('analyze', 'Analysis result received', { data });
      setAnalysisResult(data);

      if (data.success) {
        toast({
          title: "Analysis Complete",
          description:
            "AI has analyzed the website structure and provided recommendations.",
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: data.error || "Unable to analyze website structure.",
          variant: "destructive",
        });
      }
    } catch (error) {
      log.error('analyze', 'Analysis failed', { data: error });
      setAnalysisResult({
        success: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
      toast({
        title: "Analysis Error",
        description: "Failed to analyze website. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copySelector = async (selector: string) => {
    try {
      await navigator.clipboard.writeText(selector);
      toast({
        title: "Copied!",
        description: "Selector copied to clipboard",
      });
    } catch (err) {
      log.error('copy', 'Failed to copy selector', { data: err });
    }
  };

  const applySelector = async (field: string, selector: string) => {
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: {
          jobId: scrapingJob.id,
          selectors: {
            [field]: selector,
          },
        },
        headers: {
          "x-endpoint": "update",
        },
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: "Selector Applied!",
          description: `Updated ${field} selector successfully`,
        });

        // Refresh the analysis to show updated current selectors
        setTimeout(() => {
          analyzeWebsite();
        }, 1000);

        // Notify parent component of the update
        onUpdate?.();
      } else {
        throw new Error(data.error || "Failed to apply selector");
      }
    } catch (error) {
      log.error('applySelector', 'Failed to apply selector', { data: error });
      toast({
        title: "Update Failed",
        description:
          error instanceof Error ? error.message : "Failed to apply selector",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const applyBestSelectors = async () => {
    if (!analysisResult?.analysis) return;

    setIsUpdating(true);
    try {
      const bestSelectors = {
        title: analysisResult.analysis.suggestedSelectors.title[0],
        description: analysisResult.analysis.suggestedSelectors.description[0],
        date: analysisResult.analysis.suggestedSelectors.date[0],
        location: analysisResult.analysis.suggestedSelectors.location[0],
        price: analysisResult.analysis.suggestedSelectors.price[0],
        category: analysisResult.analysis.suggestedSelectors.category[0],
      };

      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: {
          jobId: scrapingJob.id,
          selectors: bestSelectors,
        },
        headers: {
          "x-endpoint": "update",
        },
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: "All Selectors Applied!",
          description: "Updated all selectors with AI recommendations",
        });

        // Refresh the analysis to show updated current selectors
        setTimeout(() => {
          analyzeWebsite();
        }, 1000);

        // Notify parent component of the update
        onUpdate?.();
      } else {
        throw new Error(data.error || "Failed to apply selectors");
      }
    } catch (error) {
      log.error('applyBestSelectors', 'Failed to apply selectors', { data: error });
      toast({
        title: "Update Failed",
        description:
          error instanceof Error ? error.message : "Failed to apply selectors",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const SelectorCard = ({
    title,
    field,
    current,
    suggested,
  }: {
    title: string;
    field: string;
    current: string;
    suggested: string[];
  }) => (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Current:</div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {current || "Not set"}
            </Badge>
            {current && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copySelector(current)}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            AI Suggestions:
          </div>
          <div className="space-y-1">
            {suggested.map((selector, index) => (
              <div key={index} className="flex items-center gap-2">
                <Badge
                  variant={selector === current ? "default" : "secondary"}
                  className="font-mono text-xs flex-1"
                >
                  {selector}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copySelector(selector)}
                  className="h-6 w-6 p-0"
                  title="Copy selector"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                {selector !== current && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applySelector(field, selector)}
                    disabled={isUpdating}
                    className="h-6 px-2 text-xs"
                    title="Apply this selector"
                  >
                    Apply
                  </Button>
                )}
                {selector === current && (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Website Analysis: {scrapingJob.name}
          </DialogTitle>
          <DialogDescription>
            Analyze website structure and get AI-powered recommendations for
            better CSS selectors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{scrapingJob.config.url}</Badge>
            <Button
              onClick={analyzeWebsite}
              disabled={isAnalyzing}
              size="sm"
              className="ml-auto"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {analysisResult ? "Re-analyze" : "Start Analysis"}
                </>
              )}
            </Button>
          </div>

          {analysisResult && (
            <Tabs defaultValue="selectors" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="selectors">Selectors</TabsTrigger>
                <TabsTrigger value="structure">Structure</TabsTrigger>
                <TabsTrigger value="recommendations">Tips</TabsTrigger>
              </TabsList>

              <TabsContent value="selectors" className="mt-4">
                {analysisResult.success && analysisResult.analysis && (
                  <div className="mb-4 flex justify-end">
                    <Button
                      onClick={applyBestSelectors}
                      disabled={isUpdating}
                      size="sm"
                      variant="outline"
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Applying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Apply All Best
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <ScrollArea className="h-[400px] pr-4">
                  {analysisResult.success && analysisResult.analysis ? (
                    <div className="space-y-4">
                      <SelectorCard
                        title="Event Title"
                        field="title"
                        current={scrapingJob.config.selectors.title}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.title
                        }
                      />
                      <SelectorCard
                        title="Description"
                        field="description"
                        current={scrapingJob.config.selectors.description}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.description
                        }
                      />
                      <SelectorCard
                        title="Date/Time"
                        field="date"
                        current={scrapingJob.config.selectors.date}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.date
                        }
                      />
                      <SelectorCard
                        title="Location/Venue"
                        field="location"
                        current={scrapingJob.config.selectors.location}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.location
                        }
                      />
                      <SelectorCard
                        title="Price"
                        field="price"
                        current={scrapingJob.config.selectors.price || ""}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.price
                        }
                      />
                      <SelectorCard
                        title="Category"
                        field="category"
                        current={scrapingJob.config.selectors.category || ""}
                        suggested={
                          analysisResult.analysis.suggestedSelectors.category
                        }
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>
                        {analysisResult.error ||
                          "Run analysis to see selector recommendations"}
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="structure" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        HTML Structure Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analysisResult.success && analysisResult.analysis ? (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysisResult.analysis.htmlStructureAnalysis}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                          <p>Run analysis to see structure details</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="recommendations" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        AI Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analysisResult.success && analysisResult.analysis ? (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysisResult.analysis.recommendations}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                          <p>Run analysis to see recommendations</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          {!analysisResult && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Ready to Analyze</h3>
              <p>
                Click "Start Analysis" to have AI examine the website structure
                and suggest optimal CSS selectors.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
