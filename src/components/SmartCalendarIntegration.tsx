import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarIcon, ClockIcon, MapPinIcon, SparklesIcon, AlertTriangleIcon, CheckIcon, XIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { useSmartCalendar, type EventSuggestion, type CalendarEvent } from '@/hooks/useSmartCalendar';
import { format, parseISO } from 'date-fns';

export default function SmartCalendarIntegration() {
  const {
    calendars,
    events,
    suggestions,
    preferences,
    loading,
    checkConflicts,
    generateSuggestions,
    acceptSuggestion,
    dismissSuggestion,
    updatePreferences,
    addManualEvent
  } = useSmartCalendar();

  const [selectedEvent, setSelectedEvent] = useState<EventSuggestion | null>(null);
  const [conflicts, setConflicts] = useState<any>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const handleCheckConflicts = async (suggestion: EventSuggestion) => {
    if (!suggestion.event?.date) return;
    
    const eventDate = new Date(suggestion.event.date);
    const startTime = eventDate.toISOString();
    const endTime = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours later
    
    const result = await checkConflicts(startTime, endTime);
    setConflicts(result);
    setSelectedEvent(suggestion);
  };

  const getSuggestionBadgeColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-blue-500';
    return 'bg-yellow-500';
  };

  const CalendarPreferencesForm = () => {
    const [workStart, setWorkStart] = useState(preferences?.work_hours_start || '09:00');
    const [workEnd, setWorkEnd] = useState(preferences?.work_hours_end || '17:00');
    const [bufferTime, setBufferTime] = useState(preferences?.buffer_time_minutes || 15);
    const [autoSuggest, setAutoSuggest] = useState(preferences?.auto_suggest_events ?? true);

    const handleSave = () => {
      updatePreferences({
        work_hours_start: workStart,
        work_hours_end: workEnd,
        buffer_time_minutes: bufferTime,
        auto_suggest_events: autoSuggest,
      });
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="work-start">Work Hours Start</Label>
            <Input
              id="work-start"
              type="time"
              value={workStart}
              onChange={(e) => setWorkStart(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="work-end">Work Hours End</Label>
            <Input
              id="work-end"
              type="time"
              value={workEnd}
              onChange={(e) => setWorkEnd(e.target.value)}
            />
          </div>
        </div>
        
        <div>
          <Label htmlFor="buffer-time">Buffer Time (minutes)</Label>
          <Input
            id="buffer-time"
            type="number"
            value={bufferTime}
            onChange={(e) => setBufferTime(Number(e.target.value))}
            min="0"
            max="60"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="auto-suggest"
            checked={autoSuggest}
            onCheckedChange={setAutoSuggest}
          />
          <Label htmlFor="auto-suggest">Enable Smart Event Suggestions</Label>
        </div>

        <Button onClick={handleSave} disabled={loading}>
          Save Preferences
        </Button>
      </div>
    );
  };

  const AddEventForm = () => {
    const [title, setTitle] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title || !startTime || !endTime) return;

      await addManualEvent({
        title,
        start_time: startTime,
        end_time: endTime,
        location,
        description,
      });

      setTitle('');
      setStartTime('');
      setEndTime('');
      setLocation('');
      setDescription('');
      setShowAddEvent(false);
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="title">Event Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter event title"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="start">Start Time</Label>
            <Input
              id="start"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="end">End Time</Label>
            <Input
              id="end"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Event location (optional)"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Event description (optional)"
          />
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => setShowAddEvent(false)}>
            Cancel
          </Button>
          <Button type="submit">Add Event</Button>
        </div>
      </form>
    );
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Smart Calendar</h1>
          <p className="text-muted-foreground">
            Intelligent event suggestions based on your schedule and preferences
          </p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={showAddEvent} onOpenChange={setShowAddEvent}>
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Calendar Event</DialogTitle>
                <DialogDescription>
                  Add a new event to your calendar
                </DialogDescription>
              </DialogHeader>
              <AddEventForm />
            </DialogContent>
          </Dialog>
          
          <Button onClick={generateSuggestions} disabled={loading} variant="outline">
            <SparklesIcon className="w-4 h-4 mr-2" />
            {loading ? 'Generating...' : 'Refresh Suggestions'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="suggestions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="suggestions">Smart Suggestions</TabsTrigger>
          <TabsTrigger value="calendar">My Calendar</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <SparklesIcon className="w-5 h-5 mr-2" />
                  Event Suggestions for You
                </CardTitle>
                <CardDescription>
                  AI-powered recommendations based on your calendar availability and interests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {suggestions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      No suggestions available. Click "Refresh Suggestions" to generate new recommendations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {suggestions.map((suggestion) => (
                      <Card key={suggestion.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="font-semibold">{suggestion.event?.title}</h3>
                                <Badge 
                                  variant="secondary" 
                                  className={`${getSuggestionBadgeColor(suggestion.confidence_score)} text-white`}
                                >
                                  {Math.round(suggestion.confidence_score * 100)}% match
                                </Badge>
                              </div>
                              
                              <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-2">
                                {suggestion.event?.date && (
                                  <div className="flex items-center">
                                    <CalendarIcon className="w-4 h-4 mr-1" />
                                    {format(parseISO(suggestion.event.date), 'MMM d, yyyy h:mm a')}
                                  </div>
                                )}
                                {suggestion.event?.location && (
                                  <div className="flex items-center">
                                    <MapPinIcon className="w-4 h-4 mr-1" />
                                    {suggestion.event.location}
                                  </div>
                                )}
                              </div>
                              
                              <p className="text-sm text-muted-foreground mb-3">
                                Suggested because: {suggestion.reason.replace('_', ' ')}
                              </p>
                              
                              {suggestion.travel_time_minutes > 0 && (
                                <div className="flex items-center text-sm text-muted-foreground mb-3">
                                  <ClockIcon className="w-4 h-4 mr-1" />
                                  {suggestion.travel_time_minutes} min travel time
                                </div>
                              )}
                            </div>
                            
                            <div className="flex flex-col space-y-2">
                              <Button
                                size="sm"
                                onClick={() => handleCheckConflicts(suggestion)}
                                variant="outline"
                              >
                                Check Schedule
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => acceptSuggestion(suggestion.id)}
                                variant="default"
                              >
                                <CheckIcon className="w-4 h-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => dismissSuggestion(suggestion.id)}
                                variant="ghost"
                              >
                                <XIcon className="w-4 h-4 mr-1" />
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Conflict Detection Modal */}
            {selectedEvent && conflicts && (
              <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Schedule Analysis</DialogTitle>
                    <DialogDescription>
                      Checking for conflicts with "{selectedEvent.event?.title}"
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    {conflicts.count === 0 ? (
                      <div className="flex items-center text-green-600">
                        <CheckIcon className="w-5 h-5 mr-2" />
                        <span>No conflicts found! You're free during this time.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center text-amber-600">
                          <AlertTriangleIcon className="w-5 h-5 mr-2" />
                          <span>{conflicts.count} potential conflict(s) found:</span>
                        </div>
                        
                        {conflicts.events.map((event: any, index: number) => (
                          <Card key={index} className="border-amber-200">
                            <CardContent className="pt-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{event.title}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(parseISO(event.start_time), 'h:mm a')} - {format(parseISO(event.end_time), 'h:mm a')}
                                  </p>
                                </div>
                                <Badge variant="outline">{event.calendar_name}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setSelectedEvent(null)}>
                        Close
                      </Button>
                      {conflicts.count === 0 && (
                        <Button onClick={() => {
                          acceptSuggestion(selectedEvent.id);
                          setSelectedEvent(null);
                        }}>
                          Add to Calendar
                        </Button>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle>Your Calendar Events</CardTitle>
              <CardDescription>
                Upcoming events from your connected calendars
              </CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No upcoming events found.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.slice(0, 10).map((event) => (
                    <Card key={event.id} className="border-l-4 border-l-purple-500">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{event.title}</h3>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                              <div className="flex items-center">
                                <CalendarIcon className="w-4 h-4 mr-1" />
                                {format(parseISO(event.start_time), 'MMM d, h:mm a')}
                              </div>
                              {event.location && (
                                <div className="flex items-center">
                                  <MapPinIcon className="w-4 h-4 mr-1" />
                                  {event.location}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className={
                            event.status === 'confirmed' ? 'border-green-500' :
                            event.status === 'tentative' ? 'border-yellow-500' : 
                            'border-red-500'
                          }>
                            {event.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <SettingsIcon className="w-5 h-5 mr-2" />
                Calendar Preferences
              </CardTitle>
              <CardDescription>
                Configure your work hours and smart suggestion settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CalendarPreferencesForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}