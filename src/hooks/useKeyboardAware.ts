import { useEffect, useRef } from 'react';
import { isCapacitor } from '@/lib/capacitorUtils';

/**
 * Hook that ensures focused inputs scroll into view when the iOS keyboard
 * appears. On Capacitor iOS, the keyboard can obscure inputs even with
 * `resize: 'native'` — this hook listens for keyboard events and applies
 * a gentle scrollIntoView + bottom padding so the active field stays visible.
 *
 * No-op on web.
 */
export function useKeyboardAware() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isCapacitor()) return;

    const keyboard = window.Capacitor?.Plugins?.Keyboard;
    if (!keyboard) {
      // Fallback: use focusin listener with scrollIntoView for iOS WebView
      // even without the Keyboard plugin
      const handleFocusIn = (e: FocusEvent) => {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        ) {
          // Small delay lets the keyboard finish animating
          setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      };

      document.addEventListener('focusin', handleFocusIn);
      cleanupRef.current = () => {
        document.removeEventListener('focusin', handleFocusIn);
      };
      return () => cleanupRef.current?.();
    }

    // With the Capacitor Keyboard plugin we get precise keyboard height
    let keyboardHeight = 0;
    let showListener: { remove: () => void } | null = null;
    let hideListener: { remove: () => void } | null = null;

    const setup = async () => {
      showListener = await keyboard.addListener(
        'keyboardWillShow',
        (info: { keyboardHeight: number }) => {
          keyboardHeight = info.keyboardHeight;
          document.documentElement.classList.add('keyboard-visible');
          document.documentElement.style.setProperty(
            '--keyboard-height',
            `${keyboardHeight}px`
          );

          // Scroll the active element into view above the keyboard
          requestAnimationFrame(() => {
            const active = document.activeElement;
            if (
              active instanceof HTMLInputElement ||
              active instanceof HTMLTextAreaElement ||
              active instanceof HTMLSelectElement
            ) {
              const rect = active.getBoundingClientRect();
              const viewportHeight = window.innerHeight;
              const visibleBottom = viewportHeight - keyboardHeight;

              // If the input is below (or too close to) the keyboard top, scroll it up
              if (rect.bottom > visibleBottom - 20) {
                active.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          });
        }
      );

      hideListener = await keyboard.addListener(
        'keyboardWillHide',
        () => {
          keyboardHeight = 0;
          document.documentElement.classList.remove('keyboard-visible');
          document.documentElement.style.removeProperty('--keyboard-height');
        }
      );
    };

    setup();

    cleanupRef.current = () => {
      showListener?.remove();
      hideListener?.remove();
    };

    return () => cleanupRef.current?.();
  }, []);
}
