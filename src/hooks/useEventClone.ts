import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('useEventClone');

interface CloneEventParams {
  eventId: string;
  newDate?: string;
  newTitle?: string;
}

export function useEventClone() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cloneMutation = useMutation({
    mutationFn: async ({ eventId, newDate, newTitle }: CloneEventParams) => {
      const { data, error } = await supabase.rpc('clone_event', {
        p_event_id: eventId,
        p_new_date: newDate || null,
        p_new_title: newTitle || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (newEventId) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });

      toast({
        title: 'Event cloned successfully',
        description: 'The event has been duplicated and saved',
      });

      return newEventId;
    },
    onError: (error: any) => {
      log.error('Error cloning event', { action: 'cloneEvent', metadata: { error } });
      toast({
        title: 'Failed to clone event',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const cloneEvent = (params: CloneEventParams) => {
    return cloneMutation.mutateAsync(params);
  };

  return {
    cloneEvent,
    isCloning: cloneMutation.isPending,
  };
}
