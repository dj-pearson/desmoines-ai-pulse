package com.desmoines.aipulse.util.markdown

/** A parsed top-level markdown block. Mirrors the iOS MarkdownBlock enum. */
sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock
    data class Paragraph(val text: String) : MarkdownBlock
    data class BulletList(val items: List<String>) : MarkdownBlock
    data class OrderedList(val items: List<String>) : MarkdownBlock
    data class Quote(val text: String) : MarkdownBlock
    data class Code(val text: String) : MarkdownBlock
    data class Image(val url: String, val alt: String) : MarkdownBlock
    data object Rule : MarkdownBlock
}
