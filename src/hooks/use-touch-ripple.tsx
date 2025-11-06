import { useCallback, useRef } from 'react';

interface RippleEffect {
  x: number;
  y: number;
  size: number;
}

/**
 * Custom hook for Material Design-style touch ripple effect
 * @returns Functions and ref to create ripple effects
 */
export function useTouchRipple() {
  const rippleRef = useRef<HTMLDivElement>(null);

  const createRipple = useCallback((event: React.TouchEvent | React.MouseEvent) => {
    const container = rippleRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    // Get touch/click position
    let x: number, y: number;

    if ('touches' in event) {
      const touch = event.touches[0];
      x = touch.clientX - rect.left - size / 2;
      y = touch.clientY - rect.top - size / 2;
    } else {
      x = event.clientX - rect.left - size / 2;
      y = event.clientY - rect.top - size / 2;
    }

    // Create ripple element
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background-color: currentColor;
      opacity: 0.3;
      pointer-events: none;
      transform: scale(0);
      animation: ripple 600ms ease-out;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
    `;

    container.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }, []);

  const handleTouch = useCallback((event: React.TouchEvent) => {
    createRipple(event);
  }, [createRipple]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    createRipple(event);
  }, [createRipple]);

  return {
    rippleRef,
    handleTouch,
    handleClick,
  };
}

// Add ripple animation to global styles if not present
if (typeof document !== 'undefined') {
  const styleId = 'touch-ripple-animation';

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ripple {
        to {
          transform: scale(2);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
