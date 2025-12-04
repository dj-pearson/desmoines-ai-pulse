import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  permissions: string[];
  scopes: string[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  allowed_ips: string[] | null;
  allowed_origins: string[] | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  usage_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiKeyUsage {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  ip_address: string | null;
  user_agent: string | null;
  request_body_size: number | null;
  response_body_size: number | null;
  error_message: string | null;
  created_at: string;
}

interface CreateApiKeyParams {
  name: string;
  description?: string;
  permissions?: string[];
  scopes?: string[];
  expiresInDays?: number;
}

interface CreateApiKeyResult {
  success: boolean;
  key_id: string;
  api_key: string; // Full key, only shown once!
  prefix: string;
  message: string;
}

/**
 * Available API permissions
 */
export const API_PERMISSIONS = {
  read: 'Read-only access',
  write: 'Write access',
  delete: 'Delete access',
  admin: 'Administrative access',
} as const;

/**
 * Available API scopes
 */
export const API_SCOPES = {
  'events:read': 'Read events',
  'events:write': 'Create/update events',
  'restaurants:read': 'Read restaurants',
  'restaurants:write': 'Create/update restaurants',
  'attractions:read': 'Read attractions',
  'attractions:write': 'Create/update attractions',
  'users:read': 'Read user info',
  'analytics:read': 'Read analytics data',
} as const;

/**
 * Hook for managing personal API access tokens
 *
 * Provides:
 * - Create, list, and revoke API keys
 * - View API key usage statistics
 * - Configure permissions and scopes
 */
export function useApiKeys() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch user's API keys
  const {
    data: apiKeys,
    isLoading: isLoadingKeys,
    error: keysError,
    refetch: refetchKeys,
  } = useQuery<ApiKey[]>({
    queryKey: ['api-keys', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching API keys:', error);
        throw error;
      }

      return (data as ApiKey[]) || [];
    },
    enabled: !!user,
    staleTime: 60000,
  });

  // Fetch usage for a specific key
  const fetchKeyUsage = async (keyId: string, limit: number = 100): Promise<ApiKeyUsage[]> => {
    const { data, error } = await supabase
      .from('api_key_usage')
      .select('*')
      .eq('api_key_id', keyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching API key usage:', error);
      return [];
    }

    return (data as ApiKeyUsage[]) || [];
  };

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: async (params: CreateApiKeyParams): Promise<CreateApiKeyResult> => {
      const { data, error } = await supabase
        .rpc('create_api_key', {
          p_name: params.name,
          p_description: params.description || null,
          p_permissions: params.permissions || ['read'],
          p_scopes: params.scopes || [],
          p_expires_in_days: params.expiresInDays || null,
        });

      if (error) {
        console.error('Error creating API key:', error);
        throw error;
      }

      return data as CreateApiKeyResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  // Revoke API key mutation
  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .rpc('revoke_api_key', { p_key_id: keyId });

      if (error) {
        console.error('Error revoking API key:', error);
        throw error;
      }

      return data as boolean;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  // Update API key mutation
  const updateKeyMutation = useMutation({
    mutationFn: async ({
      keyId,
      updates,
    }: {
      keyId: string;
      updates: Partial<Pick<ApiKey, 'name' | 'description' | 'permissions' | 'scopes' | 'rate_limit_per_minute' | 'rate_limit_per_day' | 'allowed_ips' | 'allowed_origins'>>;
    }) => {
      const { data, error } = await supabase
        .from('api_keys')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', keyId)
        .eq('user_id', user?.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating API key:', error);
        throw error;
      }

      return data as ApiKey;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  // Get active keys only
  const activeKeys = apiKeys?.filter(key => key.is_active) || [];

  // Get expired keys
  const expiredKeys = apiKeys?.filter(key => {
    if (!key.expires_at) return false;
    return new Date(key.expires_at) < new Date();
  }) || [];

  // Get key statistics
  const getKeyStats = (key: ApiKey) => {
    const createdDate = new Date(key.created_at);
    const lastUsedDate = key.last_used_at ? new Date(key.last_used_at) : null;
    const expiresDate = key.expires_at ? new Date(key.expires_at) : null;

    const isExpired = expiresDate ? expiresDate < new Date() : false;
    const daysUntilExpiry = expiresDate
      ? Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      createdDate,
      lastUsedDate,
      expiresDate,
      isExpired,
      daysUntilExpiry,
      isNearExpiry: daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0,
      usageCount: key.usage_count,
      isActive: key.is_active && !isExpired,
    };
  };

  // Format key for display (only shows prefix)
  const formatKeyForDisplay = (key: ApiKey): string => {
    return `${key.key_prefix}...`;
  };

  // Copy key to clipboard (only works for newly created keys)
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      return false;
    }
  };

  return {
    // Data
    apiKeys: apiKeys || [],
    activeKeys,
    expiredKeys,
    isLoadingKeys,
    keysError,
    refetchKeys,

    // Mutations
    createKey: createKeyMutation.mutateAsync,
    revokeKey: revokeKeyMutation.mutateAsync,
    updateKey: updateKeyMutation.mutateAsync,

    // Usage
    fetchKeyUsage,

    // Loading states
    isCreating: createKeyMutation.isPending,
    isRevoking: revokeKeyMutation.isPending,
    isUpdating: updateKeyMutation.isPending,

    // Errors
    createError: createKeyMutation.error,
    revokeError: revokeKeyMutation.error,
    updateError: updateKeyMutation.error,

    // Helpers
    getKeyStats,
    formatKeyForDisplay,
    copyToClipboard,

    // Constants
    permissions: API_PERMISSIONS,
    scopes: API_SCOPES,
  };
}
