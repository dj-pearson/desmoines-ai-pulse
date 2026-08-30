package com.desmoines.aipulse.data.local

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.desmoines.aipulse.data.local.entity.CacheMetadata
import com.desmoines.aipulse.data.model.Event
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Offline cache lifetime, against a real database (AND-AUDIT-014 AC4).
 *
 * The Room layer had no tests of any kind. It is also the layer where a defect
 * is least visible from the outside: every read is wrapped in a try/catch that
 * returns null, and every repository turns null into "we could not load that",
 * which is indistinguishable from being offline - which is precisely when this
 * code runs.
 *
 * WHAT THESE PIN DOWN is the interaction between two different expiry models
 * that live in one method. pruneExpired() removes ENTITY rows older than
 * PRUNE_AGE_HOURS (24h) and metadata rows past their TTL (5 minutes). Those are
 * not the same clock, and the TTL is not a lifetime - CacheManager reads it at
 * query time via metadata.isExpired, which is what allowStale exists to
 * override.
 *
 * An in-memory database rather than a mock: the bug is in what SQL each DELETE
 * actually matches, and a mocked DAO would have agreed with whatever I believed.
 */
@RunWith(AndroidJUnit4::class)
class CacheManagerPruneTest {

    private lateinit var db: AppDatabase
    private lateinit var cache: CacheManager

    private val hourMillis = 3_600_000L

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).build()
        cache = CacheManager(
            db.eventDao(),
            db.restaurantDao(),
            db.attractionDao(),
            db.cacheMetadataDao(),
            Json { ignoreUnknownKeys = true },
        )
    }

    @After
    fun tearDown() = db.close()

    private fun event(id: String) = Event(id = id, title = "Event $id", date = "2026-09-01")

    /** Cache a key, then backdate both its rows and its metadata by [ageMillis]. */
    private suspend fun cacheAged(key: String, ageMillis: Long, ttlMinutes: Int = 5) {
        cache.cacheEvents(key, listOf(event("e1"), event("e2")), ttlMinutes = ttlMinutes)
        val then = System.currentTimeMillis() - ageMillis
        for (row in db.eventDao().getAllByKey(key)) {
            db.eventDao().insertAll(listOf(row.copy(cachedAt = then)))
        }
        db.cacheMetadataDao().upsert(
            CacheMetadata(cacheKey = key, cachedAt = then, ttlMinutes = ttlMinutes, itemCount = 2),
        )
    }

    @Test
    fun freshCacheReadsBack() = runBlocking {
        cache.cacheEvents("events:fresh", listOf(event("e1")))

        assertEquals(1, cache.getCachedEvents("events:fresh")?.size)
    }

    @Test
    fun anExpiredKeyIsWithheldUnlessStaleIsAllowed() = runBlocking {
        cacheAged("events:stale", ageMillis = 10 * 60_000L)

        assertNull("an expired key was served as fresh", cache.getCachedEvents("events:stale"))
        assertEquals(2, cache.getCachedEvents("events:stale", allowStale = true)?.size)
    }

    /**
     * THE ONE THAT MATTERS. pruneExpired runs in DesMoinesInsiderApp.onCreate,
     * so it runs before the first read of every launch. If it removes the
     * metadata for a key whose rows it deliberately kept, allowStale can never
     * find them again: getCachedEvents starts at `cacheMetadataDao.get(key)
     * ?: return null`, and the repositories turn that null into the error the
     * user sees. The result is an offline mode that works for five minutes and
     * then reports nothing cached while a day of rows sits in the database.
     */
    @Test
    fun pruningKeepsStaleCacheReadableForAsLongAsItKeepsTheRows() = runBlocking {
        cacheAged("events:offline", ageMillis = 2 * hourMillis)

        cache.pruneExpired()

        assertNotNull(
            "pruneExpired deleted the metadata for a key whose rows it kept, so the offline " +
                "path can no longer read them",
            cache.getCachedEvents("events:offline", allowStale = true),
        )
        assertEquals(2, cache.getCachedEvents("events:offline", allowStale = true)?.size)
    }

    @Test
    fun pruningStillRemovesEverythingOlderThanTheRetentionWindow() = runBlocking {
        cacheAged("events:ancient", ageMillis = 30 * hourMillis)

        cache.pruneExpired()

        assertEquals(0, db.eventDao().count())
        assertNull(db.cacheMetadataDao().get("events:ancient"))
        assertNull(cache.getCachedEvents("events:ancient", allowStale = true))
    }

    @Test
    fun pruningLeavesFreshEntriesAlone() = runBlocking {
        cache.cacheEvents("events:new", listOf(event("e1")))

        cache.pruneExpired()

        assertEquals(1, cache.getCachedEvents("events:new")?.size)
        assertNotNull(db.cacheMetadataDao().get("events:new"))
    }

    @Test
    fun prunedMetadataDoesNotLeaveOrphanRowsBehind() = runBlocking {
        // The mirror of the test above: whatever the retention rule is, the two
        // tables have to apply it together or one of them accumulates rows
        // nothing can address.
        cacheAged("events:orphan", ageMillis = 30 * hourMillis)

        cache.pruneExpired()

        assertEquals(0, db.eventDao().getAllByKey("events:orphan").size)
    }

    @Test
    fun expiryIsStillReportedFromTheTtlAndNotFromTheRetentionWindow() = runBlocking {
        cacheAged("events:ttl", ageMillis = 10 * 60_000L)

        // Six minutes old against a five-minute TTL: stale, but well inside
        // retention. isCacheFresh has to say so, and the row has to survive.
        assertFalse(cache.isCacheFresh("events:ttl"))
        cache.pruneExpired()
        assertNotNull(db.cacheMetadataDao().get("events:ttl"))
    }

    @Test
    fun cachingAKeyAgainReplacesItsRowsRatherThanAddingTo() = runBlocking {
        cache.cacheEvents("events:replace", listOf(event("a"), event("b")))
        cache.cacheEvents("events:replace", listOf(event("c")))

        assertEquals(1, cache.getCachedEvents("events:replace")?.size)
        assertEquals(1, db.eventDao().count())
    }

    @Test
    fun clearAllEmptiesBothTables() = runBlocking {
        cache.cacheEvents("events:x", listOf(event("e1")))

        cache.clearAll()

        assertEquals(0, db.eventDao().count())
        assertNull(db.cacheMetadataDao().get("events:x"))
    }
}
