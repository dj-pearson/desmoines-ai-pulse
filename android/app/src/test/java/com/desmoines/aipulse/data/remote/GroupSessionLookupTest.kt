package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SwipeSession
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Join-by-code goes through lookup_swipe_session (WEB-SEC-070). The table
 * read is the fallback only while the function is missing, and the RPC's row
 * (host_user_id null for a joiner, no filter_context) must still decode.
 */
class GroupSessionLookupTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `codes are trimmed and upper-cased`() {
        assertEquals("DSM-AB12", GroupSessionRemoteDataSource.normalizeCode("  dsm-ab12 "))
    }

    @Test
    fun `a missing function falls back to the table read`() {
        assertTrue(GroupSessionRemoteDataSource.isMissingFunction("PGRST202"))
        assertTrue(GroupSessionRemoteDataSource.isMissingFunction("42883"))
    }

    @Test
    fun `other errors surface instead of falling back`() {
        assertFalse(GroupSessionRemoteDataSource.isMissingFunction("42501"))
        assertFalse(GroupSessionRemoteDataSource.isMissingFunction(null))
    }

    @Test
    fun `the RPC row for a joiner decodes with no host id`() {
        val row = """
            [{"id":"s1","code":"DSM-AB12","host_user_id":null,"mode":"mixed",
              "status":"active","expires_at":"2999-01-01T00:00:00+00:00",
              "ended_at":null,"created_at":"2026-11-16T12:00:00+00:00"}]
        """.trimIndent()
        val session = json.decodeFromString<List<SwipeSession>>(row).single()
        assertNull(session.hostUserId)
        assertTrue(session.isLive())
    }
}
