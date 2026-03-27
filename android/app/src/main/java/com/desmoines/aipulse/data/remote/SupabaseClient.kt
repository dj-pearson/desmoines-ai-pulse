package com.desmoines.aipulse.data.remote

import android.util.Log
import com.desmoines.aipulse.BuildConfig
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage

private const val TAG = "SupabaseClient"

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

    private fun createClient(): SupabaseClient? {
        val url = BuildConfig.SUPABASE_URL
        val key = BuildConfig.SUPABASE_ANON_KEY

        if (url.isBlank()) {
            Log.w(TAG, "SUPABASE_URL is missing or empty. Ensure it is set in local.properties.")
            return null
        }
        if (key.isBlank()) {
            Log.w(TAG, "SUPABASE_ANON_KEY is missing or empty. Ensure it is set in local.properties.")
            return null
        }

        return try {
            createSupabaseClient(
                supabaseUrl = url,
                supabaseKey = key
            ) {
                defaultHeaders["X-Client-Info"] = Config.CLIENT_INFO_HEADER

                install(Auth) {
                    flowType = FlowType.PKCE
                    scheme = Config.APP_BUNDLE_ID
                    host = "auth-callback"
                }

                install(Postgrest)
                install(Realtime)
                install(Storage)
            }.also {
                Log.i(TAG, "Supabase client initialized successfully.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create Supabase client: ${e.message}", e)
            null
        }
    }
}
