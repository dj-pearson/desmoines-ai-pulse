import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Search, Brain, AlertTriangle, CheckCircle, XCircle, Loader2, Sparkles, Globe, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Event } from "@/lib/types";

interface EventDataEnhancerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: Event[];
  onSuccess: () => void;
}

interface FieldConfig {
  key: keyof Event;
  label: string;
  searchable: boolean;
}

const searchableFields: FieldConfig[] = [
  { key: "title", label: "Title", searchable: true },
  { key: "venue", label: "Venue", searchable: true },
  { key: "location", label: "Location", searchable: true },
  { key: "price", label: "Price", searchable: true },
  { key: "category", label: "Category", searchable: true },
  { key: "original_description", label: "Description", searchable: true },
  { key: "source_url", label: "Source URL", searchable: true },
  { key: "image_url", label: "Image URL", searchable: true },
];

interface SearchProgress {
  eventId: string;
  status: "pending" | "searching" | "analyzing" | "updating" | "completed" | "error";
  error?: string;
}

export default function EventDataEnhancer({ open, onOpenChange, events, onSuccess }: EventDataEnhancerProps) {
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [selectedFields, setSelectedFields] = useState<Set<keyof Event>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<SearchProgress[]>([]);
  const [currentStep, setCurrentStep] = useState<"select" | "process" | "complete">("select");
  const [mode, setMode] = useState<"individual" | "bulk">("individual");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [batchSize, setBatchSize] = useState(5);

  // Get unique domains from events with source URLs, plus common ones
  const domains = useMemo(() => {
    const domainSet = new Set<string>();
    
    // Add common domains that might not have proper URLs yet
    domainSet.add("catchdesmoines.com");
    domainSet.add("www.catchdesmoines.com");
    
    console.log('EventDataEnhancer: Processing', events.length, 'events for domain extraction');
    
    // Log first 20 sourceUrls to see what we're working with
    // Handle both camelCase (sourceUrl) and snake_case (source_url) field names
    console.log('First 20 sourceUrls:');
    events.slice(0, 20).forEach((event, index) => {
      const sourceUrl = event.source_url;
      console.log(`${index + 1}. sourceUrl: "${sourceUrl}" (${typeof sourceUrl})`);
    });
    
    // Look for any URLs containing 'catch' or 'desmoines'
    const catchEvents = events.filter(event => {
      const sourceUrl = event.source_url;
      return sourceUrl && (
        sourceUrl.toLowerCase().includes('catch') ||
        sourceUrl.toLowerCase().includes('desmoines')
      );
    });
    console.log(`Found ${catchEvents.length} events with 'catch' or 'desmoines' in sourceUrl:`);
    catchEvents.forEach((event, index) => {
      const sourceUrl = event.source_url;
      console.log(`${index + 1}. "${sourceUrl}"`);
    });
    
    events.forEach((event, index) => {
      const sourceUrl = event.source_url;
      if (sourceUrl) {
        try {
          const url = new URL(sourceUrl);
          domainSet.add(url.hostname);
        } catch {
          // Try to extract domain from malformed URLs
          const match = sourceUrl.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
          if (match && match[1]) {
            console.log(`Extracted domain from malformed URL: ${match[1]}`);
            domainSet.add(match[1]);
          }
        }
      }
    });
    
    const domainsArray = Array.from(domainSet).sort();
    console.log('Final domains array:', domainsArray);
    return domainsArray;
  }, [events]);

  // Filter events by selected domain (using custom domain if provided)
  const filteredEvents = useMemo(() => {
    if (mode === "individual") {
      return events;
    }
    
    const targetDomain = customDomain || selectedDomain;
    if (!targetDomain) {
      return events;
    }

    return events.filter(event => {
      const sourceUrl = event.source_url;
      if (!sourceUrl) return false;
      
      // Check if the source URL contains the target domain
      const normalizedUrl = sourceUrl.toLowerCase();
      const normalizedDomain = targetDomain.toLowerCase();
      
      // Handle various URL formats
      return normalizedUrl.includes(normalizedDomain) ||
             normalizedUrl.includes(`www.${normalizedDomain}`) ||
             normalizedUrl.includes(normalizedDomain.replace('www.', ''));
    });
  }, [events, mode, selectedDomain, customDomain]);

  const domainEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    domains.forEach(domain => {
      const matchingEvents = events.filter(event => {
        const sourceUrl = event.source_url;
        if (!sourceUrl) return false;
        
        // More flexible domain matching
        const normalizedUrl = sourceUrl.toLowerCase();
        const normalizedDomain = domain.toLowerCase();
        
        const matches = normalizedUrl.includes(normalizedDomain) ||
               normalizedUrl.includes(`www.${normalizedDomain}`) ||
               normalizedUrl.includes(normalizedDomain.replace('www.', ''));
        
        if (domain.includes('catchdesmoines') && matches) {
          console.log(`Found catchdesmoines match: ${sourceUrl} matches domain ${domain}`);
        }
        
        return matches;
      });
      
      counts[domain] = matchingEvents.length;
      
      if (domain.includes('catchdesmoines')) {
        console.log(`Domain ${domain} has ${counts[domain]} events`);
        if (matchingEvents.length > 0) {
          console.log('Sample URLs:', matchingEvents.slice(0, 3).map(e => e.source_url));
        }
      }
    });
    return counts;
  }, [events, domains]);

  // Clear selection when changing mode, domain, or custom domain
  useEffect(() => {
    setSelectedEvents(new Set());
  }, [mode, selectedDomain, customDomain]);

  const handleEventSelection = useCallback((eventId: string, checked: boolean) => {
    setSelectedEvents(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(eventId);
      } else {
        newSet.delete(eventId);
      }
      return newSet;
    });
  }, []);

  const handleFieldSelection = useCallback((field: keyof Event, checked: boolean) => {
    setSelectedFields(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(field);
      } else {
        newSet.delete(field);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllEvents = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedEvents(new Set(filteredEvents.map(e => e.id)));
    } else {
      setSelectedEvents(new Set());
    }
  }, [filteredEvents]);

  const searchWithGoogle = async (query: string): Promise<string[]> => {
    // This is now handled by the Supabase function
    throw new Error('This method is deprecated - use processEvents instead');
  };

  const analyzeWithClaude = async (searchResults: string[], fields: string[], eventData: Partial<Event>): Promise<Partial<Event>> => {
    // This is now handled by the Supabase function
    throw new Error('This method is deprecated - use processEvents instead');
  };

  const updateEventInDatabase = async (eventId: string, updates: Partial<Event>): Promise<void> => {
    // This is now handled by the Supabase function
    throw new Error('This method is deprecated - use processEvents instead');
  };

  const processEvents = async () => {
    if (selectedEvents.size === 0 || selectedFields.size === 0) {
      toast.error("Please select events and fields to process");
      return;
    }

    if (mode === "bulk" && !selectedDomain && !customDomain) {
      toast.error("Please select a domain or enter a custom domain for bulk processing");
      return;
    }

    setIsProcessing(true);
    setCurrentStep("process");
    
    const selectedEventsList = filteredEvents.filter(e => selectedEvents.has(e.id));
    const fieldsArray = Array.from(selectedFields);
    
    // Initialize progress tracking
    const initialProgress = selectedEventsList.map(event => ({
      eventId: event.id,
      status: "pending" as const
    }));
    setProgress(initialProgress);

    try {
      if (mode === "bulk" && selectedEventsList.length > batchSize) {
        // Process in smaller batches
        let allResults: any[] = [];
        
        for (let i = 0; i < selectedEventsList.length; i += batchSize) {
          const batch = selectedEventsList.slice(i, i + batchSize);
          const batchIds = batch.map(e => e.id);
          
          console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(selectedEventsList.length / batchSize)}`);
          
          // Update progress for current batch
          setProgress(prev => prev.map(p => 
            batchIds.includes(p.eventId) ? { ...p, status: "searching" as const } : p
          ));

          const { data, error } = await supabase.functions.invoke('batch-enhance-events', {
            body: {
              eventIds: batchIds,
              fields: fieldsArray,
              baseQuery: searchQuery
            }
          });

          if (error) {
            console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error);
            // Mark batch as error and continue
            setProgress(prev => prev.map(p => 
              batchIds.includes(p.eventId) ? { 
                ...p, 
                status: "error" as const, 
                error: error.message 
              } : p
            ));
          } else {
            const batchResults = data.results || [];
            allResults.push(...batchResults);
            
            // Update progress for this batch
            batchResults.forEach((result: any) => {
              setProgress(prev => prev.map(p => 
                p.eventId === result.eventId ? {
                  ...p,
                  status: result.status === 'success' ? 'completed' as const : 
                          result.status === 'error' ? 'error' as const : 
                          'completed' as const,
                  error: result.error
                } : p
              ));
            });
          }
          
          // Add delay between batches to avoid rate limiting
          if (i + batchSize < selectedEventsList.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        const successCount = allResults.filter(r => r.status === 'success').length;
        
        if (successCount > 0) {
          toast.success(`Successfully enhanced ${successCount} events in ${Math.ceil(selectedEventsList.length / batchSize)} batches`);
          onSuccess();
        } else {
          toast.warning("No events were enhanced. Try different search terms or check the source data.");
        }
        
      } else {
        // Process all at once (original behavior)
        const { data, error } = await supabase.functions.invoke('batch-enhance-events', {
          body: {
            eventIds: Array.from(selectedEvents),
            fields: fieldsArray,
            baseQuery: searchQuery
          }
        });

        if (error) {
          throw error;
        }

        // Update progress based on results
        const results = data.results || [];
        const updatedProgress = results.map((result: any) => ({
          eventId: result.eventId,
          status: result.status === 'success' ? 'completed' as const : 
                  result.status === 'error' ? 'error' as const : 
                  'completed' as const,
          error: result.error
        }));

        setProgress(updatedProgress);

        const successCount = results.filter((r: any) => r.status === 'success').length;
        
        if (successCount > 0) {
          toast.success(`Successfully enhanced ${successCount} events`);
          onSuccess();
        } else {
          toast.warning("No events were enhanced. Try different search terms or check the source data.");
        }
      }

    } catch (error) {
      console.error('Batch enhancement error:', error);
      toast.error('Failed to enhance events: ' + (error instanceof Error ? error.message : 'Unknown error'));
      
      // Mark all as error
      setProgress(prev => prev.map(p => ({
        ...p,
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error'
      })));
    }

    setIsProcessing(false);
    setCurrentStep("complete");
  };

  const resetDialog = () => {
    setSelectedEvents(new Set());
    setSelectedFields(new Set());
    setSearchQuery("");
    setProgress([]);
    setCurrentStep("select");
    setIsProcessing(false);
    setMode("individual");
    setSelectedDomain("");
    setCustomDomain("");
    setBatchSize(5);
  };

  const handleClose = () => {
    if (!isProcessing) {
      resetDialog();
      onOpenChange(false);
    }
  };

  const getStatusIcon = (status: SearchProgress["status"]) => {
    switch (status) {
      case "pending":
        return <div className="w-4 h-4 rounded-full border-2 border-muted" />;
      case "searching":
      case "analyzing":
      case "updating":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: SearchProgress["status"]) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "searching":
        return "Searching...";
      case "analyzing":
        return "Analyzing...";
      case "updating":
        return "Updating...";
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Event Data Enhancer
          </DialogTitle>
          <DialogDescription>
            Use AI to search and enhance event data fields automatically
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          {currentStep === "select" && (
            <div className="space-y-6 pr-4">
              {/* Mode Selection */}
              <Tabs value={mode} onValueChange={(value) => setMode(value as "individual" | "bulk")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="individual" className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    Individual Selection
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Bulk by Domain
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="individual" className="space-y-4">
                  <Alert>
                    <Search className="h-4 w-4" />
                    <AlertDescription>
                      Select individual events to enhance with AI-powered search and analysis.
                    </AlertDescription>
                  </Alert>
                </TabsContent>

                <TabsContent value="bulk" className="space-y-4">
                  <Alert>
                    <Globe className="h-4 w-4" />
                    <AlertDescription>
                      Process all events from a specific domain. Useful for replacing source URLs from sites like catchdesmoines.com with more authoritative sources.
                    </AlertDescription>
                  </Alert>

                  {/* Domain Selection */}
                  <div className="space-y-4">
                    <Label>Select Domain to Process</Label>
                    
                    {/* Predefined Domain Dropdown */}
                    <div className="space-y-2">
                      <Label htmlFor="domain" className="text-sm text-muted-foreground">Choose from detected domains:</Label>
                      <Select value={selectedDomain} onValueChange={(value) => {
                        setSelectedDomain(value);
                        setCustomDomain(""); // Clear custom domain when selecting from dropdown
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a domain..." />
                        </SelectTrigger>
                        <SelectContent>
                          {domains.map((domain) => (
                            <SelectItem key={domain} value={domain}>
                              {domain} ({domainEventCounts[domain]} events)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Domain Input */}
                    <div className="space-y-2">
                      <Label htmlFor="customDomain" className="text-sm text-muted-foreground">Or type a custom domain:</Label>
                      <Input
                        id="customDomain"
                        placeholder="e.g., catchdesmoines.com"
                        value={customDomain}
                        onChange={(e) => {
                          setCustomDomain(e.target.value);
                          setSelectedDomain(""); // Clear dropdown selection when typing custom domain
                        }}
                      />
                      {customDomain && (
                        <p className="text-xs text-muted-foreground">
                          Custom domain will match URLs containing: {customDomain}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Batch Size Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="batchSize">Batch Size</Label>
                    <Select value={batchSize.toString()} onValueChange={(value) => setBatchSize(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 events per batch (safest)</SelectItem>
                        <SelectItem value="5">5 events per batch (recommended)</SelectItem>
                        <SelectItem value="10">10 events per batch (faster)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Smaller batches are safer for rate limits. Processing will pause 2 seconds between batches.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Search Query Input */}
              <div className="space-y-2">
                <Label htmlFor="searchQuery">Base Search Query (optional)</Label>
                <Input
                  id="searchQuery"
                  placeholder="Additional search context (will be combined with event title)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

            {/* Field Selection */}
            <div className="space-y-3">
              <Label>Select Fields to Enhance</Label>
              <div className="grid grid-cols-2 gap-2">
                {searchableFields.map((field) => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={field.key}
                      checked={selectedFields.has(field.key)}
                      onCheckedChange={(checked) => 
                        handleFieldSelection(field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={field.key} className="text-sm">
                      {field.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Event Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Events to Process</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="selectAll"
                    checked={selectedEvents.size === filteredEvents.length && filteredEvents.length > 0}
                    onCheckedChange={handleSelectAllEvents}
                  />
                  <Label htmlFor="selectAll" className="text-sm">
                    Select All ({filteredEvents.length})
                  </Label>
                </div>
              </div>
              
              {mode === "bulk" && (selectedDomain || customDomain) && (
                <div className="p-3 bg-muted rounded-md">
                  <div className="text-sm font-medium">Domain Filter Active</div>
                  <div className="text-xs text-muted-foreground">
                    Showing {filteredEvents.length} events from {customDomain || selectedDomain}
                  </div>
                </div>
              )}
              
              <ScrollArea className="h-64 border rounded-md p-3">
                <div className="space-y-2">
                  {filteredEvents.map((event) => (
                    <Card key={event.id} className="p-3">
                      <div className="flex items-start space-x-2">
                        <Checkbox
                          id={event.id}
                          checked={selectedEvents.has(event.id)}
                          onCheckedChange={(checked) => 
                            handleEventSelection(event.id, checked as boolean)
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{event.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {event.venue && <span>{event.venue} • </span>}
                            {event.date && <span>{new Date(event.date).toLocaleDateString()}</span>}
                          </div>
                          {mode === "bulk" && event.source_url && (
                            <div className="text-xs text-blue-600 truncate mt-1">
                              {event.source_url}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {selectedEvents.size > 0 && selectedFields.size > 0 && (
              <Alert>
                <Search className="h-4 w-4" />
                <AlertDescription>
                  Ready to enhance {selectedEvents.size} events with {selectedFields.size} fields.
                  {mode === "bulk" && selectedEvents.size > batchSize && (
                    <span className="block mt-1 text-sm">
                      Will process in {Math.ceil(selectedEvents.size / batchSize)} batches of {batchSize} events each.
                    </span>
                  )}
                  This will use Google Search API and Claude AI to find and analyze relevant information.
                </AlertDescription>
              </Alert>
            )}
            </div>
          )}

          {currentStep === "process" && (
            <div className="space-y-4 pr-4">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                <span className="font-medium">Processing Events</span>
                {mode === "bulk" && selectedEvents.size > batchSize && (
                  <Badge variant="secondary">
                    Batch Mode: {batchSize} events per batch
                  </Badge>
                )}
              </div>
              
              <Progress 
                value={(progress.filter(p => p.status === "completed" || p.status === "error").length / progress.length) * 100} 
                className="w-full"
              />
              
              <div className="text-sm text-muted-foreground text-center">
                {progress.filter(p => p.status === "completed" || p.status === "error").length} of {progress.length} events processed
              </div>
              
              <ScrollArea className="h-64 border rounded-md p-3">
                <div className="space-y-2">
                  {progress.map((item) => {
                    const event = filteredEvents.find(e => e.id === item.eventId);
                    return (
                      <div key={item.eventId} className="flex items-center gap-3 p-2 rounded border">
                        {getStatusIcon(item.status)}
                        <div className="flex-1">
                          <div className="font-medium">{event?.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {getStatusText(item.status)}
                            {item.error && <span className="text-red-500"> - {item.error}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {currentStep === "complete" && (
            <div className="space-y-4 text-center pr-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h3 className="font-medium">Processing Complete</h3>
                <p className="text-sm text-muted-foreground">
                  {progress.filter(p => p.status === "completed").length} events enhanced successfully
                </p>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 mt-4">
          {currentStep === "select" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={processEvents}
                disabled={selectedEvents.size === 0 || selectedFields.size === 0}
              >
                <Search className="w-4 h-4 mr-2" />
                Start Enhancement
              </Button>
            </>
          )}
          
          {currentStep === "process" && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </Button>
          )}
          
          {currentStep === "complete" && (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
