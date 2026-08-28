package com.desmoines.aipulse.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Restores event reminder alarms after a device restart or an app update.
 *
 * AlarmManager clears every pending alarm on reboot and on package replace, so
 * a reminder the user set days earlier silently never fires. The app's own
 * launch path made this worse: `pruneExpiredReminders()` sees the PendingIntent
 * is gone and drops the id, so the reminder also disappears from the UI with no
 * trace. Replaying from the persisted records here happens before the app is
 * next opened, so prune finds live alarms and leaves them alone.
 */
@AndroidEntryPoint
class BootCompletedReceiver : BroadcastReceiver() {

    @Inject
    lateinit var localNotificationService: LocalNotificationService

    override fun onReceive(context: Context, intent: Intent) {
        // Required: Hilt performs the field injection inside the generated
        // superclass's onReceive. Skipping it leaves localNotificationService
        // uninitialised and throws on first touch.
        super.onReceive(context, intent)

        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        // Rescheduling touches SharedPreferences and AlarmManager for every
        // saved reminder. onReceive runs on the main thread with a ~10s budget,
        // so hand the work to IO and hold the broadcast open until it finishes.
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val restored = localNotificationService.rescheduleAll()
                AppLogger.general.info("Restored $restored event reminders after ${intent.action}")
            } catch (e: Exception) {
                AppLogger.general.error("Failed to restore event reminders", e)
            } finally {
                pendingResult.finish()
            }
        }
    }
}
