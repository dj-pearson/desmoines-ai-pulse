package com.desmoines.aipulse.util.markdown

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MarkdownParserTest {

    @Test
    fun `parses headings of all levels`() {
        val blocks = MarkdownParser.parse("# H1\n\n###### H6")
        assertEquals(MarkdownBlock.Heading(1, "H1"), blocks[0])
        assertEquals(MarkdownBlock.Heading(6, "H6"), blocks[1])
    }

    @Test
    fun `gathers a paragraph from consecutive lines`() {
        val blocks = MarkdownParser.parse("Line one\nline two\n\nNext para")
        assertEquals(MarkdownBlock.Paragraph("Line one line two"), blocks[0])
        assertEquals(MarkdownBlock.Paragraph("Next para"), blocks[1])
    }

    @Test
    fun `parses unordered and ordered lists`() {
        val bullets = MarkdownParser.parse("- a\n- b\n* c")
        assertEquals(MarkdownBlock.BulletList(listOf("a", "b", "c")), bullets[0])

        val ordered = MarkdownParser.parse("1. first\n2. second")
        assertEquals(MarkdownBlock.OrderedList(listOf("first", "second")), ordered[0])
    }

    @Test
    fun `parses blockquotes, fenced code, rules, and images`() {
        val quote = MarkdownParser.parse("> a quote\n> spanning")
        assertEquals(MarkdownBlock.Quote("a quote\nspanning"), quote[0])

        val code = MarkdownParser.parse("```\nval x = 1\n```")
        assertEquals(MarkdownBlock.Code("val x = 1"), code[0])

        assertEquals(MarkdownBlock.Rule, MarkdownParser.parse("---")[0])

        val image = MarkdownParser.parse("![alt text](https://x.test/i.png)")
        assertEquals(MarkdownBlock.Image("https://x.test/i.png", "alt text"), image[0])
    }

    @Test
    fun `code fence preserves inner markdown characters as-is`() {
        val code = MarkdownParser.parse("```\n# not a heading\n- not a bullet\n```")
        assertEquals(MarkdownBlock.Code("# not a heading\n- not a bullet"), code[0])
    }

    @Test
    fun `reading time is words over 200 wpm, min 1`() {
        assertEquals(1, MarkdownParser.readingMinutes("just a few words"))
        assertEquals(2, MarkdownParser.readingMinutes(List(400) { "word" }.joinToString(" ")))
    }
}
