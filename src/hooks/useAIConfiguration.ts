import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAIConfiguration');

export interface AIConfigSetting {
  id: string;
  setting_key: string;
  setting_value: any;
  description: string | null;
  updated_at: string;
}

export function useAIConfiguration() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-configuration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_configuration")
        .select("*")
        .order("setting_key");

      if (error) throw error;
      return data as AIConfigSetting[];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: string;
      value: any;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("ai_configuration")
        .update({
          setting_value: value,
          updated_by: user?.id,
        })
        .eq("setting_key", key);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configuration"] });
      toast.success("AI configuration updated successfully");
    },
    onError: (error) => {
      log.error('updateSetting', 'Error updating AI configuration', { error });
      toast.error("Failed to update AI configuration");
    },
  });

  // Helper function to get a specific setting value
  const getSetting = (key: string, defaultValue?: any) => {
    const setting = settings?.find((s) => s.setting_key === key);
    return setting?.setting_value ?? defaultValue;
  };

  return {
    settings,
    isLoading,
    updateSetting: updateSetting.mutate,
    isUpdating: updateSetting.isPending,
    getSetting,
  };
}
