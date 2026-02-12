import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('useMediaLibrary');

export interface MediaAsset {
  id: string;
  user_id: string | null;
  file_name: string;
  original_file_name: string;
  file_path: string;
  bucket_id: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  is_optimized: boolean;
  optimized_versions: Record<string, string>;
  blur_hash: string | null;
  dominant_color: string | null;
  alt_text: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  content_type: string;
  content_id: string | null;
  processing_status: string;
  processing_error: string | null;
  views_count: number;
  downloads_count: number;
  created_at: string;
  updated_at: string;
  // Computed fields
  public_url?: string;
}

export interface MediaFilters {
  bucket?: string;
  contentType?: string;
  mimeType?: string;
  isOptimized?: boolean;
  searchQuery?: string;
  sortBy?: "created_at" | "file_size" | "views_count" | "title";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Get public URL for a media asset
 */
function getPublicUrl(asset: { bucket_id: string; file_path: string }): string {
  const { data } = supabase.storage
    .from(asset.bucket_id)
    .getPublicUrl(asset.file_path);
  return data.publicUrl;
}

/**
 * Hook to fetch media library with filters and pagination
 */
export function useMediaLibrary(filters: MediaFilters = {}) {
  const {
    bucket,
    contentType,
    mimeType,
    isOptimized,
    searchQuery,
    sortBy = "created_at",
    sortOrder = "desc",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters;

  return useQuery({
    queryKey: ["media-library", filters],
    queryFn: async (): Promise<{ assets: MediaAsset[]; total: number }> => {
      let query = supabase
        .from("media_assets")
        .select("*", { count: "exact" });

      // Apply filters
      if (bucket) {
        query = query.eq("bucket_id", bucket);
      }

      if (contentType) {
        query = query.eq("content_type", contentType);
      }

      if (mimeType) {
        query = query.ilike("mime_type", `${mimeType}%`);
      }

      if (typeof isOptimized === "boolean") {
        query = query.eq("is_optimized", isOptimized);
      }

      if (searchQuery) {
        query = query.or(
          `title.ilike.%${searchQuery}%,original_file_name.ilike.%${searchQuery}%,alt_text.ilike.%${searchQuery}%`
        );
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      // Add public URLs to assets
      const assetsWithUrls = (data || []).map((asset) => ({
        ...asset,
        public_url: getPublicUrl(asset),
      }));

      return {
        assets: assetsWithUrls as MediaAsset[],
        total: count || 0,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to get a single media asset
 */
export function useMediaAsset(id: string | null) {
  return useQuery({
    queryKey: ["media-asset", id],
    queryFn: async (): Promise<MediaAsset | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      return {
        ...data,
        public_url: getPublicUrl(data),
      } as MediaAsset;
    },
    enabled: !!id,
  });
}

/**
 * Hook to update a media asset
 */
export function useUpdateMediaAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<MediaAsset, "alt_text" | "title" | "description" | "tags">>;
    }) => {
      const { data, error } = await supabase
        .from("media_assets")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
      queryClient.invalidateQueries({ queryKey: ["media-asset", variables.id] });
    },
  });
}

/**
 * Hook to delete a media asset
 */
export function useDeleteMediaAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get the asset first to delete from storage
      const { data: asset, error: fetchError } = await supabase
        .from("media_assets")
        .select("bucket_id, file_path")
        .eq("id", id)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(asset.bucket_id)
        .remove([asset.file_path]);

      if (storageError) {
        log.error("Failed to delete from storage", { action: 'deleteMediaAsset', metadata: { error: storageError } });
        // Continue to delete the record even if storage deletion fails
      }

      // Delete the database record
      const { error: deleteError } = await supabase
        .from("media_assets")
        .delete()
        .eq("id", id);

      if (deleteError) {
        throw deleteError;
      }

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
    },
  });
}

/**
 * Hook to delete multiple media assets
 */
export function useDeleteMediaAssets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      // Get assets to delete from storage
      const { data: assets, error: fetchError } = await supabase
        .from("media_assets")
        .select("id, bucket_id, file_path")
        .in("id", ids);

      if (fetchError) {
        throw fetchError;
      }

      // Group by bucket for batch deletion
      const byBucket: Record<string, string[]> = {};
      for (const asset of assets || []) {
        if (!byBucket[asset.bucket_id]) {
          byBucket[asset.bucket_id] = [];
        }
        byBucket[asset.bucket_id].push(asset.file_path);
      }

      // Delete from storage (by bucket)
      for (const [bucketId, paths] of Object.entries(byBucket)) {
        await supabase.storage.from(bucketId).remove(paths);
      }

      // Delete database records
      const { error: deleteError } = await supabase
        .from("media_assets")
        .delete()
        .in("id", ids);

      if (deleteError) {
        throw deleteError;
      }

      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media-library"] });
    },
  });
}

/**
 * Hook to get media library statistics
 */
export function useMediaStats() {
  return useQuery({
    queryKey: ["media-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("bucket_id, mime_type, file_size, is_optimized");

      if (error) {
        throw error;
      }

      const stats = {
        totalAssets: data.length,
        totalSize: data.reduce((sum, asset) => sum + (asset.file_size || 0), 0),
        byBucket: {} as Record<string, { count: number; size: number }>,
        byType: {} as Record<string, number>,
        optimized: data.filter((a) => a.is_optimized).length,
        pending: data.filter((a) => !a.is_optimized).length,
      };

      for (const asset of data) {
        // By bucket
        if (!stats.byBucket[asset.bucket_id]) {
          stats.byBucket[asset.bucket_id] = { count: 0, size: 0 };
        }
        stats.byBucket[asset.bucket_id].count++;
        stats.byBucket[asset.bucket_id].size += asset.file_size || 0;

        // By type
        const type = asset.mime_type?.split("/")[0] || "unknown";
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }

      return stats;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export default useMediaLibrary;
