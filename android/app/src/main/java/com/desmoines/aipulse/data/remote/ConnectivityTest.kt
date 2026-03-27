package com.desmoines.aipulse.data.remote

import android.util.Log
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val TAG = "ConnectivityTest"

/**
 * Simple connectivity test that queries the events table to verify
 * that the Supabase client is properly configured and can reach the backend.
 */
object ConnectivityTest {

    /**
     * Queries the events table for a single row to verify connectivity.
     * Returns `true` if the query succeeds, `false` otherwise.
     */
    suspend fun testConnection(): Boolean = withContext(Dispatchers.IO) {
        val client = SupabaseClientProvider.client
        if (client == null) {
            Log.w(TAG, "Supabase client not configured: ${SupabaseClientProvider.configurationError}")
            return@withContext false
        }

        try {
            client.postgrest.from("events")
                .select {
                    limit(1)
                }
            Log.i(TAG, "Supabase connectivity test PASSED — successfully queried events table.")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Supabase connectivity test FAILED: ${e.message}", e)
            false
        }
    }
}
