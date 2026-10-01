import { useDeepLinks } from "@/hooks/useDeepLinks";
import { useKeyboardAware } from "@/hooks/useKeyboardAware";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useStatusBarStyle } from "@/hooks/useStatusBarStyle";
import { useSwipeBack } from "@/hooks/useSwipeBack";

/**
 * The five hooks that only do anything inside the Capacitor shell, in one
 * lazily-loaded component (WEB-PERF-020 AC4).
 *
 * Each of them opens with `if (!isCapacitor()) return;` - push registration,
 * deep-link handling, the iOS swipe-back gesture, the status-bar style and the
 * keyboard-avoidance padding are all no-ops on the web. They were called
 * directly from the app shell, so their 10.4 KB shipped in the render-blocking
 * entry chunk to every web visitor, who can never reach a line of it.
 *
 * They cannot simply be called conditionally - that is the rules of hooks - so
 * the condition moves up to whether this COMPONENT is rendered. App.tsx mounts
 * it behind `isCapacitor()` and a lazy import, so on the web the chunk is
 * never requested, and inside the app it is one local file fetched at startup.
 *
 * Renders nothing. It exists for its effects.
 */
export default function CapacitorRuntime(): null {
  usePushNotifications();
  useDeepLinks();
  useSwipeBack();
  useStatusBarStyle();
  useKeyboardAware();
  return null;
}
