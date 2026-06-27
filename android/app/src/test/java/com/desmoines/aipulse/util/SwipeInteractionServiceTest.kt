package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class SwipeInteractionServiceTest {

    @Test
    fun `appendCapped adds a new key to the end`() {
        val result = SwipeInteractionService.appendCapped(listOf("a", "b"), "c", 10)
        assertEquals(listOf("a", "b", "c"), result)
    }

    @Test
    fun `appendCapped returns the same list when the key is already present`() {
        val current = listOf("a", "b")
        val result = SwipeInteractionService.appendCapped(current, "b", 10)
        assertSame(current, result)
    }

    @Test
    fun `appendCapped drops the oldest keys past the cap`() {
        val result = SwipeInteractionService.appendCapped(listOf("a", "b", "c"), "d", 3)
        assertEquals(listOf("b", "c", "d"), result)
    }
}
