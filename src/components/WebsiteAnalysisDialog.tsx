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
  RefreshCw 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface WebsiteAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  scrapingJob,
}: WebsiteAnalysisDialogProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const analyzeWebsite = async () => {
    setIsAnalyzing(true);
    try {
      console.log("Starting website analysis for:", scrapingJob.config.url);

      const { data, error } = await supabase.functions.invoke("scrape-events", {
        body: {
          websiteUrl: scrapingJob.config.url,
        },
        headers: {
          "x-endpoint": "analyze",
        },
      });

      if (error) {
        console.error("Analysis error:", error);
        throw error;
      }

      console.log("Analysis result:", data);
      setAnalysisResult(data);

      if (data.success) {
        toast({
          title: "Analysis Complete",
          description: "AI has analyzed the website structure and provided recommendations.",
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: data.error || "Unable to analyze website structure.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Analysis failed:", error);
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
      console.error("Failed to copy:", err);
    }
  };

  const SelectorCard = ({ 
    title, 
    current, 
    suggested 
  }: { 
    title: string; 
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
          <div className="text-xs text-muted-foreground mb-1">AI Suggestions:</div>
          <div className="space-y-1">
            {suggested.map((selector, index) => (
              <div key={index} className="flex items-center gap-2">
                <Badge 
                  variant={selector === current ? "default" : "secondary"} 
                  className="font-mono text-xs"
                >
                  {selector}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copySelector(selector)}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
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
            Analyze website structure and get AI-powered recommendations for better CSS selectors.
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
                <ScrollArea className="h-[400px] pr-4">
                  {analysisResult.success && analysisResult.analysis ? (
                    <div className="space-y-4">
                      <SelectorCard
                        title="Event Title"
                        current={scrapingJob.config.selectors.title}
                        suggested={analysisResult.analysis.suggestedSelectors.title}
                      />
                      <SelectorCard
                        title="Description"
                        current={scrapingJob.config.selectors.description}
                        suggested={analysisResult.analysis.suggestedSelectors.description}
                      />
                      <SelectorCard
                        title="Date/Time"
                        current={scrapingJob.config.selectors.date}
                        suggested={analysisResult.analysis.suggestedSelectors.date}
                      />
                      <SelectorCard
                        title="Location/Venue"
                        current={scrapingJob.config.selectors.location}
                        suggested={analysisResult.analysis.suggestedSelectors.location}
                      />
                      <SelectorCard
                        title="Price"
                        current={scrapingJob.config.selectors.price || ""}
                        suggested={analysisResult.analysis.suggestedSelectors.price}
                      />
                      <SelectorCard
                        title="Category"
                        current={scrapingJob.config.selectors.category || ""}
                        suggested={analysisResult.analysis.suggestedSelectors.category}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>{analysisResult.error || "Run analysis to see selector recommendations"}</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="structure" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">HTML Structure Analysis</CardTitle>
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
                      <CardTitle className="text-sm">AI Recommendations</CardTitle>
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
              <p>Click "Start Analysis" to have AI examine the website structure and suggest optimal CSS selectors.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
