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
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Everything needed to re-create a reminder alarm from scratch. Persisted
 * alongside the scheduled-id set so [LocalNotificationService.rescheduleAll]
 * can replay the alarms AlarmManager drops on reboot.
 */
@Serializable
internal data class ReminderRecord(
    val eventId: String,
    val title: String,
    val venue: String? = null,
    val eventTimeMillis: Long,
)

/**
 * Manages local notifications for event reminders.
 * Mirrors iOS LocalNotificationService.swift.
 *
 * Uses AlarmManager for precise scheduling and a BroadcastReceiver (NotificationReceiver)
 * for handling alarm triggers. Scheduled event IDs are persisted in SharedPreferences.
 */
@Singleton
class LocalNotificationService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val json: Json,
) {
    companion object {
        const val CHANNEL_ID = "event_reminders"
        const val CHANNEL_NAME = "Event Reminders"
        const val CHANNEL_DESCRIPTION = "Notifications for upcoming event reminders"

        internal const val PREFS_NAME = "event_reminders_prefs"
        internal const val KEY_SCHEDULED_IDS = "scheduled_event_ids"

        /**
         * Parallel store holding the payload needed to re-create each alarm
         * after a reboot, which AlarmManager does not survive.
         *
         * Kept separate from [KEY_SCHEDULED_IDS] so existing installs keep
         * working unchanged — they simply have no payload to replay for
         * reminders scheduled before this shipped.
         */
        private const val KEY_SCHEDULED_PAYLOADS = "scheduled_event_payloads"

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
            saveReminderRecord(ReminderRecord(eventId, title, venue, eventTimeMillis))
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
        removeReminderRecord(eventId)
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
            // Report what actually happened: scheduleReminder returns false for
            // an event less than an hour out or a denied exact-alarm permission,
            // and claiming "true" there left the UI showing a bell for a
            // reminder that was never set.
            scheduleReminder(eventId, title, venue, eventTimeMillis)
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
            toRemove.forEach { removeReminderRecord(it) }
            android.util.Log.d("DMI/notification", "Pruned ${before - ids.size} expired reminders")
        }
    }

    // endregion

    // region Reboot recovery

    /**
     * Re-creates every still-future reminder alarm from the persisted records.
     *
     * AlarmManager drops all pending alarms on reboot and on package replace,
     * so without this a reminder the user set days earlier simply never fires.
     * Called from [BootCompletedReceiver].
     *
     * Records whose reminder time has already passed are dropped rather than
     * replayed, so a device that was off over the event does not fire a "starts
     * in 1 hour" notification for something that already happened.
     */
    fun rescheduleAll(): Int {
        val records = loadReminderRecords()
        if (records.isEmpty()) return 0

        var restored = 0
        records.forEach { record ->
            val scheduled = scheduleReminder(
                eventId = record.eventId,
                title = record.title,
                venue = record.venue,
                eventTimeMillis = record.eventTimeMillis,
            )
            if (scheduled) {
                restored++
            } else {
                // Past its trigger time, or exact-alarm permission is gone.
                removeScheduledEventId(record.eventId)
                removeReminderRecord(record.eventId)
            }
        }
        return restored
    }

    private fun loadReminderRecords(): List<ReminderRecord> {
        val raw = prefs.getStringSet(KEY_SCHEDULED_PAYLOADS, emptySet()) ?: emptySet()
        return raw.mapNotNull { encoded ->
            runCatching { json.decodeFromString(ReminderRecord.serializer(), encoded) }.getOrNull()
        }
    }

    private fun saveReminderRecord(record: ReminderRecord) {
        val kept = loadReminderRecords()
            .filterNot { it.eventId == record.eventId }
            .plus(record)
        writeReminderRecords(kept)
    }

    private fun removeReminderRecord(eventId: String) {
        val kept = loadReminderRecords().filterNot { it.eventId == eventId }
        writeReminderRecords(kept)
    }

    private fun writeReminderRecords(records: List<ReminderRecord>) {
        val encoded = records
            .mapNotNull { runCatching { json.encodeToString(ReminderRecord.serializer(), it) }.getOrNull() }
            .toSet()
        prefs.edit().putStringSet(KEY_SCHEDULED_PAYLOADS, encoded).apply()
    }

    // endregion
}
