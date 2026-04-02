package com.desmoines.aipulse.util

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages local notifications for event reminders.
 * Mirrors iOS LocalNotificationService.swift.
 *
 * Uses AlarmManager for precise scheduling and a BroadcastReceiver (NotificationReceiver)
 * for handling alarm triggers. Scheduled event IDs are persisted in SharedPreferences.
 */
@Singleton
class LocalNotificationService @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    companion object {
        const val CHANNEL_ID = "event_reminders"
        const val CHANNEL_NAME = "Event Reminders"
        const val CHANNEL_DESCRIPTION = "Notifications for upcoming event reminders"

        private const val PREFS_NAME = "event_reminders_prefs"
        private const val KEY_SCHEDULED_IDS = "scheduled_event_ids"

        /** Reminder fires 1 hour before the event (matching iOS). */
        const val REMINDER_OFFSET_MILLIS = 3600_000L // 1 hour

        /** Extra keys for the notification intent. */
        const val EXTRA_EVENT_ID = "event_id"
        const val EXTRA_EVENT_TITLE = "event_title"
        const val EXTRA_EVENT_VENUE = "event_venue"
    }

    private val alarmManager: AlarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        createNotificationChannel()
    }

    // region Notification Channel

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = CHANNEL_DESCRIPTION
            enableVibration(true)
        }
        notificationManager.createNotificationChannel(channel)
    }

    // endregion

    // region Schedule Reminder

    /**
     * Schedules a local notification 1 hour before the event.
     * Matching iOS: `scheduleReminder(for event: Event)`.
     *
     * @param eventId Unique event ID.
     * @param title Event title.
     * @param venue Optional venue name.
     * @param eventTimeMillis Event start time in epoch millis.
     * @return true if scheduled successfully, false otherwise.
     */
    fun scheduleReminder(
        eventId: String,
        title: String,
        venue: String?,
        eventTimeMillis: Long
    ): Boolean {
        val triggerTime = eventTimeMillis - REMINDER_OFFSET_MILLIS

        // Don't schedule if the trigger time is already in the past
        if (triggerTime <= System.currentTimeMillis()) return false

        val intent = Intent(context, NotificationReceiver::class.java).apply {
            action = "com.desmoines.aipulse.EVENT_REMINDER"
            putExtra(EXTRA_EVENT_ID, eventId)
            putExtra(EXTRA_EVENT_TITLE, title)
            putExtra(EXTRA_EVENT_VENUE, venue)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            eventId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        try {
            // Use setExactAndAllowWhileIdle for precise timing even in Doze mode
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+ requires checking canScheduleExactAlarms
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                } else {
                    // Fall back to inexact alarm if exact alarm permission not granted
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                }
            } else {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }

            addScheduledEventId(eventId)
            return true
        } catch (e: SecurityException) {
            // Exact alarm permission denied
            android.util.Log.w("DMI/notification", "Cannot schedule exact alarm: ${e.message}")
            return false
        }
    }

    // endregion

    // region Cancel Reminder

    /**
     * Cancels a scheduled reminder for the given event.
     * Matching iOS: `cancelReminder(for eventId: String)`.
     */
    fun cancelReminder(eventId: String) {
        val intent = Intent(context, NotificationReceiver::class.java).apply {
            action = "com.desmoines.aipulse.EVENT_REMINDER"
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            eventId.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )

        pendingIntent?.let {
            alarmManager.cancel(it)
            it.cancel()
        }

        removeScheduledEventId(eventId)
    }

    // endregion

    // region Toggle

    /**
     * Toggles reminder on/off for the given event.
     * Matching iOS: `toggleReminder(for event: Event)`.
     *
     * @return true if reminder is now set, false if removed.
     */
    fun toggleReminder(
        eventId: String,
        title: String,
        venue: String?,
        eventTimeMillis: Long
    ): Boolean {
        return if (isReminderSet(eventId)) {
            cancelReminder(eventId)
            false
        } else {
            scheduleReminder(eventId, title, venue, eventTimeMillis)
            true
        }
    }

    // endregion

    // region Check

    /**
     * Returns true if a reminder is set for the given event.
     * Matching iOS: `isReminderSet(for eventId: String) -> Bool`.
     */
    fun isReminderSet(eventId: String): Boolean {
        return getScheduledEventIds().contains(eventId)
    }

    /**
     * Returns the set of all event IDs with scheduled reminders.
     * Matching iOS: `scheduledEventIds: Set<String>`.
     */
    fun getScheduledEventIds(): Set<String> {
        return prefs.getStringSet(KEY_SCHEDULED_IDS, emptySet()) ?: emptySet()
    }

    // endregion

    // region Persistence

    private fun addScheduledEventId(eventId: String) {
        val ids = getScheduledEventIds().toMutableSet()
        ids.add(eventId)
        prefs.edit().putStringSet(KEY_SCHEDULED_IDS, ids).apply()
    }

    private fun removeScheduledEventId(eventId: String) {
        val ids = getScheduledEventIds().toMutableSet()
        ids.remove(eventId)
        prefs.edit().putStringSet(KEY_SCHEDULED_IDS, ids).apply()
    }

    /**
     * Cleans up IDs for events whose reminder time has already passed.
     * Call on app launch to keep the persisted set accurate.
     */
    fun pruneExpiredReminders() {
        val ids = getScheduledEventIds().toMutableSet()
        val before = ids.size

        // Check if each PendingIntent still exists
        val toRemove = ids.filter { eventId ->
            val intent = Intent(context, NotificationReceiver::class.java).apply {
                action = "com.desmoines.aipulse.EVENT_REMINDER"
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                eventId.hashCode(),
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            pendingIntent == null // Alarm no longer exists
        }

        if (toRemove.isNotEmpty()) {
            ids.removeAll(toRemove.toSet())
            prefs.edit().putStringSet(KEY_SCHEDULED_IDS, ids).apply()
            android.util.Log.d("DMI/notification", "Pruned ${before - ids.size} expired reminders")
        }
    }

    // endregion
}
