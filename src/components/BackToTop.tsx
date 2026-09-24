import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BackToTopProps {
  /**
   * Scroll position in pixels at which to show the button
   * @default 500
   */
  showAfter?: number;
  /**
   * Custom className for styling
   */
  className?: string;
}

export function BackToTop({ showAfter = 500, className }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setIsVisible(scrollTop > showAfter);
    };

    // Check initial scroll position
    handleScroll();

    // Add scroll event listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup
    return () => window.removeEventListener('scroll', handleScroll);
  }, [showAfter]);

  const scrollToTop = () => {
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });

    // The button unmounts once we are back at the top, which would drop focus
    // to <body>. Send it to the start of the content instead, so a keyboard or
    // screen reader user continues from where they now are.
    const main = document.getElementById('main-content');
    if (main) {
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      onClick={scrollToTop}
      size="icon"
      className={cn(
        // BottomNav (lg:hidden, z-50) renders after <main>, so at the same z it
        // paints over anything in its band. Sit above it on phones and tablets.
        'fixed right-6 z-50 h-12 w-12 rounded-full shadow-lg',
        'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6',
        'transition-transform duration-300 motion-safe:hover:scale-110',
        'bg-primary text-primary-foreground',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        className
      )}
      aria-label="Scroll to top"
      title="Back to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
