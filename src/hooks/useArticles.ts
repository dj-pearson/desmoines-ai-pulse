import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME, GC_TIME } from '@/lib/queryConfig';
import { recordArticleView } from "@/lib/recordArticleView";
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { applyEventVisibility } from '@/lib/eventQuery';
import { attractionHref, eventHref, restaurantHref } from '@/lib/dashboardItems';
import { formatEventDateShort } from '@/lib/timezone';
import type { HubKey } from '@/lib/articleHubs';
import { KIDS_EVENTS_FILTER } from '@/hooks/useEventLanding';

const log = createLogger('useArticles');

function errorMessage(err: unknown): string {
  // PostgREST errors are plain objects with a message on some supabase-js
  // versions, so check the shape rather than the prototype.
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return String(err);
}

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

export const useArticles = (options?: { autoLoad?: boolean; status?: string; limit?: number }) => {
  // WEB-PERF-028. The LIST is a query now; these two remain for the mutations
  // below, which report their own progress and failures through the same
  // `loading` and `error` fields callers already read.
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(options?.status);
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
    queryKey: queryKeys.articles.list({ status: statusFilter ?? 'all', limit: options?.limit ?? 0 }),
    queryFn: async () => {
      let query = supabase
        .from('articles')
        .select('*')
        .order('updated_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      // No status, or 'all', loads every article without filtering. That is
      // the ADMIN case - the editors and ArticlesManager need drafts.

      // A bound, so one page cannot grow into an unbounded response as the
      // archive does. The public list paginates client-side below this.
      if (options?.limit) query = query.limit(options.limit);

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
    } catch (err: unknown) {
      log.error('createArticle', 'Error creating article', { error: err });
      setMutationError(errorMessage(err));
      toast({
        title: 'Error creating article',
        description: errorMessage(err),
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
    } catch (err: unknown) {
      log.error('updateArticle', 'Error updating article', { error: err });
      setMutationError(errorMessage(err));
      toast({
        title: 'Error updating article',
        description: errorMessage(err),
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
    } catch (err: unknown) {
      log.error('deleteArticle', 'Error deleting article', { error: err });
      setMutationError(errorMessage(err));
      toast({
        title: 'Error deleting article',
        description: errorMessage(err),
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
    } catch (err: unknown) {
      log.error('publishArticle', 'Error publishing article', { error: err });
      setMutationError(errorMessage(err));
      toast({
        title: 'Error publishing article',
        description: errorMessage(err),
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
    } catch (err: unknown) {
      log.error('generateArticle', 'Error generating article', { error: err });
      setMutationError(errorMessage(err));
      toast({
        title: 'Error generating article',
        description: errorMessage(err),
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
    createArticle,
    updateArticle,
    deleteArticle,
    publishArticle,
    generateArticleFromSuggestion,
  };
};
// ---------------------------------------------------------------------------
// Public reads (Plan & Stay WP4). Everything below is what /articles and
// /articles/:slug use; the useArticles() hook above stays the admin surface,
// which needs drafts and bodies.
// ---------------------------------------------------------------------------

/** Cards per "Load more". */
export const ARTICLE_PAGE_SIZE = 12;

/**
 * The list projection. No `content`: the list rendered the body only to count
 * words for a read-time label. `word_count` (20260919000010) would bring that
 * label back, but it is not in the 2026-08-24 production snapshot, and a
 * missing column 42703s the whole select - so it waits for a schema probe.
 */
export const ARTICLE_LIST_COLUMNS =
  'id, slug, title, excerpt, category, tags, featured_image_url, published_at, created_at, updated_at, view_count, is_auto_published, generated_from_suggestion_id';

/** The detail projection: everything the page and its head render, nothing else. */
export const ARTICLE_DETAIL_COLUMNS =
  'id, slug, title, content, excerpt, category, tags, featured_image_url, seo_title, seo_description, seo_keywords, view_count, published_at, created_at, updated_at, is_auto_published, generated_from_suggestion_id';

export type ArticleListItem = Pick<
  Article,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'category'
  | 'tags'
  | 'featured_image_url'
  | 'published_at'
  | 'created_at'
  | 'updated_at'
  | 'view_count'
  | 'is_auto_published'
  | 'generated_from_suggestion_id'
>;

export type ArticleDetail = ArticleListItem &
  Pick<Article, 'content' | 'seo_title' | 'seo_description' | 'seo_keywords'>;

export type ArticleSort = 'newest' | 'oldest' | 'popular' | 'title';

export interface PublishedArticleFilters {
  search?: string;
  category?: string;
  sort?: ArticleSort | string;
}

/** The or() clause for a typed search, sanitized for PostgREST, or null. */
export function articleSearchFilter(search: string | null | undefined): string | null {
  const q = search ? sanitizePostgrestPattern(search) : '';
  if (!q) return null;
  return `title.ilike.%${q}%,excerpt.ilike.%${q}%,category.ilike.%${q}%`;
}

interface ArticlePage {
  rows: ArticleListItem[];
  total: number | null;
  offset: number;
}

/**
 * Published articles, 12 at a time, filtered and sorted on the server.
 *
 * One request per page, always `status=eq.published`, never the body. The old
 * list fetched every article (drafts included, for authors and admins) and
 * filtered in the browser, then a mount effect flipped the key to 'all' and
 * fetched it all again.
 */
export function usePublishedArticles(filters: PublishedArticleFilters = {}) {
  const search = (filters.search ?? '').trim();
  const category = filters.category && filters.category !== 'all' ? filters.category : '';
  const sort = (filters.sort ?? 'newest') as ArticleSort;

  return useInfiniteQuery({
    queryKey: queryKeys.articles.list({ status: 'published', search, category, sort, pageSize: ARTICLE_PAGE_SIZE }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ArticlePage> => {
      const offset = typeof pageParam === 'number' ? pageParam : 0;
      let query = supabase
        .from('articles')
        .select(ARTICLE_LIST_COLUMNS, { count: 'exact' })
        .eq('status', 'published');

      const or = articleSearchFilter(search);
      if (or) query = query.or(or);
      if (category) query = query.eq('category', category);

      switch (sort) {
        case 'oldest':
          query = query.order('published_at', { ascending: true, nullsFirst: false });
          break;
        case 'popular':
          query = query.order('view_count', { ascending: false, nullsFirst: false });
          break;
        case 'title':
          query = query.order('title', { ascending: true });
          break;
        default:
          query = query.order('published_at', { ascending: false, nullsFirst: false });
      }
      // A unique tiebreak, so a page boundary never repeats or skips a row.
      query = query.order('id', { ascending: true });

      const { data, error, count } = await query.range(offset, offset + ARTICLE_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as ArticleListItem[], total: count ?? null, offset };
    },
    getNextPageParam: (last) => {
      const next = last.offset + last.rows.length;
      if (last.total !== null) return next < last.total ? next : undefined;
      return last.rows.length === ARTICLE_PAGE_SIZE ? next : undefined;
    },
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });
}

/**
 * One published article by slug.
 *
 * `maybeSingle` so a missing row is `null` (not found, noindex) and only a real
 * failure is an error. The imperative fetch this replaces turned a network
 * error into "Article Not Found" plus noindex, which told crawlers a live
 * article was gone.
 */
export function useArticleBySlug(slug: string | undefined) {
  const query = useQuery<ArticleDetail | null>({
    queryKey: queryKeys.articles.detail(slug ?? ''),
    enabled: Boolean(slug),
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select(ARTICLE_DETAIL_COLUMNS)
        .eq('slug', slug as string)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as ArticleDetail | null;
    },
    staleTime: STALE_TIME.CONTENT_LIST,
    gcTime: GC_TIME,
  });

  // One view per page visit. In the queryFn it also counted every background
  // refetch (window refocus after staleTime, the retry), which inflates the
  // "popular" sort.
  const foundId = query.data?.id ?? null;
  useEffect(() => {
    if (foundId && slug) recordArticleView(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per article found, not per slug keystroke
  }, [foundId]);

  return query;
}

export interface HubListing {
  id: string;
  label: string;
  href: string;
  meta?: string;
}

/** Statuses a visitor cannot go and eat at today (same set useRestaurants sinks). */
const UNVISITABLE_RESTAURANT_STATUSES = new Set(['opening_soon', 'closed']);

const HUB_LISTING_COUNT = 4;

interface ListingEventRow {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc: string | null;
}

async function upcomingEvents(kidsOnly: boolean): Promise<HubListing[]> {
  let query = applyEventVisibility(
    supabase.from('events').select('id, title, date, event_start_utc'),
  ).gte('date', new Date().toISOString());
  if (kidsOnly) query = query.or(KIDS_EVENTS_FILTER);
  const { data, error } = await query.order('date', { ascending: true }).limit(HUB_LISTING_COUNT);
  if (error) throw error;
  return ((data ?? []) as unknown as ListingEventRow[])
    .filter((e) => e.title)
    .map((e) => ({ id: e.id, label: e.title as string, href: eventHref(e), meta: formatEventDateShort(e) }));
}

/**
 * Three or four current listings from an article's primary hub, as plain
 * links: upcoming events (kids-filtered for the family hub), visitable
 * restaurants, or active attractions. The outdoors hub has no cheap listing
 * query of its own yet, so it returns none and the block stays hidden.
 */
export function useArticleHubListings(hub: HubKey | null) {
  return useQuery<HubListing[]>({
    queryKey: ['articles', 'hub-listings', hub],
    enabled: hub !== null,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async () => {
      switch (hub) {
        case 'events':
          return upcomingEvents(false);
        case 'family':
          return upcomingEvents(true);
        case 'restaurants': {
          const { data, error } = await supabase
            .from('restaurants')
            .select('id, slug, name, status')
            .neq('is_merged', true)
            .order('popularity_score', { ascending: false, nullsFirst: false })
            .limit(HUB_LISTING_COUNT * 2);
          if (error) throw error;
          return (data ?? [])
            .filter((r) => r.name && !UNVISITABLE_RESTAURANT_STATUSES.has(r.status ?? ''))
            .slice(0, HUB_LISTING_COUNT)
            .map((r) => ({ id: r.id, label: r.name, href: restaurantHref(r) }));
        }
        case 'attractions': {
          const { data, error } = await supabase
            .from('attractions')
            .select('id, name')
            .eq('is_active', true)
            .order('rating', { ascending: false, nullsFirst: false })
            .limit(HUB_LISTING_COUNT);
          if (error) throw error;
          return (data ?? [])
            .filter((a) => a.name)
            .map((a) => ({ id: a.id, label: a.name, href: attractionHref(a) }));
        }
        default:
          return [];
      }
    },
  });
}
