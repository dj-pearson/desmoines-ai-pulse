import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { 
  Users, 
  MessageCircle, 
  Vote, 
  Calendar, 
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  PlusCircle,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSocialFeatures } from "@/hooks/useSocialFeatures";
import { toast } from "sonner";

interface GroupPlanningSession {
  id: string;
  group_id: string;
  session_name: string;
  active_users: any;
  selected_events: any;
  notes: string;
  voting_data: any;
  created_at: string;
  expires_at: string;
  updated_at: string;
}

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
  const { getEventAttendance } = useSocialFeatures();
  
  const [session, setSession] = useState<GroupPlanningSession | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const realtimeRef = useRef<any>(null);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeSession();
    
    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
      }
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current);
      }
    };
  }, [group.id]);

  const initializeSession = async () => {
    try {
      // Check for existing active session
      const { data: existingSessions } = await supabase
        .from('group_planning_sessions')
        .select('*')
        .eq('group_id', group.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      let currentSession = existingSessions?.[0];

      if (!currentSession) {
        // Create new session
        const { data: newSession, error } = await supabase
          .from('group_planning_sessions')
          .insert({
            group_id: group.id,
            session_name: `${group.name} Planning - ${new Date().toLocaleDateString()}`,
            active_users: [user?.id].filter(Boolean),
            selected_events: [],
            notes: "",
            voting_data: {}
          })
          .select()
          .single();

        if (error) throw error;
        currentSession = newSession;
      }

      setSession(currentSession);
      setNotes(currentSession.notes || "");
      setupRealtimeSubscription(currentSession.id);
      await joinSession(currentSession.id);
      
    } catch (error) {
      console.error('Failed to initialize session:', error);
      toast.error('Failed to start planning session');
    }
  };

  const setupRealtimeSubscription = (sessionId: string) => {
    realtimeRef.current = supabase
      .channel(`planning_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_planning_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => {
          if (payload.new) {
            const newSession = payload.new as any;
            setSession(newSession);
            setActiveUsers(Array.isArray(newSession.active_users) ? newSession.active_users : []);
            if (newSession.notes !== notes) {
              setNotes(newSession.notes || "");
            }
          }
        }
      )
      .subscribe();
  };

  const joinSession = async (sessionId: string) => {
    if (!user) return;

    try {
      // Get current session to update active users array
      const { data: currentSession } = await supabase
        .from('group_planning_sessions')
        .select('active_users')
        .eq('id', sessionId)
        .single();

      const currentUsers = Array.isArray(currentSession?.active_users) ? currentSession.active_users : [];
      const updatedUsers = [...new Set([...currentUsers, user.id])];

      const { error } = await supabase
        .from('group_planning_sessions')
        .update({ active_users: updatedUsers })
        .eq('id', sessionId);

      if (error) throw error;
      setIsJoined(true);
    } catch (error) {
      console.error('Failed to join session:', error);
    }
  };

  const leaveSession = async () => {
    if (!user || !session) return;

    try {
      const currentUsers = Array.isArray(session.active_users) ? session.active_users : [];
      const updatedUsers = currentUsers.filter(id => id !== user.id);

      const { error } = await supabase
        .from('group_planning_sessions')
        .update({ active_users: updatedUsers })
        .eq('id', session.id);

      if (error) throw error;
      setIsJoined(false);
    } catch (error) {
      console.error('Failed to leave session:', error);
    }
  };

  const updateNotes = async (newNotes: string) => {
    if (!session) return;

    // Clear existing timeout
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    // Debounce notes update
    notesTimeoutRef.current = setTimeout(async () => {
      try {
        await supabase
          .from('group_planning_sessions')
          .update({ notes: newNotes })
          .eq('id', session.id);
      } catch (error) {
        console.error('Failed to update notes:', error);
      }
    }, 1000);
  };

  const searchEvents = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('date', today)
        .or(`title.ilike.%${searchQuery}%,venue.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`)
        .order('date', { ascending: true })
        .limit(10);

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Failed to search events:', error);
      toast.error('Failed to search events');
    } finally {
      setIsLoading(false);
    }
  };

  const addEventToPlanning = async (event: any) => {
    if (!session || !user) return;

    try {
      const newEvent = {
        event_id: event.id,
        title: event.title,
        date: event.date,
        venue: event.venue,
        votes: {}
      };

      const updatedEvents = [...(session.selected_events || []), newEvent];

      await supabase
        .from('group_planning_sessions')
        .update({ selected_events: updatedEvents })
        .eq('id', session.id);

      toast.success(`Added "${event.title}" to planning session`);
    } catch (error) {
      console.error('Failed to add event:', error);
      toast.error('Failed to add event');
    }
  };

  const voteOnEvent = async (eventId: string, vote: 'yes' | 'no' | 'maybe') => {
    if (!session || !user) return;

    try {
      const updatedVotingData = {
        ...session.voting_data,
        [eventId]: {
          ...session.voting_data[eventId],
          [user.id]: vote
        }
      };

      await supabase
        .from('group_planning_sessions')
        .update({ voting_data: updatedVotingData })
        .eq('id', session.id);

      toast.success(`Voted "${vote}" on event`);
    } catch (error) {
      console.error('Failed to vote:', error);
      toast.error('Failed to vote');
    }
  };

  const getVoteCounts = (eventId: string) => {
    const votes = session?.voting_data[eventId] || {};
    return {
      yes: Object.values(votes).filter(v => v === 'yes').length,
      no: Object.values(votes).filter(v => v === 'no').length,
      maybe: Object.values(votes).filter(v => v === 'maybe').length
    };
  };

  const getUserVote = (eventId: string) => {
    if (!user || !session) return null;
    return session.voting_data[eventId]?.[user.id] || null;
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
              {/* Active Users */}
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {activeUsers.slice(0, 5).map((userId, index) => (
                    <Avatar key={userId} className="w-6 h-6 border-2 border-white">
                      <AvatarFallback className="text-xs">
                        {userId === user?.id ? 'You' : `U${index + 1}`}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {activeUsers.length > 5 && (
                    <div className="w-6 h-6 bg-muted rounded-full border-2 border-white flex items-center justify-center text-xs">
                      +{activeUsers.length - 5}
                    </div>
                  )}
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
            {/* Left Panel: Event Search & Selection */}
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
                    <Button onClick={searchEvents} disabled={isLoading}>
                      Search
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
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

                {/* Selected Events */}
                {session?.selected_events && session.selected_events.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Selected Events</h4>
                    {session.selected_events.map((event) => {
                      const voteCounts = getVoteCounts(event.event_id);
                      const userVote = getUserVote(event.event_id);
                      
                      return (
                        <Card key={event.event_id} className="p-3">
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
                            
                            {/* Voting */}
                            <div className="space-y-2">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={userVote === 'yes' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.event_id, 'yes')}
                                  className="flex-1 text-xs"
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Yes ({voteCounts.yes})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'maybe' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.event_id, 'maybe')}
                                  className="flex-1 text-xs"
                                >
                                  <Clock className="w-3 h-3 mr-1" />
                                  Maybe ({voteCounts.maybe})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'no' ? 'destructive' : 'outline'}
                                  onClick={() => voteOnEvent(event.event_id, 'no')}
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

            {/* Right Panel: Collaborative Notes */}
            <div className="p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-4 h-4" />
                <h3 className="font-semibold">Group Notes</h3>
                <Badge variant="outline" className="text-xs">
                  Live collaboration
                </Badge>
              </div>
              
              <Textarea
                placeholder="Add notes, ideas, or plans here... (updates in real-time)"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  updateNotes(e.target.value);
                }}
                className="flex-1 resize-none"
              />
              
              <div className="mt-4 text-xs text-muted-foreground">
                Changes are automatically saved and shared with your group
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}