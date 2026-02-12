/**
 * Content Queue Hook
 * Manages content submissions awaiting approval
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { validateContent, autoFixContent, ContentValidationReport } from '@/lib/contentValidation';
import { createLogger } from '@/lib/logger';

const log = createLogger('useContentQueue');

export interface QueueItem {
  id: string;
  content_type: 'event' | 'restaurant' | 'attraction' | 'playground' | 'article';
  content_id?: string;
  content_data: any;
  status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  confidence_score: number;
  validation_results: any;
  submitted_by?: string;
  reviewed_by?: string;
  submitted_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  submitter_email?: string;
}

/**
 * Hook to manage content queue
 */
export function useContentQueue(filters?: {
  status?: string;
  contentType?: string;
  minConfidence?: number;
}) {
  const queryClient = useQueryClient();

  // Fetch queue items
  const { data: queueItems = [], isLoading, refetch } = useQuery({
    queryKey: ['content-queue', filters],
    queryFn: async () => {
      let query = supabase
        .from('content_queue')
        .select(`
          *,
          profiles:submitted_by (
            email
          )
        `)
        .order('submitted_at', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.contentType && filters.contentType !== 'all') {
        query = query.eq('content_type', filters.contentType);
      }

      if (filters?.minConfidence) {
        query = query.gte('confidence_score', filters.minConfidence);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      return (data || []).map(item => ({
        ...item,
        submitter_email: (item as any).profiles?.email || 'Unknown'
      })) as QueueItem[];
    },
    staleTime: 1000 * 30 // 30 seconds
  });

  // Submit content to queue
  const submitToQueue = useMutation({
    mutationFn: async ({
      contentType,
      contentData,
      userId
    }: {
      contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
      contentData: any;
      userId?: string;
    }) => {
      // Validate content
      const validationReport = validateContent(contentType, contentData);

      // Auto-fix if possible
      const fixedContent = autoFixContent(contentData, validationReport.results);

      // Insert into queue
      const { data, error } = await supabase
        .from('content_queue')
        .insert({
          content_type: contentType,
          content_data: fixedContent,
          status: validationReport.autoApprovalRecommended ? 'pending' : 'needs_review',
          confidence_score: validationReport.confidenceScore,
          validation_results: validationReport.results,
          submitted_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      return { data, validationReport };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['content-queue'] });

      if (result.validationReport.autoApprovalRecommended) {
        toast.success('Content submitted for quick approval (high confidence)');
      } else {
        toast.info(`Content submitted for review (${result.validationReport.criticalErrors} issues found)`);
      }
    },
    onError: (error) => {
      log.error('Failed to submit content', { action: 'submitToQueue', metadata: { error } });
      toast.error('Failed to submit content to queue');
    }
  });

  // Approve queue item
  const approveItem = useMutation({
    mutationFn: async ({
      queueId,
      reviewerId,
      publishImmediately = true
    }: {
      queueId: string;
      reviewerId: string;
      publishImmediately?: boolean;
    }) => {
      // Get the queue item
      const { data: queueItem, error: fetchError } = await supabase
        .from('content_queue')
        .select('*')
        .eq('id', queueId)
        .single();

      if (fetchError) throw fetchError;

      let contentId = queueItem.content_id;

      // If should publish, insert into appropriate table
      if (publishImmediately) {
        const tableName = queueItem.content_type === 'event' ? 'events' :
                         queueItem.content_type === 'restaurant' ? 'restaurants' :
                         queueItem.content_type === 'attraction' ? 'attractions' :
                         queueItem.content_type === 'playground' ? 'playgrounds' :
                         null;

        if (tableName) {
          const { data: insertedContent, error: insertError } = await supabase
            .from(tableName)
            .insert(queueItem.content_data)
            .select()
            .single();

          if (insertError) throw insertError;
          contentId = insertedContent.id;
        }
      }

      // Update queue item status
      const { data, error } = await supabase
        .from('content_queue')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          content_id: contentId
        })
        .eq('id', queueId)
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-queue'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      queryClient.invalidateQueries({ queryKey: ['playgrounds'] });
      toast.success('Content approved and published');
    },
    onError: (error) => {
      log.error('Failed to approve content', { action: 'approveItem', metadata: { error } });
      toast.error('Failed to approve content');
    }
  });

  // Reject queue item
  const rejectItem = useMutation({
    mutationFn: async ({
      queueId,
      reviewerId,
      reason
    }: {
      queueId: string;
      reviewerId: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('content_queue')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason
        })
        .eq('id', queueId)
        .select()
        .single();

      if (error) throw error;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-queue'] });
      toast.success('Content rejected');
    },
    onError: (error) => {
      log.error('Failed to reject content', { action: 'rejectItem', metadata: { error } });
      toast.error('Failed to reject content');
    }
  });

  // Bulk approve high-confidence items
  const bulkApproveHighConfidence = useMutation({
    mutationFn: async ({
      reviewerId,
      minConfidence = 95
    }: {
      reviewerId: string;
      minConfidence?: number;
    }) => {
      // Get high confidence pending items
      const { data: items, error: fetchError } = await supabase
        .from('content_queue')
        .select('*')
        .eq('status', 'pending')
        .gte('confidence_score', minConfidence);

      if (fetchError) throw fetchError;

      if (!items || items.length === 0) {
        throw new Error('No high-confidence items to approve');
      }

      // Approve each item
      const approvalPromises = items.map(async (item) => {
        // Determine table name
        const tableName = item.content_type === 'event' ? 'events' :
                         item.content_type === 'restaurant' ? 'restaurants' :
                         item.content_type === 'attraction' ? 'attractions' :
                         item.content_type === 'playground' ? 'playgrounds' :
                         null;

        if (!tableName) return null;

        // Insert content
        const { data: insertedContent, error: insertError } = await supabase
          .from(tableName)
          .insert(item.content_data)
          .select()
          .single();

        if (insertError) {
          log.error(`Failed to insert ${item.content_type}`, { action: 'bulkApproveHighConfidence', metadata: { error: insertError } });
          return null;
        }

        // Update queue status
        await supabase
          .from('content_queue')
          .update({
            status: 'approved',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
            content_id: insertedContent.id
          })
          .eq('id', item.id);

        return insertedContent;
      });

      const results = await Promise.all(approvalPromises);
      const successCount = results.filter(r => r !== null).length;

      return { total: items.length, successful: successCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['content-queue'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      queryClient.invalidateQueries({ queryKey: ['attractions'] });
      queryClient.invalidateQueries({ queryKey: ['playgrounds'] });
      toast.success(`Bulk approved ${result.successful} of ${result.total} items`);
    },
    onError: (error: any) => {
      log.error('Bulk approval failed', { action: 'bulkApproveHighConfidence', metadata: { error } });
      toast.error(error.message || 'Bulk approval failed');
    }
  });

  // Get queue statistics
  const stats = {
    total: queueItems.length,
    pending: queueItems.filter(i => i.status === 'pending').length,
    needsReview: queueItems.filter(i => i.status === 'needs_review').length,
    highConfidence: queueItems.filter(i => i.confidence_score >= 90).length,
    lowConfidence: queueItems.filter(i => i.confidence_score < 70).length
  };

  return {
    queueItems,
    isLoading,
    stats,
    refetch,
    submitToQueue,
    approveItem,
    rejectItem,
    bulkApproveHighConfidence
  };
}
