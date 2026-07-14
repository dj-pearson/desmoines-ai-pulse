import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';

type IndexingType = 'URL_UPDATED' | 'URL_DELETED';

interface IndexingResult {
  url: string;
  status: 'success' | 'error';
  statusCode?: number;
  message?: string;
}

interface IndexingResponse {
  submitted: number;
  success: number;
  errors: number;
  results: IndexingResult[];
}

async function submitUrlsToGoogleIndexing(
  urls: string[],
  type: IndexingType = 'URL_UPDATED'
): Promise<IndexingResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Authentication required');
  }

  const { data, error } = await supabase.functions.invoke('gsc/google-indexing-api', {
    body: { urls, type },
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit URLs to Google Indexing API');
  }

  return data as IndexingResponse;
}

/**
 * Hook for submitting URLs to Google's Indexing API.
 *
 * Usage:
 *   const { submitUrls, submitUrl, removeUrl, isSubmitting } = useGoogleIndexing();
 *
 *   // Notify Google a URL was updated
 *   await submitUrl('https://example.com/page');
 *
 *   // Notify Google multiple URLs were updated
 *   await submitUrls(['https://example.com/page1', 'https://example.com/page2']);
 *
 *   // Notify Google a URL was removed
 *   await removeUrl('https://example.com/old-page');
 */
export function useGoogleIndexing() {
  const mutation = useMutation({
    mutationFn: ({ urls, type }: { urls: string[]; type: IndexingType }) =>
      submitUrlsToGoogleIndexing(urls, type),
    onError: (error) => {
      handleError(error, {
        component: 'useGoogleIndexing',
        action: 'submitUrls',
      });
    },
  });

  return {
    submitUrls: (urls: string[], type: IndexingType = 'URL_UPDATED') =>
      mutation.mutateAsync({ urls, type }),
    submitUrl: (url: string) =>
      mutation.mutateAsync({ urls: [url], type: 'URL_UPDATED' }),
    removeUrl: (url: string) =>
      mutation.mutateAsync({ urls: [url], type: 'URL_DELETED' }),
    isSubmitting: mutation.isPending,
    data: mutation.data,
    error: mutation.error,
    reset: mutation.reset,
  };
}
