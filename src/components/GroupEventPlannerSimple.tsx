import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { 
  Users, 
  MessageCircle, 
  Calendar, 
  MapPin,
  CheckCircle,
  XCircle,
  PlusCircle,
  Eye
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('GroupEventPlanner');

interface FriendGroup {
  id: string;
  name: string;
  description?: string;
  member_count: number;
}

interface GroupEventPlannerProps {
  group: FriendGroup;
  onClose: () => void;
}

export function GroupEventPlanner({ group, onClose }: GroupEventPlannerProps) {
  const { user } = useAuth();
  
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<any[]>([]);
  const [votes, setVotes] = useState<Record<string, Record<string, string>>>({});
  const [activeUsers] = useState([user?.id].filter(Boolean));

  const searchEvents = async () => {
    if (!searchQuery.trim()) return;

    try {
      // Mock search for now
      const mockEvents = [
        {
          id: '1',
          title: `${searchQuery} Event`,
          date: new Date().toISOString(),
          venue: 'Sample Venue',
          location: 'Des Moines, IA'
        },
        {
          id: '2', 
          title: `Another ${searchQuery} Event`,
          date: new Date(Date.now() + 86400000).toISOString(),
          venue: 'Another Venue',
          location: 'West Des Moines, IA'
        }
      ];
      
      setEvents(mockEvents);
      toast.success('Found sample events');
    } catch (error) {
      log.error('search', 'Failed to search events', { data: error });
      toast.error('Failed to search events');
    }
  };

  const addEventToPlanning = (event: any) => {
    if (selectedEvents.find(e => e.id === event.id)) {
      toast.error('Event already added');
      return;
    }
    
    setSelectedEvents(prev => [...prev, event]);
    toast.success(`Added "${event.title}" to planning session`);
  };

  const voteOnEvent = (eventId: string, vote: 'yes' | 'no' | 'maybe') => {
    if (!user) return;

    setVotes(prev => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [user.id]: vote
      }
    }));

    toast.success(`Voted "${vote}" on event`);
  };

  const getVoteCounts = (eventId: string) => {
    const eventVotes = votes[eventId] || {};
    return {
      yes: Object.values(eventVotes).filter(v => v === 'yes').length,
      no: Object.values(eventVotes).filter(v => v === 'no').length,
      maybe: Object.values(eventVotes).filter(v => v === 'maybe').length
    };
  };

  const getUserVote = (eventId: string) => {
    if (!user) return null;
    return votes[eventId]?.[user.id] || null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {group.name} - Event Planning
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Plan your next group adventure together
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {activeUsers.slice(0, 5).map((userId, index) => (
                    <Avatar key={userId} className="w-6 h-6 border-2 border-white">
                      <AvatarFallback className="text-xs">
                        {userId === user?.id ? 'You' : `U${index + 1}`}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <Badge variant="secondary" className="text-xs">
                  <Eye className="w-3 h-3 mr-1" />
                  {activeUsers.length} online
                </Badge>
              </div>
              
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 h-[70vh]">
            <div className="border-r overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-3">Find Events</h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search events..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchEvents()}
                    />
                    <Button onClick={searchEvents}>
                      Search
                    </Button>
                  </div>
                </div>

                {events.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Search Results</h4>
                    {events.map((event) => (
                      <Card key={event.id} className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h5 className="font-medium text-sm line-clamp-1">
                              {event.title}
                            </h5>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(event.date).toLocaleDateString()}
                              {event.venue && (
                                <>
                                  <MapPin className="w-3 h-3" />
                                  <span className="truncate">{event.venue}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => addEventToPlanning(event)}
                            className="ml-2"
                          >
                            <PlusCircle className="w-3 h-3" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {selectedEvents.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Selected Events</h4>
                    {selectedEvents.map((event) => {
                      const voteCounts = getVoteCounts(event.id);
                      const userVote = getUserVote(event.id);
                      
                      return (
                        <Card key={event.id} className="p-3">
                          <div className="space-y-3">
                            <div>
                              <h5 className="font-medium text-sm">{event.title}</h5>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {new Date(event.date).toLocaleDateString()}
                                {event.venue && (
                                  <>
                                    <MapPin className="w-3 h-3" />
                                    <span>{event.venue}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={userVote === 'yes' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'yes')}
                                  className="flex-1 text-xs"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Yes ({voteCounts.yes})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'maybe' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'maybe')}
                                  className="flex-1 text-xs"
                                >
                                  Maybe ({voteCounts.maybe})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'no' ? 'destructive' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'no')}
                                  className="flex-1 text-xs"
                                >
                                  <XCircle className="w-3 h-3 mr-1" />
                                  No ({voteCounts.no})
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-4 h-4" />
                <h3 className="font-semibold">Group Notes</h3>
                <Badge variant="outline" className="text-xs">
                  Local notes
                </Badge>
              </div>
              
              <Textarea
                placeholder="Add notes, ideas, or plans here..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex-1 resize-none"
              />
              
              <div className="mt-4 text-xs text-muted-foreground">
                Notes are saved locally for this session
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}