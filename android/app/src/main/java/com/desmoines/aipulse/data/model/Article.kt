package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
}
