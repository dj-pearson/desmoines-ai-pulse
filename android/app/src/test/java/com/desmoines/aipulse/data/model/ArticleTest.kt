package com.desmoines.aipulse.data.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.LocalDate

class ArticleTest {

    private fun article(
        publishedAt: String? = null,
        createdAt: String? = null,
        content: String = "",
    ) = Article(id = "a1", title = "Guide", content = content, publishedAt = publishedAt, createdAt = createdAt)

    @Test
    fun `an evening publish is dated on the Des Moines day, not the UTC day`() {
        // 8pm CST on Nov 6 is 02:00 UTC on Nov 7, which is what Postgres sends.
        val a = article(publishedAt = "2026-11-07T02:00:00+00:00")
        assertEquals(LocalDate.of(2026, 11, 6), a.displayDate)
        assertEquals("Nov 6, 2026", a.formattedDate)
    }

    @Test
    fun `PostgREST short offsets and microseconds parse`() {
        assertEquals("Jul 3, 2026", article(publishedAt = "2026-07-04 03:30:00.123456+00").formattedDate)
    }

    @Test
    fun `a daytime publish keeps its day`() {
        assertEquals("Mar 4, 2026", article(publishedAt = "2026-03-04T18:00:00Z").formattedDate)
    }

    @Test
    fun `created_at stands in when published_at is missing or unparseable`() {
        assertEquals("Mar 4, 2026", article(createdAt = "2026-03-04T18:00:00Z").formattedDate)
        assertEquals("Mar 4, 2026", article(publishedAt = "", createdAt = "2026-03-04T18:00:00Z").formattedDate)
        assertEquals("Mar 4, 2026", article(publishedAt = "soon", createdAt = "2026-03-04T18:00:00Z").formattedDate)
    }

    @Test
    fun `published_at wins over created_at`() {
        val a = article(publishedAt = "2026-05-01T15:00:00Z", createdAt = "2026-04-20T15:00:00Z")
        assertEquals("May 1, 2026", a.formattedDate)
    }

    @Test
    fun `a bare date is that day`() {
        assertEquals("Mar 4, 2026", article(publishedAt = "2026-03-04").formattedDate)
    }

    @Test
    fun `no timestamps means no date`() {
        assertNull(article().formattedDate)
    }

    @Test
    fun `metaLine carries date and reading time, or reading time alone`() {
        val body = List(400) { "word" }.joinToString(" ")
        assertEquals(
            "Nov 6, 2026 · 2 min read",
            article(publishedAt = "2026-11-07T02:00:00Z", content = body).metaLine,
        )
        assertEquals("1 min read", article(content = "short").metaLine)
    }
}
