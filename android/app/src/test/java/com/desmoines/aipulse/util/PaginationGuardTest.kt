package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PaginationGuardTest {

    private data class Row(val id: String)

    private fun validate(page: List<String>, limit: Int, existing: Set<String> = emptySet()) =
        PaginationGuard.validatePage(page.map(::Row), limit, existing) { it.id }

    @Test
    fun `a within-limit non-overlapping page is valid`() {
        val result = validate(listOf("a", "b", "c"), limit = 20, existing = setOf("x", "y"))
        assertTrue(result.isValid)
    }

    @Test
    fun `a full page exactly at the limit is valid`() {
        val result = validate((1..20).map { it.toString() }, limit = 20)
        assertTrue(result.isValid)
    }

    @Test
    fun `an oversized page is invalid`() {
        val result = validate((1..21).map { it.toString() }, limit = 20)
        assertFalse(result.isValid)
        assertTrue(result is PaginationGuard.Result.Invalid)
    }

    @Test
    fun `a page repeating an already-loaded id is invalid`() {
        val result = validate(listOf("c", "d"), limit = 20, existing = setOf("a", "b", "c"))
        assertFalse(result.isValid)
    }

    @Test
    fun `an empty page is valid`() {
        assertTrue(validate(emptyList(), limit = 20, existing = setOf("a")).isValid)
    }

    @Test
    fun `a non-positive limit disables the size check`() {
        // limit 0 means "unbounded" — only overlap can invalidate.
        assertTrue(validate((1..50).map { it.toString() }, limit = 0).isValid)
    }
}
