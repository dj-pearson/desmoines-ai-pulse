import React, { useState, useCallback } from "react";
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
import { Search, Brain, AlertTriangle, CheckCircle, XCircle, Loader2, Sparkles } from "lucide-react";
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
  { key: "originalDescription", label: "Description", searchable: true },
  { key: "sourceUrl", label: "Source URL", searchable: true },
  { key: "imageUrl", label: "Image URL", searchable: true },
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
      setSelectedEvents(new Set(events.map(e => e.id)));
    } else {
      setSelectedEvents(new Set());
    }
  }, [events]);

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

    setIsProcessing(true);
    setCurrentStep("process");
    
    const selectedEventsList = events.filter(e => selectedEvents.has(e.id));
    const fieldsArray = Array.from(selectedFields);
    
    // Initialize progress tracking
    const initialProgress = selectedEventsList.map(event => ({
      eventId: event.id,
      status: "pending" as const
    }));
    setProgress(initialProgress);

    try {
      // Call the Supabase function to batch enhance events
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
                    checked={selectedEvents.size === events.length && events.length > 0}
                    onCheckedChange={handleSelectAllEvents}
                  />
                  <Label htmlFor="selectAll" className="text-sm">
                    Select All ({events.length})
                  </Label>
                </div>
              </div>
              
              <ScrollArea className="h-64 border rounded-md p-3">
                <div className="space-y-2">
                  {events.map((event) => (
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
              </div>
              
              <Progress 
                value={(progress.filter(p => p.status === "completed" || p.status === "error").length / progress.length) * 100} 
                className="w-full"
              />
              
              <ScrollArea className="h-64 border rounded-md p-3">
                <div className="space-y-2">
                  {progress.map((item) => {
                    const event = events.find(e => e.id === item.eventId);
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
