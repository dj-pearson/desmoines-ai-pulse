package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import com.desmoines.aipulse.util.EventSlug
import com.desmoines.aipulse.util.UiFormatLocale
import com.desmoines.aipulse.util.markdown.MarkdownParser
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * A published guide / blog article from the `articles` table (web `/articles`
 * parity). Content is GitHub-flavored markdown. Mirrors iOS Article.
 */
@Immutable
@Serializable
data class Article(
    val id: String,
    val title: String,
    val slug: String = "",
    val content: String = "",
    val excerpt: String? = null,
    @SerialName("featured_image_url") val featuredImageUrl: String? = null,
    val category: String? = null,
    @SerialName("view_count") val viewCount: Int? = null,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    /** Best display category (web default "General"). */
    val displayCategory: String
        get() = category?.trim()?.takeIf { it.isNotEmpty() } ?: "General"

    /**
     * Short card/share summary: the excerpt, or a lead line derived from the
     * markdown body (first non-heading/image/quote line, inline syntax stripped).
     */
    val displaySummary: String
        get() {
            excerpt?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            val lead = content.split("\n")
                .map { it.trim() }
                .firstOrNull { it.isNotEmpty() && !it.startsWith("#") && !it.startsWith("![") && !it.startsWith(">") }
                .orEmpty()
            return lead.replace("**", "").replace("*", "").replace("`", "").take(180)
        }

    /**
     * The Des Moines day the guide went up: published_at, else created_at, as
     * iOS Article.date falls back. Read in Central, not in the timestamp's own
     * offset: Postgres sends +00:00, so a guide published at 8pm Central used
     * to read as the next day for every reader, and a row with no published_at
     * showed no date at all.
     */
    val displayDate: LocalDate?
        get() = publishedAt?.let(EventSlug::centralDate) ?: createdAt?.let(EventSlug::centralDate)

    /** "Nov 7, 2026", or null when neither timestamp parses. */
    val formattedDate: String?
        get() = displayDate?.format(DATE_FORMAT)

    /** "Nov 7, 2026 · 4 min read" for list cards and detail, like iOS's card meta. */
    val metaLine: String
        get() = listOfNotNull(formattedDate, "${MarkdownParser.readingMinutes(content)} min read")
            .joinToString(" \u00B7 ")

    companion object {
        private val DATE_FORMAT = DateTimeFormatter.ofPattern("MMM d, yyyy", UiFormatLocale)
    }
}
