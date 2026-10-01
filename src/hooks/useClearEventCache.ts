// Utility to clear all event-related caches and force fresh data
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from '@/lib/logger';

const log = createLogger('useClearEventCache');

export function useClearEventCache() {
  const queryClient = useQueryClient();
  
  const clearEventCache = () => {
    // WEB-PERF-032: the bare ['events'] prefix is CORRECT here and should stay.
    // Everywhere else it was too broad (a field edit taking out the homepage
    // rail); this hook's whole job is "drop everything about events", so the
    // parent key is what it means. Written down because the surrounding change
    // narrowed every other call site and this one looks like a miss.
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
    
    log.debug('clearCache', 'Event cache cleared');
  };
  
  return { clearEventCache };
}
