package com.desmoines.aipulse

import android.app.Application
import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.util.LocalNotificationService
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class DesMoinesInsiderApp : Application() {

    @Inject lateinit var cacheManager: CacheManager
    @Inject lateinit var localNotificationService: LocalNotificationService

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        appScope.launch { cacheManager.pruneExpired() }
        // Clean up reminder IDs for alarms that have already fired
        localNotificationService.pruneExpiredReminders()
    }
}
