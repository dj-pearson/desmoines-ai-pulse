package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.local.CacheManager
import com.desmoines.aipulse.data.local.CachedEventsPage
import com.desmoines.aipulse.data.local.dao.AttractionDao
import com.desmoines.aipulse.data.local.dao.CacheMetadataDao
import com.desmoines.aipulse.data.local.dao.EventDao
import com.desmoines.aipulse.data.local.dao.RestaurantDao
import com.desmoines.aipulse.data.local.entity.CacheMetadata
import com.desmoines.aipulse.data.local.entity.CachedEvent
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsRemoteDataSource
import com.desmoines.aipulse.data.remote.EventsResponse
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * AND-OVH-019: a cached first page used to report hasMore = false, which ended
 * infinite scroll for the life of the 5-minute TTL, and fetchEvent served a
 * cached row at any age. A real CacheManager over mocked DAOs, so the
 * metadata round trip (total_count) is what is under test.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EventsRepositoryCacheTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val eventDao = mockk<EventDao>(relaxed = true)
    private val metadataDao = mockk<CacheMetadataDao>(relaxed = true)
    private val cacheManager = CacheManager(
        eventDao = eventDao,
        restaurantDao = mockk<RestaurantDao>(relaxed = true),
        attractionDao = mockk<AttractionDao>(relaxed = true),
        cacheMetadataDao = metadataDao,
        json = json,
    )
    private val remote = mockk<EventsRemoteDataSource>()
    private val repository = EventsRepositoryImpl(remote, cacheManager)

    private fun event(id: String) = Event(id = id, title = "Event $id", date = "2026-11-01T19:00:00Z")

    private fun page(size: Int, prefix: String = "e") = (1..size).map { event("$prefix$it") }

    private fun rows(key: String, events: List<Event>, cachedAt: Long = System.currentTimeMillis()) =
        events.map { CachedEvent(it.id, json.encodeToString(it), key, cachedAt) }

    private fun freshMetadata(key: String, itemCount: Int, totalCount: Int?) = CacheMetadata(
        cacheKey = key,
        cachedAt = System.currentTimeMillis(),
        ttlMinutes = 5,
        itemCount = itemCount,
        totalCount = totalCount,
    )

    private fun expiredMetadata(key: String) = CacheMetadata(
        cacheKey = key,
        cachedAt = System.currentTimeMillis() - 60 * 60_000L,
        ttlMinutes = 5,
        itemCount = 1,
    )

    private fun listKey(query: EventsQuery) = CacheManager.eventsKey(
        "list", query.searchText, query.category, query.dateStart, query.dateEnd,
        query.isFeatured, query.limit, query.offset,
    )

    // region cachedEventsResponse

    @Test
    fun `a cached first page with more rows on the server reports hasMore`() {
        val response = cachedEventsResponse(
            CachedEventsPage(events = page(20), totalCount = 45),
            EventsQuery(limit = 20, offset = 0),
        )
        assertTrue(response.hasMore)
        assertEquals(45, response.totalCount)
    }

    @Test
    fun `a cached last page reports no more`() {
        val response = cachedEventsResponse(
            CachedEventsPage(events = page(5), totalCount = 45),
            EventsQuery(limit = 20, offset = 40),
        )
        assertFalse(response.hasMore)
    }

    @Test
    fun `a page that exactly reaches the total reports no more`() {
        val response = cachedEventsResponse(
            CachedEventsPage(events = page(20), totalCount = 20),
            EventsQuery(limit = 20, offset = 0),
        )
        assertFalse(response.hasMore)
    }

    @Test
    fun `a page cached without a count falls back to full page means more`() {
        val query = EventsQuery(limit = 20, offset = 0)
        assertTrue(cachedEventsResponse(CachedEventsPage(page(20), totalCount = null), query).hasMore)
        assertFalse(cachedEventsResponse(CachedEventsPage(page(7), totalCount = null), query).hasMore)
    }

    // endregion

    // region fetchEvents through the cache

    @Test
    fun `remote page one is cached with its total count`() = runTest {
        val query = EventsQuery(limit = 20, offset = 0)
        coEvery { metadataDao.get(any()) } returns null
        coEvery { remote.fetchEvents(query) } returns EventsResponse(page(20), totalCount = 45, hasMore = true)
        val stored = slot<CacheMetadata>()
        coEvery { metadataDao.upsert(capture(stored)) } returns Unit

        repository.fetchEvents(query).getOrThrow()

        assertEquals(45, stored.captured.totalCount)
        assertEquals(20, stored.captured.itemCount)
    }

    @Test
    fun `a fresh cached page one reports hasMore without calling the server`() = runTest {
        val query = EventsQuery(limit = 20, offset = 0)
        val key = listKey(query)
        coEvery { metadataDao.get(key) } returns freshMetadata(key, itemCount = 20, totalCount = 45)
        coEvery { eventDao.getAllByKey(key) } returns rows(key, page(20))

        val response = repository.fetchEvents(query).getOrThrow()

        assertTrue(response.hasMore, "a cached first page ended infinite scroll")
        assertEquals(45, response.totalCount)
        assertEquals(20, response.events.size)
        coVerify(exactly = 0) { remote.fetchEvents(any()) }
    }

    @Test
    fun `the stale page served offline also keeps hasMore`() = runTest {
        val query = EventsQuery(limit = 20, offset = 0)
        val key = listKey(query)
        coEvery { metadataDao.get(key) } returns freshMetadata(key, itemCount = 20, totalCount = 45)
            .copy(cachedAt = System.currentTimeMillis() - 60 * 60_000L)
        coEvery { eventDao.getAllByKey(key) } returns rows(key, page(20))
        coEvery { remote.fetchEvents(query) } throws IllegalStateException("offline")

        val response = repository.fetchEvents(query).getOrThrow()

        assertTrue(response.hasMore)
        coVerify(exactly = 1) { remote.fetchEvents(query) }
    }

    // endregion

    // region fetchEvent TTL

    @Test
    fun `fetchEvent serves a fresh cached row without calling the server`() = runTest {
        val key = "events:list|20|0"
        coEvery { eventDao.getById("e1") } returns rows(key, listOf(event("e1"))).single()
        coEvery { metadataDao.get(key) } returns freshMetadata(key, itemCount = 1, totalCount = null)

        assertEquals("e1", repository.fetchEvent("e1").getOrThrow().id)
        coVerify(exactly = 0) { remote.fetchEvent(any()) }
    }

    @Test
    fun `fetchEvent refetches when the cached row is past its TTL`() = runTest {
        val key = "events:list|20|0"
        coEvery { eventDao.getById("e1") } returns rows(key, listOf(event("e1"))).single()
        coEvery { metadataDao.get(key) } returns expiredMetadata(key)
        coEvery { remote.fetchEvent("e1") } returns event("e1").copy(title = "Updated")

        val result = repository.fetchEvent("e1").getOrThrow()

        assertEquals("Updated", result.title)
        coVerify(exactly = 1) { remote.fetchEvent("e1") }
    }

    @Test
    fun `fetchEvent falls back to the stale row when the server fails`() = runTest {
        val key = "events:list|20|0"
        coEvery { eventDao.getById("e1") } returns rows(key, listOf(event("e1"))).single()
        coEvery { metadataDao.get(key) } returns expiredMetadata(key)
        coEvery { remote.fetchEvent("e1") } throws IllegalStateException("offline")

        assertEquals("e1", repository.fetchEvent("e1").getOrThrow().id)
    }

    @Test
    fun `fetchEvent with no cached row and a failing server fails`() = runTest {
        coEvery { eventDao.getById("e1") } returns null
        coEvery { remote.fetchEvent("e1") } throws IllegalStateException("offline")

        assertTrue(repository.fetchEvent("e1").isFailure)
    }

    // endregion
}
