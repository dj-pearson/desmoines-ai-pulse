/**
 * Push Notification Service
 *
 * Manages push notification registration, permission handling,
 * and notification event routing for both iOS (APNs) and Android (FCM).
 */

import { PushNotifications, type Token, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative, isIOS, isPluginAvailable } from '../config/platform';

export interface PushNotificationOptions {
  onRegistration?: (token: string) => void;
  onRegistrationError?: (error: string) => void;
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationAction?: (action: ActionPerformed) => void;
}

/**
 * Request push notification permission and register for remote notifications.
 */
export async function registerPushNotifications(options: PushNotificationOptions = {}): Promise<boolean> {
  if (!isNative || !isPluginAvailable('PushNotifications')) {
    return false;
  }

  try {
    // Check current permission status
    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
      // Request permission
      const result = await PushNotifications.requestPermissions();
      if (result.receive !== 'granted') {
        return false;
      }
    } else if (permStatus.receive !== 'granted') {
      return false;
    }

    // Register event listeners before calling register()
    PushNotifications.addListener('registration', (token: Token) => {
      options.onRegistration?.(token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      options.onRegistrationError?.(error.error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      options.onNotificationReceived?.(notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      options.onNotificationAction?.(action);
    });

    // Register with the native push service (APNs / FCM)
    await PushNotifications.register();
    return true;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Push notification registration failed:', error);
    }
    return false;
  }
}

/**
 * Create notification channels for Android (required for Android 8+).
 */
export async function createNotificationChannels(): Promise<void> {
  if (!isNative || isIOS) return;

  try {
    await PushNotifications.createChannel({
      id: 'events',
      name: 'Event Notifications',
      description: 'Notifications about upcoming events in Des Moines',
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      sound: 'default',
      vibration: true,
    });

    await PushNotifications.createChannel({
      id: 'deals',
      name: 'Deals & Offers',
      description: 'Special deals from local restaurants and businesses',
      importance: 3, // DEFAULT
      visibility: 1,
      sound: 'default',
      vibration: false,
    });

    await PushNotifications.createChannel({
      id: 'general',
      name: 'General',
      description: 'General app notifications and updates',
      importance: 3,
      visibility: 1,
      sound: 'default',
      vibration: false,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to create notification channels:', error);
    }
  }
}

/**
 * Schedule a local notification (e.g., event reminders).
 */
export async function scheduleLocalNotification(options: {
  id: number;
  title: string;
  body: string;
  scheduledAt: Date;
  channelId?: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (!isNative || !isPluginAvailable('LocalNotifications')) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: options.id,
          title: options.title,
          body: options.body,
          schedule: { at: options.scheduledAt },
          channelId: options.channelId || 'events',
          extra: options.data,
        },
      ],
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to schedule local notification:', error);
    }
  }
}

/**
 * Cancel a previously scheduled local notification.
 */
export async function cancelLocalNotification(id: number): Promise<void> {
  if (!isNative || !isPluginAvailable('LocalNotifications')) return;

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to cancel local notification:', error);
    }
  }
}

/**
 * Remove all delivered notifications from the notification center.
 */
export async function removeAllDeliveredNotifications(): Promise<void> {
  if (!isNative || !isPluginAvailable('PushNotifications')) return;

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to remove delivered notifications:', error);
    }
  }
}

/**
 * Clean up all push notification listeners.
 */
export async function cleanupPushNotifications(): Promise<void> {
  if (!isNative) return;

  await Promise.allSettled([
    PushNotifications.removeAllListeners(),
    LocalNotifications.removeAllListeners(),
  ]);
}
