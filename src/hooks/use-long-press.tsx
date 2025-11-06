import { useCallback, useRef } from 'react';

export interface LongPressOptions {
  onLongPress: () => void;
  onPress?: () => void;
  delay?: number;
  shouldPreventDefault?: boolean;
}

/**
 * Custom hook for detecting long press gestures on mobile devices
 * @param options - Long press configuration
 * @returns Event handlers to spread on the target element
 */
export function useLongPress(options: LongPressOptions) {
  const {
    onLongPress,
    onPress,
    delay = 500,
    shouldPreventDefault = true,
  } = options;

  const timeout = useRef<NodeJS.Timeout>();
  const target = useRef<EventTarget>();
  const isLongPress = useRef(false);

  const start = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      if (shouldPreventDefault && event.target) {
        event.target.addEventListener('touchend', preventDefault, {
          passive: false,
        });
        target.current = event.target;
      }

      isLongPress.current = false;

      timeout.current = setTimeout(() => {
        isLongPress.current = true;
        onLongPress();

        // Optional: Trigger haptic feedback on supported devices
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const clear = useCallback(
    (event: React.TouchEvent | React.MouseEvent, shouldTriggerPress = true) => {
      timeout.current && clearTimeout(timeout.current);

      if (shouldTriggerPress && !isLongPress.current && onPress) {
        onPress();
      }

      if (shouldPreventDefault && target.current) {
        target.current.removeEventListener('touchend', preventDefault);
      }
    },
    [onPress, shouldPreventDefault]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
  };
}

const preventDefault = (event: Event) => {
  if (!isTouchEvent(event)) return;

  if (event.touches.length < 2 && event.preventDefault) {
    event.preventDefault();
  }
};

const isTouchEvent = (event: Event): event is TouchEvent => {
  return 'touches' in event;
};
