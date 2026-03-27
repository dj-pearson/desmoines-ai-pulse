package com.desmoines.aipulse.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.desmoines.aipulse.MainActivity
import com.desmoines.aipulse.R
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.functions.invoke
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Firebase Cloud Messaging service for push notifications.
 * Mirrors iOS PushNotificationService.swift.
 *
 * Handles:
 * - Device token registration and sync to backend via 'register-device-token' edge function
 * - Incoming push notification display with proper notification channel
 * - Deep link navigation from notification taps
 *
 * Activated when Config.ENABLE_PUSH_NOTIFICATIONS is true.
 */
class PushNotificationService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    /**
     * Called when FCM generates a new device token or refreshes an existing one.
     * Syncs the token to the backend via the 'register-device-token' edge function.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed")

        // Update shared state
        _deviceToken.value = token
        _isRegistered.value = true

        // Persist token locally for access outside this service
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()

        // Sync to backend
        serviceScope.launch {
            syncTokenToBackend(applicationContext, token)
        }
    }

    /**
     * Called when a push notification message is received.
     * Displays a notification if the message contains notification or data payload.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Push notification received: ${message.messageId}")

        val title = message.notification?.title ?: message.data["title"] ?: "Des Moines Insider"
        val body = message.notification?.body ?: message.data["body"] ?: return

        // Extract deep link data from the data payload
        val navigateTo = message.data["navigate_to"]
        val contentId = message.data["content_id"]

        showNotification(title, body, navigateTo, contentId)
    }

    /**
     * Displays a notification with optional deep link navigation on tap.
     */
    private fun showNotification(
        title: String,
        body: String,
        navigateTo: String?,
        contentId: String?
    ) {
        // Build tap intent for deep link navigation
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!navigateTo.isNullOrBlank()) {
                putExtra("navigate_to", navigateTo)
            }
            if (!contentId.isNullOrBlank()) {
                putExtra("event_id", contentId)
                putExtra("restaurant_id", contentId)
                putExtra("attraction_id", contentId)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_GENERAL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_SOUND)
            .build()

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Check POST_NOTIFICATIONS permission for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(TAG, "POST_NOTIFICATIONS permission not granted, skipping notification display")
                return
            }
        }

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    /**
     * Creates the 'general' notification channel for push notifications.
     * Required for Android 8.0+ (API 26+).
     */
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_GENERAL,
            "General Notifications",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "General notifications from Des Moines Insider"
            enableVibration(true)
        }

        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "PushNotificationService"
        const val CHANNEL_GENERAL = "general"
        private const val PREFS_NAME = "push_notification_prefs"
        private const val KEY_DEVICE_TOKEN = "fcm_device_token"

        // Shared state accessible from outside the service
        private val _isRegistered = MutableStateFlow(false)
        val isRegistered: StateFlow<Boolean> = _isRegistered.asStateFlow()

        private val _deviceToken = MutableStateFlow<String?>(null)
        val deviceToken: StateFlow<String?> = _deviceToken.asStateFlow()

        /**
         * Initializes push notification registration.
         * Call from Application.onCreate() when push notifications are enabled.
         */
        fun initialize(context: Context) {
            if (!Config.ENABLE_PUSH_NOTIFICATIONS) {
                Log.d(TAG, "Push notifications disabled via Config")
                return
            }

            // Create the general notification channel
            val channel = NotificationChannel(
                CHANNEL_GENERAL,
                "General Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General notifications from Des Moines Insider"
                enableVibration(true)
            }
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)

            // Restore persisted token
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val savedToken = prefs.getString(KEY_DEVICE_TOKEN, null)
            if (savedToken != null) {
                _deviceToken.value = savedToken
                _isRegistered.value = true
            }

            // Request current FCM token
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    _deviceToken.value = token
                    _isRegistered.value = true
                    prefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()
                    Log.d(TAG, "FCM token obtained")
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "Failed to get FCM token: ${e.message}")
                }
        }

        /**
         * Syncs the device token to the backend via the 'register-device-token' edge function.
         * Mirrors iOS PushNotificationService.syncTokenToBackend().
         */
        suspend fun syncTokenToBackend(context: Context, token: String? = null) {
            val tokenToSync = token ?: _deviceToken.value ?: return

            try {
                val client = com.desmoines.aipulse.data.remote.SupabaseClientProvider.client ?: run {
                    Log.w(TAG, "Supabase client not configured, skipping token sync")
                    return
                }

                client.functions.invoke("register-device-token") {
                    body = buildJsonObject {
                        put("deviceToken", tokenToSync)
                        put("platform", "android")
                    }
                }

                Log.d(TAG, "Device token synced to backend")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync device token: ${e.message}")
            }
        }

        /**
         * Requests the POST_NOTIFICATIONS permission on Android 13+.
         * Returns true if permission is already granted or not needed (below API 33).
         */
        fun hasNotificationPermission(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            } else {
                true
            }
        }
    }
}
