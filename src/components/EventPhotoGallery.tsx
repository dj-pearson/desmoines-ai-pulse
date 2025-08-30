import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EventDiscussion } from '@/hooks/useEventSocial';
import { Heart, MessageCircle, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface EventPhotoGalleryProps {
  eventId: string;
  discussions: EventDiscussion[];
  onLikePhoto?: (discussionId: string) => void;
}

export function EventPhotoGallery({ eventId, discussions, onLikePhoto }: EventPhotoGalleryProps) {
  const photoDiscussions = discussions.filter(d => d.message_type === 'photo' && d.media_url);

  if (photoDiscussions.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No photos shared yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Event Photos
          <Badge variant="secondary">{photoDiscussions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photoDiscussions.map((discussion) => (
            <PhotoThumbnail
              key={discussion.id}
              discussion={discussion}
              onLike={onLikePhoto}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface PhotoThumbnailProps {
  discussion: EventDiscussion;
  onLike?: (discussionId: string) => void;
}

function PhotoThumbnail({ discussion, onLike }: PhotoThumbnailProps) {
  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLike) {
      onLike(discussion.id);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="group cursor-pointer relative overflow-hidden rounded-lg border bg-card hover:shadow-md transition-all">
          <div className="aspect-square">
            <img
              src={discussion.media_url!}
              alt={discussion.message}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/placeholder.svg';
              }}
            />
          </div>
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          
          {/* Stats overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <div className="flex items-center justify-between text-white text-xs">
              <div className="flex items-center">
                <User className="h-3 w-3 mr-1" />
                <span>User</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <Heart className="h-3 w-3 mr-1" />
                  <span>{discussion.likes_count}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl p-0">
        <div className="flex flex-col md:flex-row">
          {/* Photo */}
          <div className="flex-1 bg-black">
            <img
              src={discussion.media_url!}
              alt={discussion.message}
              className="w-full h-full object-contain max-h-[70vh]"
            />
          </div>
          
          {/* Details */}
          <div className="w-full md:w-80 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium">User</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(discussion.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            
            {discussion.message && discussion.message !== 'Shared a photo' && (
              <div>
                <p className="text-sm">{discussion.message}</p>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex items-center gap-4 pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                className="flex items-center gap-2 hover:text-red-500"
              >
                <Heart className="h-4 w-4" />
                <span>{discussion.likes_count}</span>
              </Button>
              
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                <span>Comment</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}