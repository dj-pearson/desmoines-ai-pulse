package com.desmoines.aipulse.util

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.desmoines.aipulse.MainActivity
import com.desmoines.aipulse.R

/**
 * BroadcastReceiver that handles alarm triggers for event reminders.
 * Displays a notification when the alarm fires.
 *
 * The notification tap opens MainActivity with the event ID as an extra,
 * which navigates to EventDetailScreen.
 */
class NotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val eventId = intent.getStringExtra(LocalNotificationService.EXTRA_EVENT_ID) ?: return
        val eventTitle = intent.getStringExtra(LocalNotificationService.EXTRA_EVENT_TITLE) ?: "Event"
        val eventVenue = intent.getStringExtra(LocalNotificationService.EXTRA_EVENT_VENUE)

        // Build notification content matching iOS:
        // title = "Event Reminder"
        // body = "[title] starts in 1 hour" or "[title] starts in 1 hour at [venue]"
        val body = buildString {
            append("$eventTitle starts in 1 hour")
            if (!eventVenue.isNullOrBlank()) {
                append(" at $eventVenue")
            }
        }

        // Tap intent opens EventDetailScreen for this event
        val tapIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "event_detail")
            putExtra("event_id", eventId)
        }

        val tapPendingIntent = PendingIntent.getActivity(
            context,
            eventId.hashCode(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, LocalNotificationService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Event Reminder")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .build()

        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Check POST_NOTIFICATIONS permission for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
        }

        notificationManager.notify(eventId.hashCode(), notification)

        // Clean up the scheduled ID from SharedPreferences since it has fired
        val prefs = context.getSharedPreferences("event_reminders_prefs", Context.MODE_PRIVATE)
        val ids = prefs.getStringSet("scheduled_event_ids", emptySet())?.toMutableSet() ?: mutableSetOf()
        ids.remove(eventId)
        prefs.edit().putStringSet("scheduled_event_ids", ids).apply()
    }
}
