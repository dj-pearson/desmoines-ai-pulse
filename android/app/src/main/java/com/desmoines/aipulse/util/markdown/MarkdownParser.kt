package com.desmoines.aipulse.util.markdown

/**
 * Minimal GitHub-flavored-markdown block parser (ANDP-031). Splits article
 * content into [MarkdownBlock]s for native rendering; inline spans (bold /
 * italic / code / links) are parsed at render time. Pure + unit-testable.
 *
 * Supported blocks: headings (1–6), paragraphs, ordered/unordered lists,
 * blockquotes, fenced code, horizontal rules, and standalone images.
 */
object MarkdownParser {

    private val headingRegex = Regex("^(#{1,6})\\s+(.*)$")
    private val bulletRegex = Regex("^[-*+]\\s+(.*)$")
    private val orderedRegex = Regex("^\\d+[.)]\\s+(.*)$")
    private val ruleRegex = Regex("^(-{3,}|\\*{3,}|_{3,})$")
    private val imageRegex = Regex("^!\\[(.*?)]\\((\\S+?)\\)$")

    fun parse(markdown: String): List<MarkdownBlock> {
        val blocks = mutableListOf<MarkdownBlock>()
        val lines = markdown.replace("\r\n", "\n").split("\n")
        var i = 0

        while (i < lines.size) {
            val line = lines[i]
            val trimmed = line.trim()

            when {
                trimmed.isEmpty() -> i++

                trimmed.startsWith("```") -> {
                    val code = StringBuilder()
                    i++
                    while (i < lines.size && !lines[i].trim().startsWith("```")) {
                        code.appendLine(lines[i])
                        i++
                    }
                    i++ // consume the closing fence
                    blocks += MarkdownBlock.Code(code.toString().trimEnd('\n'))
                }

                ruleRegex.matches(trimmed) -> {
                    blocks += MarkdownBlock.Rule
                    i++
                }

                imageRegex.matches(trimmed) -> {
                    val m = imageRegex.find(trimmed)!!
                    blocks += MarkdownBlock.Image(url = m.groupValues[2], alt = m.groupValues[1])
                    i++
                }

                headingRegex.matches(trimmed) -> {
                    val m = headingRegex.find(trimmed)!!
                    blocks += MarkdownBlock.Heading(level = m.groupValues[1].length, text = m.groupValues[2].trim())
                    i++
                }

                trimmed.startsWith(">") -> {
                    val quote = StringBuilder()
                    while (i < lines.size && lines[i].trim().startsWith(">")) {
                        quote.appendLine(lines[i].trim().removePrefix(">").trim())
                        i++
                    }
                    blocks += MarkdownBlock.Quote(quote.toString().trim())
                }

                bulletRegex.matches(trimmed) -> {
                    val items = mutableListOf<String>()
                    while (i < lines.size && bulletRegex.matches(lines[i].trim())) {
                        items += bulletRegex.find(lines[i].trim())!!.groupValues[1].trim()
                        i++
                    }
                    blocks += MarkdownBlock.BulletList(items)
                }

                orderedRegex.matches(trimmed) -> {
                    val items = mutableListOf<String>()
                    while (i < lines.size && orderedRegex.matches(lines[i].trim())) {
                        items += orderedRegex.find(lines[i].trim())!!.groupValues[1].trim()
                        i++
                    }
                    blocks += MarkdownBlock.OrderedList(items)
                }

                else -> {
                    // Paragraph: gather consecutive plain lines.
                    val para = StringBuilder()
                    while (i < lines.size) {
                        val l = lines[i]
                        val t = l.trim()
                        if (t.isEmpty() || t.startsWith("```") || t.startsWith(">") ||
                            headingRegex.matches(t) || bulletRegex.matches(t) ||
                            orderedRegex.matches(t) || ruleRegex.matches(t) || imageRegex.matches(t)
                        ) {
                            break
                        }
                        if (para.isNotEmpty()) para.append(' ')
                        para.append(t)
                        i++
                    }
                    if (para.isNotEmpty()) blocks += MarkdownBlock.Paragraph(para.toString())
                }
            }
        }
        return blocks
    }

    /** Reading-time estimate at ~200 wpm (min 1). */
    fun readingMinutes(content: String): Int {
        val words = content.split(Regex("\\s+")).count { it.isNotBlank() }
        return (words / 200).coerceAtLeast(1)
    }
}
