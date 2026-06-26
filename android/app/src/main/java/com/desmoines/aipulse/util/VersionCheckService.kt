package com.desmoines.aipulse.util

import com.desmoines.aipulse.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/** Parsed `version-check` response. Additive — unknown keys ignored. */
@Serializable
data class VersionCheckResult(
    val platform: String = "android",
    val currentVersion: String = "",
    val minSupportedVersion: String = "",
    val latestVersion: String = "",
    val forceUpgrade: Boolean = false,
    val updateAvailable: Boolean = false,
    val storeUrl: String = DEFAULT_STORE_URL,
    val message: String = "",
) {
    companion object {
        const val DEFAULT_STORE_URL =
            "https://play.google.com/store/apps/details?id=com.desmoines.aipulse"
    }
}

/**
 * Launch-time minimum-version gate. Mirrors iOS VersionCheckService.swift.
 *
 * Calls the public `version-check` edge function with the running platform + version.
 * Fails open: any network/parse error leaves [state] non-blocking, so the app is never
 * stuck behind a transient backend issue. When forceUpgrade is true the UI shows a
 * blocking ForceUpdateScreen.
 */
@Singleton
class VersionCheckService @Inject constructor(
    private val client: SupabaseClient?,
    private val json: Json,
) {
    private val _state = MutableStateFlow(VersionCheckResult())
    val state: StateFlow<VersionCheckResult> = _state.asStateFlow()

    /** Query the backend once. Safe to call on launch; never throws. */
    suspend fun check() {
        val supabase = client ?: return
        try {
            val payload = buildJsonObject {
                put("platform", "android")
                put("version", BuildConfig.VERSION_NAME)
            }
            val body = supabase.functions("version-check", body = payload).bodyAsText()
            _state.value = json.decodeFromString(VersionCheckResult.serializer(), body)
        } catch (error: Throwable) {
            // Fail open — leave the default non-blocking state.
            AppLogger.network.warning("version-check failed (failing open): ${error.message}")
        }
    }
}
