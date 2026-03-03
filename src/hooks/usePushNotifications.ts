import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCapacitor, getPlatform } from '@/lib/capacitorUtils';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/lib/safeStorage';

const PUSH_TOKEN_KEY = 'push_notification_token';
const PUSH_ENABLED_KEY = 'push_notifications_enabled';

interface PushNotificationData {
  url?: string;
  type?: string;
  id?: string;
}

/**
 * Hook for push notification registration and handling in Capacitor.
 * Registers with APNs/FCM, stores token in Supabase, handles tap navigation.
 * No-op on web.
 */
export function usePushNotifications() {
  const navigate = useNavigate();
  const [isEnabled, setIsEnabled] = useState(() =>
    storage.get<boolean>(PUSH_ENABLED_KEY, false)
  );
  const [token, setToken] = useState<string | null>(() =>
    storage.get<string | null>(PUSH_TOKEN_KEY, null)
  );
  const initialized = useRef(false);

  const registerToken = useCallback(async (deviceToken: string) => {
    setToken(deviceToken);
    storage.set(PUSH_TOKEN_KEY, deviceToken);

    // Store token in Supabase for the current user
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('device_tokens').upsert(
          {
            user_id: user.id,
            token: deviceToken,
            platform: getPlatform(),
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        );
      }
    } catch {
      // Token storage failed — not critical, will retry on next launch
    }
  }, []);

  const handleNotificationTap = useCallback((data: PushNotificationData) => {
    if (data?.url) {
      // Strip domain if it's a full URL, keep only the path
      try {
        const url = new URL(data.url);
        navigate(url.pathname);
      } catch {
        navigate(data.url);
      }
    } else if (data?.type === 'event' && data?.id) {
      navigate(`/events/${data.id}`);
    } else if (data?.type === 'restaurant' && data?.id) {
      navigate(`/restaurants/${data.id}`);
    }
  }, [navigate]);

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (!isCapacitor()) return false;

    const pushPlugin = window.Capacitor?.Plugins?.PushNotifications as {
      checkPermissions?: () => Promise<{ receive: string }>;
      requestPermissions?: () => Promise<{ receive: string }>;
      register?: () => Promise<void>;
      addListener?: (event: string, cb: (data: unknown) => void) => Promise<{ remove: () => void }>;
    } | undefined;

    if (!pushPlugin?.requestPermissions || !pushPlugin?.register) return false;

    try {
      // Check and request permission
      let permStatus = await pushPlugin.checkPermissions!();
      if (permStatus.receive === 'prompt') {
        permStatus = await pushPlugin.requestPermissions();
      }
      if (permStatus.receive !== 'granted') return false;

      // Set up listeners
      await pushPlugin.addListener!('registration', (data: unknown) => {
        const tokenData = data as { value: string };
        if (tokenData?.value) {
          registerToken(tokenData.value);
        }
      });

      await pushPlugin.addListener!('pushNotificationActionPerformed', (data: unknown) => {
        const action = data as { notification: { data: PushNotificationData } };
        handleNotificationTap(action?.notification?.data || {});
      });

      // Register with APNs/FCM
      await pushPlugin.register();

      setIsEnabled(true);
      storage.set(PUSH_ENABLED_KEY, true);
      initialized.current = true;
      return true;
    } catch {
      return false;
    }
  }, [registerToken, handleNotificationTap]);

  // Auto-register on mount if previously enabled
  useEffect(() => {
    if (isCapacitor() && isEnabled && !initialized.current) {
      enableNotifications();
    }
  }, [isEnabled, enableNotifications]);

  return { isEnabled, token, enableNotifications };
}

/**
 * Schedule a local notification for an event reminder.
 * Uses Capacitor LocalNotifications plugin. No-op on web.
 */
export async function scheduleEventReminder(opts: {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  reminderType: '1_day' | '3_hours' | '1_hour';
}): Promise<boolean> {
  if (!isCapacitor()) return false;

  const localNotifs = window.Capacitor?.Plugins?.LocalNotifications as {
    schedule?: (opts: { notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at: Date };
      extra: Record<string, string>;
    }> }) => Promise<void>;
  } | undefined;

  if (!localNotifs?.schedule) return false;

  const reminderOffsets: Record<string, number> = {
    '1_day': 24 * 60 * 60 * 1000,
    '3_hours': 3 * 60 * 60 * 1000,
    '1_hour': 1 * 60 * 60 * 1000,
  };

  const reminderLabels: Record<string, string> = {
    '1_day': 'tomorrow',
    '3_hours': 'in 3 hours',
    '1_hour': 'in 1 hour',
  };

  const offset = reminderOffsets[opts.reminderType] || 0;
  const scheduledAt = new Date(opts.eventDate.getTime() - offset);

  // Don't schedule if the reminder time has already passed
  if (scheduledAt <= new Date()) return false;

  // Generate a stable numeric ID from eventId + reminderType
  const id = hashCode(`${opts.eventId}-${opts.reminderType}`);

  try {
    await localNotifs.schedule({
      notifications: [{
        id,
        title: `Event Reminder: ${opts.eventTitle}`,
        body: `${opts.eventTitle} starts ${reminderLabels[opts.reminderType]}!`,
        schedule: { at: scheduledAt },
        extra: { type: 'event', id: opts.eventId },
      }],
    });
    return true;
  } catch {
    return false;
  }
}

/** Simple string hash to generate a stable numeric ID */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
