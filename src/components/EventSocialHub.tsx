import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useEventSocial } from '@/hooks/useEventSocial';
import { useAuth } from '@/hooks/useAuth';
import {
  Users,
  MessageCircle,
  Heart,
  MapPin,
  Clock,
  Camera,
  Send,
  UserCheck,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { EventPhotoUpload } from './EventPhotoUpload';
import { EventPhotoGallery } from './EventPhotoGallery';

interface EventSocialHubProps {
  eventId: string;
  eventTitle: string;
  eventDate: string;
}

export function EventSocialHub({ eventId, eventTitle, eventDate }: EventSocialHubProps) {
  const { user } = useAuth();
  const {
    attendees,
    discussions,
    liveStats,
    userAttendanceStatus,
    isCheckedIn,
    isLoading,
    updateAttendanceStatus,
    checkInToEvent,
    addDiscussion,
    likeDiscussion,
  } = useEventSocial(eventId);

  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user) return;

    setIsSubmitting(true);
    try {
      await addDiscussion(newComment);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAttendanceStatusColor = (status: string) => {
    switch (status) {
      case 'going': return 'bg-green-500';
      case 'interested': return 'bg-blue-500';
      case 'maybe': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getAttendanceStatusText = (status: string) => {
    switch (status) {
      case 'going': return 'Going';
      case 'interested': return 'Interested';
      case 'maybe': return 'Maybe';
      default: return 'Unknown';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live Stats Header */}
      <Card className="bg-gradient-to-r from-primary/10 to-accent/10">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <Users className="h-5 w-5 text-primary mr-2" />
                <span className="text-2xl font-bold text-primary">
                  {liveStats?.current_attendees || 0}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Going</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-2xl font-bold text-green-600">
                  {liveStats?.total_checkins || 0}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Checked In</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-2xl font-bold text-blue-600">
                  {liveStats?.discussion_count || 0}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Comments</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-orange-600 mr-2" />
                <span className="text-2xl font-bold text-orange-600">
                  {Math.round(Math.random() * 100)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Buzz Score</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Actions */}
      {user && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium mb-3">Your Status:</p>
                <div className="flex gap-2">
                  {(['going', 'interested', 'maybe'] as const).map((status) => (
                    <Button
                      key={status}
                      variant={userAttendanceStatus === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => updateAttendanceStatus(status)}
                      className={userAttendanceStatus === status ? getAttendanceStatusColor(status) : ''}
                    >
                      {getAttendanceStatusText(status)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                {!isCheckedIn ? (
                  <Button onClick={checkInToEvent} className="bg-green-600 hover:bg-green-700">
                    <MapPin className="h-4 w-4 mr-2" />
                    Check In
                  </Button>
                ) : (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <UserCheck className="h-4 w-4 mr-2" />
                    Checked In
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social Tabs */}
      <Tabs defaultValue="feed" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="feed">Live Feed</TabsTrigger>
          <TabsTrigger value="photos">
            Photos ({discussions.filter(d => d.message_type === 'photo').length})
          </TabsTrigger>
          <TabsTrigger value="attendees">
            Who's Going ({attendees.length})
          </TabsTrigger>
          <TabsTrigger value="discussion">
            Discussion ({discussions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Live Event Feed
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {discussions.slice(0, 5).map((discussion) => (
                <div key={discussion.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">
                        {discussion.message_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(discussion.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm">{discussion.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => likeDiscussion(discussion.id)}
                        className="h-6 px-2"
                      >
                        <Heart className="h-3 w-3 mr-1" />
                        {discussion.likes_count}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {discussions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No discussions yet. Be the first to comment!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="space-y-4">
          <EventPhotoGallery
            eventId={eventId}
            discussions={discussions}
            onLikePhoto={likeDiscussion}
          />
        </TabsContent>

        <TabsContent value="attendees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Who's Going
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {attendees.map((attendee) => (
                  <div key={attendee.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">User</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(attendee.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <Badge className={getAttendanceStatusColor(attendee.status)}>
                      {getAttendanceStatusText(attendee.status)}
                    </Badge>
                  </div>
                ))}
                
                {attendees.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No one has RSVP'd yet. Be the first!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion" className="space-y-4">
          {/* Comment Input */}
          {user && (
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>You</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <Textarea
                      placeholder="Share your thoughts about this event..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <div className="flex justify-between">
                      <EventPhotoUpload
                        eventId={eventId}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Camera className="h-4 w-4 mr-2" />
                            Add Photo
                          </Button>
                        }
                      />
                      <Button 
                        onClick={handleSubmitComment} 
                        disabled={!newComment.trim() || isSubmitting}
                        size="sm"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Post Comment
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Discussion List */}
          <Card>
            <CardHeader>
              <CardTitle>All Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {discussions.map((discussion, index) => (
                <div key={discussion.id}>
                  <div className="flex gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">User</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(discussion.created_at), { addSuffix: true })}
                        </span>
                        {discussion.message_type !== 'comment' && (
                          <Badge variant="secondary" className="text-xs">
                            {discussion.message_type}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed mb-3">{discussion.message}</p>
                      <div className="flex items-center gap-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => likeDiscussion(discussion.id)}
                          className="h-7 px-2 text-muted-foreground hover:text-red-500"
                        >
                          <Heart className="h-4 w-4 mr-1" />
                          {discussion.likes_count}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                          Reply
                        </Button>
                      </div>
                    </div>
                  </div>
                  {index < discussions.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
              
              {discussions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No comments yet. Start the conversation!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}