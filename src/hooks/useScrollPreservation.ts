import { useCallback } from 'react';

/**
 * Hook to preserve scroll position during form submissions and data updates
 */
export function useScrollPreservation() {
  const preserveScrollPosition = useCallback(async (asyncOperation: () => Promise<void>) => {
    // Capture current scroll position
    const savedScrollY = window.scrollY;
    
    try {
      // Execute the async operation (form submission, data update, etc.)
      await asyncOperation();
    } finally {
      // Restore scroll position after the operation completes
      // Use setTimeout to ensure DOM updates have finished
      setTimeout(() => {
        window.scrollTo({ 
          top: savedScrollY, 
          behavior: 'auto' // Use 'auto' for instant positioning without animation
        });
      }, 0);
    }
  }, []);

  return { preserveScrollPosition };
}