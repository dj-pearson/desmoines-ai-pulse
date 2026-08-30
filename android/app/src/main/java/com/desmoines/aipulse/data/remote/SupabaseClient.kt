package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.BuildConfig
import com.desmoines.aipulse.util.CertificatePinningService
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.annotations.SupabaseInternal
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.DefaultRequest
import io.ktor.client.request.header
/**
 * Provides the configured Supabase client singleton.
 * Mirrors iOS SupabaseService.swift — graceful fallback when credentials are missing.
 */
object SupabaseClientProvider {

    /**
     * The Supabase client, or `null` if credentials were not configured at build time.
     */
    val client: SupabaseClient? = createClient()

    /**
     * A human-readable reason why the client could not be created, or `null` if configured.
     */
    val configurationError: String? = when {
        BuildConfig.SUPABASE_URL.isBlank() ->
            "SUPABASE_URL is missing. Add it to local.properties."
        BuildConfig.SUPABASE_ANON_KEY.isBlank() ->
            "SUPABASE_ANON_KEY is missing. Add it to local.properties."
        else -> null
    }

    /**
     * `true` when both Supabase credentials are present and valid.
     */
    val isConfigured: Boolean get() = client != null

    @OptIn(SupabaseInternal::class)
    private fun createClient(): SupabaseClient? {
        val url = BuildConfig.SUPABASE_URL
        val key = BuildConfig.SUPABASE_ANON_KEY

        if (url.isBlank()) {
            AppLogger.network.warning("SUPABASE_URL is missing or empty. Ensure it is set in local.properties.")
            return null
        }
        if (key.isBlank()) {
            AppLogger.network.warning("SUPABASE_ANON_KEY is missing or empty. Ensure it is set in local.properties.")
            return null
        }

        return try {
            createSupabaseClient(
                supabaseUrl = url,
                supabaseKey = key
            ) {
                // In Supabase Kotlin SDK v3, httpEngine is a property.
                // We provide a pre-configured OkHttp engine to support certificate pinning.
                httpEngine = OkHttp.create {
                    preconfigured = CertificatePinningService.createPinnedClient()
                }

                httpConfig {
                    install(DefaultRequest) {
                        header("X-Client-Info", Config.CLIENT_INFO_HEADER)
                    }
                }

                install(Auth) {
                    flowType = FlowType.PKCE
                    scheme = Config.APP_BUNDLE_ID
                    host = "auth-callback"
                }

                install(Functions)
                install(Postgrest)
                install(Realtime)
                install(Storage)
            }.also {
                AppLogger.network.info("Supabase client initialized successfully.")
            }
        } catch (e: Exception) {
            AppLogger.network.error("Failed to create Supabase client: ${e.message}", e)
            null
        }
    }
}
