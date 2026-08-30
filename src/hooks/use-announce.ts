import { useState, useCallback, useRef } from 'react';

/**
 * Hook that manages a visually-hidden aria-live region for screen reader announcements.
 *
 * Usage:
 *   const { announce, announcement, regionProps } = useAnnounce();
 *   announce('Found 23 events matching your search');
 *
 *   // In JSX:
 *   <div {...regionProps}>{announcement}</div>
 */
export function useAnnounce(politeness: 'polite' | 'assertive' = 'polite') {
  const [announcement, setAnnouncement] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback((message: string) => {
    // Clear first to ensure re-announcement of same message
    setAnnouncement('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setAnnouncement(message);
    }, 100);
  }, []);

  const regionProps = {
    role: 'status' as const,
    'aria-live': politeness,
    'aria-atomic': true as const,
    className: 'sr-only',
  };

  return { announce, announcement, regionProps };
}
