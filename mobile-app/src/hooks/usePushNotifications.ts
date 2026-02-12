/**
 * React hook for push notification management.
 *
 * Handles permission requesting, token registration, and notification
 * event routing within React components.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isNative } from '../config/platform';
import {
  registerPushNotifications,
  createNotificationChannels,
  cleanupPushNotifications,
} from '../services/push-notifications';
import { resolveDeepLink } from '../services/deep-links';
import { setItem, getItem } from '../services/offline-storage';

const PUSH_TOKEN_KEY = 'push_notification_token';
const PUSH_ENABLED_KEY = 'push_notifications_enabled';

export interface UsePushNotificationsReturn {
  isEnabled: boolean;
  token: string | null;
  enableNotifications: () => Promise<boolean>;
  disableNotifications: () => Promise<void>;
}

/**
 * Manage push notifications within a React component.
 *
 * @example
 * ```tsx
 * function SettingsPage() {
 *   const { isEnabled, enableNotifications, disableNotifications } = usePushNotifications();
 *
 *   return (
 *     <Switch
 *       checked={isEnabled}
 *       onCheckedChange={(checked) =>
 *         checked ? enableNotifications() : disableNotifications()
 *       }
 *     />
 *   );
 * }
 * ```
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const navigate = useNavigate();
  const [isEnabled, setIsEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const initialized = useRef(false);

  // Load stored state on mount
  useEffect(() => {
    if (!isNative) return;

    (async () => {
      const storedEnabled = await getItem<boolean>(PUSH_ENABLED_KEY);
      const storedToken = await getItem<string>(PUSH_TOKEN_KEY);
      if (storedEnabled) setIsEnabled(true);
      if (storedToken) setToken(storedToken);
    })();
  }, []);

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;

    // Create notification channels first (Android)
    await createNotificationChannels();

    const success = await registerPushNotifications({
      onRegistration: async (newToken) => {
        setToken(newToken);
        await setItem(PUSH_TOKEN_KEY, newToken);

        // TODO: Send token to your backend for push targeting
        // await supabase.from('push_tokens').upsert({ token: newToken, ... });
      },
      onRegistrationError: (error) => {
        if (import.meta.env.DEV) {
          console.error('Push registration error:', error);
        }
      },
      onNotificationReceived: (notification) => {
        // Notification received while app is in foreground
        // Could show an in-app banner here
        if (import.meta.env.DEV) {
          console.log('Notification received:', notification);
        }
      },
      onNotificationAction: (action) => {
        // User tapped on a notification - navigate to the relevant screen
        const data = action.notification.data;
        if (data?.url) {
          const path = resolveDeepLink(data.url);
          navigate(path);
        } else if (data?.type === 'event' && data?.id) {
          navigate(`/events/${data.id}`);
        } else if (data?.type === 'restaurant' && data?.id) {
          navigate(`/restaurants/${data.id}`);
        }
      },
    });

    if (success) {
      setIsEnabled(true);
      await setItem(PUSH_ENABLED_KEY, true);
    }

    return success;
  }, [navigate]);

  const disableNotifications = useCallback(async (): Promise<void> => {
    setIsEnabled(false);
    setToken(null);
    await setItem(PUSH_ENABLED_KEY, false);
    await cleanupPushNotifications();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (initialized.current) {
        cleanupPushNotifications();
      }
    };
  }, []);

  return {
    isEnabled,
    token,
    enableNotifications,
    disableNotifications,
  };
}
