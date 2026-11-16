package com.desmoines.aipulse.util

import kotlinx.serialization.SerializationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * AND-AUDIT-042, slice 3a: the series read's body decoded into
 * [SeriesEventRow]s, the switches included and bad rows dropped, as iOS
 * LossySeriesRows does.
 */
class SeriesEventRowsTest {

    @Test
    fun `reads the event and the three switches from one object`() {
        val rows = SeriesEventRows.decode(
            """
            [
              {"id":"a","title":"Cloris Awards 2025","date":"2025-10-02T23:00:00+00:00",
               "venue":"Civic Center","is_hidden":true,"hidden_at":"2025-10-05T08:00:00+00:00",
               "archived_at":null,"source_url_broken":false,"is_merged":false},
              {"id":"b","title":"Cloris Awards 2026","date":"2026-10-02T23:00:00+00:00",
               "archived_at":"2026-10-10T08:00:00+00:00"}
            ]
            """.trimIndent(),
        )
        assertEquals(listOf("a", "b"), rows.map { it.event.id })

        val swept = rows[0]
        assertEquals("Civic Center", swept.event.venue)
        assertEquals(true, swept.isHidden)
        assertEquals("2025-10-05T08:00:00+00:00", swept.hiddenAt)
        assertNull(swept.archivedAt)
        assertFalse(swept.isLive)

        val archived = rows[1]
        assertNull(archived.isHidden)
        assertEquals("2026-10-10T08:00:00+00:00", archived.archivedAt)
        assertFalse(archived.isLive)
    }

    @Test
    fun `a row without the switches is live`() {
        val rows = SeriesEventRows.decode("""[{"id":"a","title":"Panda Fest","date":"2026-08-01"}]""")
        assertEquals(1, rows.size)
        assertTrue(rows[0].isLive)
    }

    @Test
    fun `a row that does not decode is dropped, not the page`() {
        val rows = SeriesEventRows.decode(
            """
            [
              {"id":"a","title":null,"date":"2019-06-01"},
              {"id":"b","date":"2020-06-01"},
              {"id":"c","title":"Jazz in July","date":"2026-07-01","is_hidden":"yes"},
              "not an object",
              {"id":"d","title":"Jazz in July","date":"2026-07-08"}
            ]
            """.trimIndent(),
        )
        assertEquals(listOf("d"), rows.map { it.event.id })
    }

    @Test
    fun `an empty array is no rows`() {
        assertEquals(emptyList<SeriesEventRow>(), SeriesEventRows.decode("[]"))
    }

    @Test
    fun `a body that is not an array is an error`() {
        assertThrows<SerializationException> {
            SeriesEventRows.decode("""{"code":"42P01","message":"relation does not exist"}""")
        }
    }
}
