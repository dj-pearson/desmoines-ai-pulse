package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FetchGenerationTest {

    @Test
    fun `a freshly begun token is current`() {
        val gen = FetchGeneration()
        val token = gen.bump()
        assertTrue(gen.isCurrent(token))
    }

    @Test
    fun `bumping supersedes the previous token`() {
        val gen = FetchGeneration()
        val older = gen.bump()
        val newer = gen.bump()

        assertFalse(gen.isCurrent(older))
        assertTrue(gen.isCurrent(newer))
    }

    @Test
    fun `a load-more rides the current token without superseding it`() {
        val gen = FetchGeneration()
        val reset = gen.bump()
        val loadMore = gen.current() // continuation captures current, no bump

        assertTrue(gen.isCurrent(reset))
        assertTrue(gen.isCurrent(loadMore))
    }

    @Test
    fun `a reset drops an in-flight load-more`() {
        val gen = FetchGeneration()
        gen.bump()
        val loadMore = gen.current() // load-more starts
        gen.bump() // a reset lands while it's in flight

        assertFalse(gen.isCurrent(loadMore))
    }

    @Test
    fun `only the latest of several rapid resets survives`() {
        val gen = FetchGeneration()
        val tokens = (1..5).map { gen.bump() }

        tokens.dropLast(1).forEach { assertFalse(gen.isCurrent(it)) }
        assertTrue(gen.isCurrent(tokens.last()))
    }
}
