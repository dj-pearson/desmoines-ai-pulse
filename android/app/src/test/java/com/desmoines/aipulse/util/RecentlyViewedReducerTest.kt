package com.desmoines.aipulse.util

import com.desmoines.aipulse.data.model.RecentItem
import com.desmoines.aipulse.data.model.RecentItemType
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RecentlyViewedReducerTest {

    private fun item(id: String, type: RecentItemType = RecentItemType.EVENT) =
        RecentItem(type, id, "Title $id")

    @Test
    fun `prepends newest item`() {
        val result = RecentlyViewedService.reduce(listOf(item("a")), item("b"))
        assertEquals(listOf("b", "a"), result.map { it.id })
    }

    @Test
    fun `dedupes by type and id, moving to front`() {
        val current = listOf(item("a"), item("b"), item("c"))
        val result = RecentlyViewedService.reduce(current, item("c"))
        assertEquals(listOf("c", "a", "b"), result.map { it.id })
    }

    @Test
    fun `same id different type is not a duplicate`() {
        val current = listOf(item("a", RecentItemType.EVENT))
        val result = RecentlyViewedService.reduce(current, item("a", RecentItemType.RESTAURANT))
        assertEquals(2, result.size)
    }

    @Test
    fun `caps at MAX_ITEMS`() {
        val current = (1..RecentlyViewedService.MAX_ITEMS).map { item("e$it") }
        val result = RecentlyViewedService.reduce(current, item("new"))
        assertEquals(RecentlyViewedService.MAX_ITEMS, result.size)
        assertEquals("new", result.first().id)
        assertEquals("e${RecentlyViewedService.MAX_ITEMS - 1}", result.last().id)
    }
}
