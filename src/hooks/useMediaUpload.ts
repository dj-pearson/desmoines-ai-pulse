import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/lib/logger';

const log = createLogger('useMediaUpload');

export interface MediaUploadOptions {
  bucket?: 'media' | 'videos' | 'event-photos' | 'ad-creatives';
  contentType?: 'event' | 'restaurant' | 'attraction' | 'article' | 'profile' | 'general';
  contentId?: string;
  generateThumbnail?: boolean;
  optimizeImage?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  altText?: string;
  title?: string;
  tags?: string[];
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  mimeType: string;
  fileSize: number;
  blurHash?: string;
}

export interface MediaUploadState {
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
  result: UploadResult | null;
}

// Supported image MIME types
const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
];

// Supported video MIME types
const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];

// File size limits by bucket (in bytes)
const FILE_SIZE_LIMITS: Record<string, number> = {
  media: 10 * 1024 * 1024, // 10MB
  videos: 100 * 1024 * 1024, // 100MB
  'event-photos': 5 * 1024 * 1024, // 5MB
  'ad-creatives': 5 * 1024 * 1024, // 5MB
};

/**
 * Get image dimensions from a file
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Get video dimensions and duration
 */
async function getVideoDimensions(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Resize image client-side if needed
 */
async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.85
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = await getImageDimensions(file);

  // Check if resize is needed
  if (width <= maxWidth && height <= maxHeight) {
    return { blob: file, width, height };
  }

  // Calculate new dimensions maintaining aspect ratio
  let newWidth = width;
  let newHeight = height;

  if (width > maxWidth) {
    newWidth = maxWidth;
    newHeight = Math.round((height * maxWidth) / width);
  }

  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = Math.round((width * maxHeight) / height);
  }

  // Create canvas and resize
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for resize'));
    img.src = URL.createObjectURL(file);
  });

  ctx.drawImage(img, 0, 0, newWidth, newHeight);
  URL.revokeObjectURL(img.src);

  // Convert to blob
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
      outputType,
      quality
    );
  });

  return { blob, width: newWidth, height: newHeight };
}

/**
 * Generate a simple blur hash placeholder (simplified version)
 */
function generatePlaceholderColor(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#808080';

  // Sample the center pixel
  const imageData = ctx.getImageData(
    Math.floor(canvas.width / 2),
    Math.floor(canvas.height / 2),
    1,
    1
  );
  const [r, g, b] = imageData.data;
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Hook for uploading media files to Supabase Storage
 */
export function useMediaUpload() {
  const { user } = useAuth();
  const [state, setState] = useState<MediaUploadState>({
    isUploading: false,
    progress: null,
    error: null,
    result: null,
  });

  const validateFile = useCallback((file: File, bucket: string): string | null => {
    // Check file size
    const maxSize = FILE_SIZE_LIMITS[bucket] || FILE_SIZE_LIMITS.media;
    if (file.size > maxSize) {
      return `File size exceeds maximum of ${Math.round(maxSize / 1024 / 1024)}MB`;
    }

    // Check MIME type
    const isImage = IMAGE_MIME_TYPES.includes(file.type);
    const isVideo = VIDEO_MIME_TYPES.includes(file.type);

    if (bucket === 'videos' && !isVideo) {
      return 'Only video files are allowed in this bucket';
    }

    if (bucket !== 'videos' && !isImage) {
      return 'Only image files are allowed';
    }

    return null;
  }, []);

  const upload = useCallback(
    async (file: File, options: MediaUploadOptions = {}): Promise<UploadResult> => {
      const {
        bucket = 'media',
        contentType = 'general',
        contentId,
        generateThumbnail = true,
        optimizeImage = true,
        maxWidth = 1920,
        maxHeight = 1080,
        quality = 0.85,
        altText,
        title,
        tags = [],
      } = options;

      setState({
        isUploading: true,
        progress: { loaded: 0, total: file.size, percentage: 0 },
        error: null,
        result: null,
      });

      try {
        // Validate file
        const validationError = validateFile(file, bucket);
        if (validationError) {
          throw new Error(validationError);
        }

        const isImage = IMAGE_MIME_TYPES.includes(file.type);
        const isVideo = VIDEO_MIME_TYPES.includes(file.type);

        let uploadBlob: Blob = file;
        let dimensions = { width: 0, height: 0 };
        let duration: number | undefined;
        let dominantColor: string | undefined;

        // Get dimensions and optionally resize images
        if (isImage) {
          if (optimizeImage && file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
            const resized = await resizeImage(file, maxWidth, maxHeight, quality);
            uploadBlob = resized.blob;
            dimensions = { width: resized.width, height: resized.height };
          } else {
            dimensions = await getImageDimensions(file);
          }
        } else if (isVideo) {
          const videoInfo = await getVideoDimensions(file);
          dimensions = { width: videoInfo.width, height: videoInfo.height };
          duration = videoInfo.duration;
        }

        // Generate file path
        const userId = user?.id || 'anonymous';
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${userId}/${contentType}/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, uploadBlob, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Create media asset record
        const { data: assetData, error: assetError } = await supabase
          .from('media_assets')
          .insert({
            user_id: user?.id || null,
            file_name: fileName,
            original_file_name: file.name,
            file_path: filePath,
            bucket_id: bucket,
            mime_type: file.type,
            file_size: uploadBlob.size,
            width: dimensions.width || null,
            height: dimensions.height || null,
            duration_seconds: duration || null,
            alt_text: altText || null,
            title: title || file.name,
            tags: tags,
            content_type: contentType,
            content_id: contentId || null,
            dominant_color: dominantColor || null,
            processing_status: generateThumbnail && isImage ? 'pending' : 'completed',
          })
          .select()
          .single();

        if (assetError) {
          log.error('Failed to create media asset record', { action: 'upload', metadata: { error: assetError } });
          // Don't throw - file is uploaded, just record failed
        }

        // Queue for optimization if needed
        if (assetData && generateThumbnail && isImage) {
          await supabase.from('image_optimization_queue').insert({
            media_asset_id: assetData.id,
            source_url: publicUrl,
            generate_webp: true,
            generate_avif: true,
            generate_thumbnail: true,
          });
        }

        const result: UploadResult = {
          id: assetData?.id || uploadData.path,
          url: publicUrl,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: file.type,
          fileSize: uploadBlob.size,
        };

        setState({
          isUploading: false,
          progress: { loaded: uploadBlob.size, total: uploadBlob.size, percentage: 100 },
          error: null,
          result,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setState({
          isUploading: false,
          progress: null,
          error: errorMessage,
          result: null,
        });
        throw error;
      }
    },
    [user, validateFile]
  );

  const uploadMultiple = useCallback(
    async (files: File[], options: MediaUploadOptions = {}): Promise<UploadResult[]> => {
      const results: UploadResult[] = [];

      for (const file of files) {
        const result = await upload(file, options);
        results.push(result);
      }

      return results;
    },
    [upload]
  );

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: null,
      error: null,
      result: null,
    });
  }, []);

  return {
    ...state,
    upload,
    uploadMultiple,
    reset,
    validateFile,
  };
}

export default useMediaUpload;
