import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME, GC_TIME } from '@/lib/queryConfig';

const log = createLogger('useArticles');

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  author_id: string;
  status: string;
  category: string;
  tags: string[];
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
  view_count: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
  generated_from_suggestion_id?: string;
  is_auto_published?: boolean;
  quality_score?: number | null;
  pipeline_reasons?: string[] | null;
}

export interface CreateArticleData {
  title: string;
  content: string;
  excerpt?: string;
  featured_image_url?: string;
  status?: string;
  category?: string;
  tags?: string[];
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
}

export interface UpdateArticleData extends Partial<CreateArticleData> {
  id: string;
}

export const useArticles = (options?: { autoLoad?: boolean }) => {
  // WEB-PERF-028. The LIST is a query now; these two remain for the mutations
  // below, which report their own progress and failures through the same
  // `loading` and `error` fields callers already read.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // WEB-PERF-028. This fetched in useEffect with useState, so /articles cached
  // nothing across navigation AND was invisible to PrerenderSignal, which
  // counts TanStack queries only. prerender.mjs captured a skeleton on 2 of 4
  // builds because of exactly that.
  //
  // The explicit generic matters here for the same reason as the other hooks:
  // callers are typed against Article[], and an inferred row type is not it.
  const {
    data: articleData,
    isLoading,
    error: queryError,
  } = useQuery<Article[]>({
    queryKey: queryKeys.articles.list({ status: statusFilter ?? 'all' }),
    queryFn: async () => {
      let query = supabase
        .from('articles')
        .select('*')
        .order('updated_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      // No status, or 'all', loads every article without filtering.

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Article[];
    },
    // Preserves the old `autoLoad: false` contract: that option meant "do not
    // fetch on mount", and callers still call loadArticles() themselves.
    enabled: options?.autoLoad !== false,
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  const articles = articleData ?? [];

  /**
   * Reload the list, optionally narrowing to a status.
   *
   * Same signature the mutations and callers already use. Passing a status now
   * changes the query key rather than re-running an imperative fetch, so two
   * views asking for different statuses no longer overwrite each other.
   */
  const loadArticles = useCallback(
    async (status?: string) => {
      if (status !== undefined) setStatusFilter(status);
      await queryClient.invalidateQueries({ queryKey: queryKeys.articles.lists() });
    },
    [queryClient],
  );

  // The old loader toasted on failure. useQuery reports the error instead of
  // throwing at a call site, so the toast moves here to keep the behaviour.
  useEffect(() => {
    if (!queryError) return;
    const message = queryError instanceof Error ? queryError.message : 'Failed to load articles';
    log.error('loadArticles', 'Error loading articles', { error: queryError });
    toast({
      title: 'Error loading articles',
      description: message,
      variant: 'destructive',
    });
  }, [queryError, toast]);

  const getArticleBySlug = async (slug: string): Promise<Article | null> => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) throw error;

      // Increment view count
      if (data) {
        await supabase
          .from('articles')
          .update({ view_count: data.view_count + 1 })
          .eq('id', data.id);
      }

      return data;
    } catch (err: any) {
      log.error('getArticleBySlug', 'Error getting article by slug', { error: err });
      setMutationError(err.message);
      return null;
    }
  };

  const createArticle = async (articleData: CreateArticleData): Promise<Article | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('articles')
        .insert({
          title: articleData.title,
          slug: '', // Will be auto-generated by trigger
          content: articleData.content,
          excerpt: articleData.excerpt,
          featured_image_url: articleData.featured_image_url,
          author_id: user.id,
          status: articleData.status || 'draft',
          category: articleData.category || 'General',
          tags: articleData.tags || [],
          seo_title: articleData.seo_title,
          seo_description: articleData.seo_description,
          seo_keywords: articleData.seo_keywords || [],
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Article created',
        description: 'Your article has been created successfully.',
      });

      // Refresh articles list
      await loadArticles();

      return data;
    } catch (err: any) {
      log.error('createArticle', 'Error creating article', { error: err });
      setMutationError(err.message);
      toast({
        title: 'Error creating article',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const updateArticle = async (articleData: UpdateArticleData): Promise<Article | null> => {
    try {
      const { id, ...updateData } = articleData;
      
      const { data, error } = await supabase
        .from('articles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Article updated',
        description: 'Your article has been updated successfully.',
      });

      // Refresh articles list
      await loadArticles();

      return data;
    } catch (err: any) {
      log.error('updateArticle', 'Error updating article', { error: err });
      setMutationError(err.message);
      toast({
        title: 'Error updating article',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const deleteArticle = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Article deleted',
        description: 'The article has been deleted successfully.',
      });

      // Refresh articles list
      await loadArticles();

      return true;
    } catch (err: any) {
      log.error('deleteArticle', 'Error deleting article', { error: err });
      setMutationError(err.message);
      toast({
        title: 'Error deleting article',
        description: err.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const publishArticle = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({ 
          status: 'published',
          published_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Article published',
        description: 'Your article is now live and visible to the public.',
      });

      await loadArticles();
      return true;
    } catch (err: any) {
      log.error('publishArticle', 'Error publishing article', { error: err });
      setMutationError(err.message);
      toast({
        title: 'Error publishing article',
        description: err.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const generateArticleFromSuggestion = async (suggestionId: string, customPrompt?: string): Promise<Article | null> => {
    try {
      setMutating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-article', {
        body: { suggestionId, customPrompt }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Article generated!',
          description: 'Your article has been generated from the AI suggestion.',
        });

        await loadArticles();
        return data.article;
      } else {
        throw new Error(data.error || 'Failed to generate article');
      }
    } catch (err: any) {
      log.error('generateArticle', 'Error generating article', { error: err });
      setMutationError(err.message);
      toast({
        title: 'Error generating article',
        description: err.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setMutating(false);
    }
  };

  // The mount fetch is the query's `enabled` flag now, so no effect is needed.

  // The exact surface callers already read. `loading` and `error` merge the
  // query with the mutations, which is what the single pair of state variables
  // used to do implicitly.
  return {
    articles,
    loading: isLoading || mutating,
    error:
      mutationError ??
      (queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load articles') : null),
    loadArticles,
    getArticleBySlug,
    createArticle,
    updateArticle,
    deleteArticle,
    publishArticle,
    generateArticleFromSuggestion,
  };
};