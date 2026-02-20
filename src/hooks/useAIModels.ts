import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAIModels');

export interface AIModel {
  id: string;
  model_id: string;
  model_name: string;
  provider: string;
  description: string | null;
  context_window: number | null;
  max_output_tokens: number | null;
  supports_vision: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useAIModels() {
  const queryClient = useQueryClient();

  const { data: models, isLoading } = useQuery({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_models")
        .select("*")
        .eq("is_active", true)
        .order("provider", { ascending: true })
        .order("model_name", { ascending: true });

      if (error) throw error;
      return data as AIModel[];
    },
  });

  const addModel = useMutation({
    mutationFn: async (model: Partial<AIModel>) => {
      const { error } = await supabase
        .from("ai_models")
        .insert([model] as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      toast.success("Model added successfully");
    },
    onError: (error: Error) => {
      log.error('addModel', 'Error adding model', { error });
      toast.error(error.message || "Failed to add model");
    },
  });

  const updateModel = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIModel> & { id: string }) => {
      const { error } = await supabase
        .from("ai_models")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      toast.success("Model updated successfully");
    },
    onError: (error: Error) => {
      log.error('updateModel', 'Error updating model', { error });
      toast.error(error.message || "Failed to update model");
    },
  });

  const deleteModel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_models")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-models"] });
      toast.success("Model deleted successfully");
    },
    onError: (error: Error) => {
      log.error('deleteModel', 'Error deleting model', { error });
      toast.error(error.message || "Failed to delete model");
    },
  });

  return {
    models,
    isLoading,
    addModel: addModel.mutate,
    updateModel: updateModel.mutate,
    deleteModel: deleteModel.mutate,
    isAdding: addModel.isPending,
    isUpdating: updateModel.isPending,
    isDeleting: deleteModel.isPending,
  };
}