import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCommunityFeatures } from "@/hooks/useCommunityFeatures";
import { Camera, Upload, Image as ImageIcon, Heart, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface EventPhotoUploadProps {
  eventId: string;
  eventTitle: string;
}

export function EventPhotoUpload({ eventId, eventTitle }: EventPhotoUploadProps) {
  const { user } = useAuth();
  const { uploadEventPhoto, getEventPhotos, loading } = useCommunityFeatures();
  const [isOpen, setIsOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    const result = await uploadEventPhoto(eventId, selectedFile, caption);
    if (result) {
      setIsOpen(false);
      setSelectedFile(null);
      setCaption('');
      loadPhotos(); // Refresh photos
    }
  };

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    const eventPhotos = await getEventPhotos(eventId);
    setPhotos(eventPhotos);
    setLoadingPhotos(false);
  };

  React.useEffect(() => {
    loadPhotos();
  }, [eventId]);

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Camera className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Sign in to upload and view event photos</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Event Photos
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Camera className="w-4 h-4" />
                Add Photo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Event Photo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Event: {eventTitle}</label>
                </div>
                
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full gap-2"
                    disabled={loading}
                  >
                    <Upload className="w-4 h-4" />
                    {selectedFile ? selectedFile.name : 'Choose Photo'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground">
                      File size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Caption (optional)</label>
                  <Textarea
                    placeholder="Add a caption for your photo..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || loading}
                    className="flex-1"
                  >
                    {loading ? 'Uploading...' : 'Upload Photo'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loadingPhotos ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-2">Loading photos...</p>
          </div>
        ) : photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.photo_url}
                  alt={photo.caption || 'Event photo'}
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-end p-2">
                  <div className="text-white text-xs">
                    {photo.caption && (
                      <p className="mb-1">{photo.caption}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {photo.helpful_votes}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No photos yet</p>
            <p className="text-sm text-muted-foreground">Be the first to share a photo from this event!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}