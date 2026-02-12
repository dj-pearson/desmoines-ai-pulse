// Utility to clear all event-related caches and force fresh data
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from '@/lib/logger';

const log = createLogger('useClearEventCache');

export function useClearEventCache() {
  const queryClient = useQueryClient();
  
  const clearEventCache = () => {
    // Clear all event-related queries
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['related-events'] });
    queryClient.invalidateQueries({ queryKey: ['featured-content'] });
    queryClient.invalidateQueries({ queryKey: ['event-categories'] });
    
    // Also remove from cache entirely
    queryClient.removeQueries({ queryKey: ['events'] });
    queryClient.removeQueries({ queryKey: ['related-events'] });
    queryClient.removeQueries({ queryKey: ['featured-content'] });
    queryClient.removeQueries({ queryKey: ['event-categories'] });
    
    log.debug('Event cache cleared', { action: 'clearEventCache', metadata: { clearedAt: new Date().toLocaleString() } });
  };
  
  return { clearEventCache };
}
