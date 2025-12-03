import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Video, Upload, X, Loader2, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Supported video formats
const SUPPORTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

// File extension to MIME type mapping
const VIDEO_EXTENSIONS: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
};

// Max file size (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Max video duration (5 minutes)
const MAX_DURATION_SECONDS = 300;

export interface VideoUploadProps {
  contentType?: "event" | "restaurant" | "attraction" | "article" | "general";
  contentId?: string;
  onVideoUploaded?: (videoUrl: string, thumbnailUrl?: string, caption?: string) => void;
  trigger?: React.ReactNode;
  maxDuration?: number;
  maxFileSize?: number;
  className?: string;
}

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

/**
 * Extract video metadata from file
 */
async function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Generate video thumbnail from first frame
 */
async function generateThumbnail(file: File, seekTime: number = 1): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = Math.min(seekTime, video.duration);
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src);
            resolve(blob);
          },
          "image/jpeg",
          0.8
        );
      } else {
        URL.revokeObjectURL(video.src);
        resolve(null);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Format duration in seconds to human readable format
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format file size to human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoUpload({
  contentType = "general",
  contentId,
  onVideoUploaded,
  trigger,
  maxDuration = MAX_DURATION_SECONDS,
  maxFileSize = MAX_FILE_SIZE,
  className,
}: VideoUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
        return `Unsupported video format. Please use: ${Object.keys(VIDEO_EXTENSIONS).join(", ")}`;
      }

      // Check file size
      if (file.size > maxFileSize) {
        return `File size exceeds maximum of ${formatFileSize(maxFileSize)}`;
      }

      return null;
    },
    [maxFileSize]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file
      const error = validateFile(file);
      if (error) {
        toast({
          title: "Invalid file",
          description: error,
          variant: "destructive",
        });
        return;
      }

      try {
        // Get video metadata
        const videoMetadata = await getVideoMetadata(file);

        // Check duration
        if (videoMetadata.duration > maxDuration) {
          toast({
            title: "Video too long",
            description: `Maximum video duration is ${formatDuration(maxDuration)}`,
            variant: "destructive",
          });
          return;
        }

        setMetadata(videoMetadata);
        setSelectedFile(file);

        // Create preview URL
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        // Generate thumbnail
        const thumbnail = await generateThumbnail(file);
        if (thumbnail) {
          setThumbnailUrl(URL.createObjectURL(thumbnail));
        }
      } catch (err) {
        console.error("Error processing video:", err);
        toast({
          title: "Error processing video",
          description: "Failed to read video file. Please try another file.",
          variant: "destructive",
        });
      }
    },
    [maxDuration, toast, validateFile]
  );

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Upload video file
      const fileExt = selectedFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const timestamp = Date.now();
      const fileName = `${user.id}/${contentType}/${timestamp}.${fileExt}`;

      // Simulate progress for large files
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, selectedFile, {
          contentType: selectedFile.type,
          cacheControl: "3600",
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("videos")
        .getPublicUrl(fileName);

      const videoUrl = urlData.publicUrl;
      let uploadedThumbnailUrl: string | undefined;

      // Upload thumbnail if generated
      if (thumbnailUrl) {
        try {
          const thumbnailResponse = await fetch(thumbnailUrl);
          const thumbnailBlob = await thumbnailResponse.blob();
          const thumbnailPath = `${user.id}/${contentType}/${timestamp}_thumb.jpg`;

          const { error: thumbError } = await supabase.storage
            .from("thumbnails")
            .upload(thumbnailPath, thumbnailBlob, {
              contentType: "image/jpeg",
              cacheControl: "3600",
            });

          if (!thumbError) {
            const { data: thumbUrlData } = supabase.storage
              .from("thumbnails")
              .getPublicUrl(thumbnailPath);
            uploadedThumbnailUrl = thumbUrlData.publicUrl;
          }
        } catch (thumbErr) {
          console.error("Failed to upload thumbnail:", thumbErr);
        }
      }

      // Create media asset record
      await supabase.from("media_assets").insert({
        user_id: user.id,
        file_name: `${timestamp}.${fileExt}`,
        original_file_name: selectedFile.name,
        file_path: fileName,
        bucket_id: "videos",
        mime_type: selectedFile.type,
        file_size: selectedFile.size,
        width: metadata?.width || null,
        height: metadata?.height || null,
        duration_seconds: metadata?.duration || null,
        content_type: contentType,
        content_id: contentId || null,
        processing_status: "completed",
        optimized_versions: uploadedThumbnailUrl
          ? { thumbnail: uploadedThumbnailUrl }
          : {},
      });

      setUploadProgress(100);

      toast({
        title: "Video uploaded!",
        description: "Your video has been uploaded successfully",
      });

      // Cleanup and close
      clearSelection();
      setIsOpen(false);

      // Callback
      if (onVideoUploaded) {
        onVideoUploaded(videoUrl, uploadedThumbnailUrl, caption || undefined);
      }
    } catch (error) {
      console.error("Error uploading video:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearSelection = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (thumbnailUrl) {
      URL.revokeObjectURL(thumbnailUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setThumbnailUrl(null);
    setCaption("");
    setMetadata(null);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [previewUrl, thumbnailUrl]);

  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm" className={className}>
      <Video className="h-4 w-4 mr-2" />
      Add Video
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Video</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload Area */}
          {!selectedFile ? (
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Upload a video from your device
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Max {formatFileSize(maxFileSize)} • Max {formatDuration(maxDuration)}
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="mx-auto"
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose Video
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_VIDEO_TYPES.join(",")}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Video Preview */}
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  src={previewUrl!}
                  className="w-full h-48 object-contain"
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                />
                <button
                  onClick={togglePlayback}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="h-12 w-12 text-white" />
                  ) : (
                    <Play className="h-12 w-12 text-white" />
                  )}
                </button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={clearSelection}
                  className="absolute top-2 right-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Video Info */}
              {metadata && (
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{formatDuration(metadata.duration)}</span>
                  <span>
                    {metadata.width}x{metadata.height}
                  </span>
                  <span>{formatFileSize(selectedFile.size)}</span>
                </div>
              )}

              {/* Caption */}
              <div className="space-y-2">
                <Label htmlFor="video-caption">Caption (optional)</Label>
                <Textarea
                  id="video-caption"
                  placeholder="Add a description for this video..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={clearSelection}
                  disabled={isUploading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !user}
                  className="flex-1"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? "Uploading..." : "Upload Video"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VideoUpload;
