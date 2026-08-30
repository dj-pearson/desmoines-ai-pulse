package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SearchHistoryReducerTest {

    @Test
    fun `prepends newest query`() {
        assertEquals(listOf("b", "a"), SearchHistoryService.reduce(listOf("a"), "b"))
    }

    @Test
    fun `dedupes case-insensitively, moving to front`() {
        val result = SearchHistoryService.reduce(listOf("Pizza", "Tacos"), "pizza")
        assertEquals(listOf("pizza", "Tacos"), result)
    }

    @Test
    fun `trims whitespace`() {
        assertEquals(listOf("brunch"), SearchHistoryService.reduce(emptyList(), "  brunch  "))
    }

    @Test
    fun `ignores blank input`() {
        val current = listOf("a")
        assertEquals(current, SearchHistoryService.reduce(current, "   "))
    }

    @Test
    fun `caps at MAX_ITEMS`() {
        val current = (1..SearchHistoryService.MAX_ITEMS).map { "q$it" }
        val result = SearchHistoryService.reduce(current, "new")
        assertEquals(SearchHistoryService.MAX_ITEMS, result.size)
        assertEquals("new", result.first())
    }
}
