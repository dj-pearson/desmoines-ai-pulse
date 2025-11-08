import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export interface UseNativeShareReturn {
  share: (data: ShareData) => Promise<void>;
  isSupported: boolean;
  isSharing: boolean;
  copyToClipboard: (text: string) => Promise<void>;
}

/**
 * Custom hook for native mobile sharing functionality
 * Falls back to clipboard copy if Web Share API is not supported
 */
export function useNativeShare(): UseNativeShareReturn {
  const [isSharing, setIsSharing] = useState(false);

  const isSupported = typeof navigator !== 'undefined' &&
    'share' in navigator &&
    'canShare' in navigator;

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!', {
          duration: 2000,
        });
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();

        try {
          document.execCommand('copy');
          toast.success('Copied to clipboard!', {
            duration: 2000,
          });
        } catch (err) {
          toast.error('Failed to copy to clipboard');
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      toast.error('Failed to copy to clipboard');
    }
  }, []);

  const share = useCallback(async (data: ShareData) => {
    setIsSharing(true);

    try {
      if (isSupported && navigator.canShare && navigator.canShare(data)) {
        await navigator.share(data);
        toast.success('Shared successfully!', {
          duration: 2000,
        });
      } else {
        // Fallback: Copy URL to clipboard
        const shareText = data.url || data.text || data.title || '';
        if (shareText) {
          await copyToClipboard(shareText);
        } else {
          toast.error('Nothing to share');
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        // User cancelled the share
        if (error.name === 'AbortError') {
          console.log('Share cancelled by user');
        } else {
          console.error('Share failed:', error);
          toast.error('Failed to share');
        }
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSupported, copyToClipboard]);

  return {
    share,
    isSupported,
    isSharing,
    copyToClipboard,
  };
}

/**
 * Helper function to generate share data for events
 */
export function createEventShareData(event: {
  title: string;
  description?: string;
  slug: string;
}): ShareData {
  const url = `${window.location.origin}/events/${event.slug}`;
  return {
    title: event.title,
    text: event.description || `Check out ${event.title} on Des Moines AI Pulse!`,
    url,
  };
}

/**
 * Helper function to generate share data for restaurants
 */
export function createRestaurantShareData(restaurant: {
  name: string;
  description?: string;
  slug: string;
}): ShareData {
  const url = `${window.location.origin}/restaurants/${restaurant.slug}`;
  return {
    title: restaurant.name,
    text: restaurant.description || `Check out ${restaurant.name} on Des Moines AI Pulse!`,
    url,
  };
}
