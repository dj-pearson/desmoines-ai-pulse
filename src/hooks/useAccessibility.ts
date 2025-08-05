import { useEffect, useRef, useCallback } from "react";

/**
 * Custom hook for accessibility utilities
 */
export function useAccessibility() {
  /**
   * Manages focus trapping within a container
   */
  const useFocusTrap = (isActive: boolean = false) => {
    const containerRef = useRef<HTMLElement>(null);
    
    useEffect(() => {
      if (!isActive || !containerRef.current) return;
      
      const container = containerRef.current;
      const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement?.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement?.focus();
            e.preventDefault();
          }
        }
      };
      
      container.addEventListener('keydown', handleTabKey);
      firstElement?.focus();
      
      return () => {
        container.removeEventListener('keydown', handleTabKey);
      };
    }, [isActive]);
    
    return containerRef;
  };

  /**
   * Announces content to screen readers
   */
  const announceToScreenReader = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.setAttribute('class', 'sr-only');
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, []);

  /**
   * Manages focus restoration after modal/dialog closes
   */
  const useFocusRestore = () => {
    const previousFocus = useRef<HTMLElement | null>(null);
    
    const saveFocus = useCallback(() => {
      previousFocus.current = document.activeElement as HTMLElement;
    }, []);
    
    const restoreFocus = useCallback(() => {
      if (previousFocus.current) {
        previousFocus.current.focus();
        previousFocus.current = null;
      }
    }, []);
    
    return { saveFocus, restoreFocus };
  };

  /**
   * Keyboard navigation for lists
   */
  const useKeyboardNavigation = (itemCount: number, onSelect?: (index: number) => void) => {
    const activeIndex = useRef(0);
    const containerRef = useRef<HTMLElement>(null);
    
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (!containerRef.current) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          activeIndex.current = Math.min(activeIndex.current + 1, itemCount - 1);
          updateFocus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          activeIndex.current = Math.max(activeIndex.current - 1, 0);
          updateFocus();
          break;
        case 'Home':
          e.preventDefault();
          activeIndex.current = 0;
          updateFocus();
          break;
        case 'End':
          e.preventDefault();
          activeIndex.current = itemCount - 1;
          updateFocus();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(activeIndex.current);
          break;
      }
    }, [itemCount, onSelect]);
    
    const updateFocus = useCallback(() => {
      if (!containerRef.current) return;
      
      const items = containerRef.current.querySelectorAll('[role="option"], [role="menuitem"], button');
      const activeItem = items[activeIndex.current] as HTMLElement;
      activeItem?.focus();
    }, []);
    
    return { containerRef, handleKeyDown, activeIndex: activeIndex.current };
  };

  return {
    useFocusTrap,
    announceToScreenReader,
    useFocusRestore,
    useKeyboardNavigation,
    useReducedMotion,
  };
}

/**
 * Generates accessible IDs for form elements
 */
export function useAccessibleId(prefix: string = 'accessible') {
  const id = useRef(`${prefix}-${Math.random().toString(36).substr(2, 9)}`);
  return id.current;
}

/**
 * Hook for managing reduced motion preferences
 */
export function useReducedMotion() {
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' 
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      prefersReducedMotion.current = mediaQuery.matches;
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  return prefersReducedMotion.current;
}