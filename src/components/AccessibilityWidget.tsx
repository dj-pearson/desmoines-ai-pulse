import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { Accessibility, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccessibilityPreferences } from '@/contexts/AccessibilityContext';
import { useAccessibility } from '@/hooks/useAccessibility';

/**
 * The panel is the whole weight of this feature - Switch, Button, Link and
 * eleven more lucide icons - and it opens only when someone taps the button
 * below. The widget is mounted at the app root, so before this split every
 * visitor downloaded all of it on every page (WEB-PERF-020).
 *
 * React.lazy fetches on RENDER, not on mount, and the panel renders only while
 * isOpen - so nothing is requested until the button is pressed.
 */
const AccessibilityPanel = lazy(() => import('@/components/AccessibilityPanel'));

export function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { hasCustomPreferences } = useAccessibilityPreferences();
  const { announceToScreenReader } = useAccessibility();

  const handleToggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      announceToScreenReader(
        next ? 'Accessibility settings panel opened' : 'Accessibility settings panel closed',
        'polite'
      );
      return next;
    });
  }, [announceToScreenReader]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
    announceToScreenReader('Accessibility settings panel closed', 'polite');
  }, [announceToScreenReader]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, handleClose]);

  // Focus-on-open lives in the panel, not here. The ref is empty at the moment
  // isOpen flips true - the lazy chunk has not resolved and the panel has not
  // mounted yet - so an effect keyed on isOpen would silently never focus
  // anything, which is exactly the kind of a11y regression a code split
  // introduces without any visible symptom.

  return (
    <>
      {/* Floating trigger button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="a11y-panel"
        aria-label={isOpen ? 'Close accessibility settings' : 'Open accessibility settings'}
        className={cn(
          'fixed bottom-20 left-4 z-[9998] lg:bottom-6',
          'h-12 w-12 rounded-full shadow-lg',
          'bg-primary text-primary-foreground',
          'flex items-center justify-center',
          'transition-transform duration-200 hover:scale-110',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          hasCustomPreferences && 'ring-2 ring-secondary ring-offset-2 ring-offset-background'
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Accessibility className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* Settings panel, fetched on first open. No fallback: a spinner in the
          corner of the screen for a chunk this small is more distracting than
          the brief nothing. */}
      {isOpen && (
        <Suspense fallback={null}>
          <AccessibilityPanel panelRef={panelRef} onClose={handleClose} />
        </Suspense>
      )}
    </>
  );
}
