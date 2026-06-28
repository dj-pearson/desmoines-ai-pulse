package com.desmoines.aipulse.data.repository

import android.content.Context
import com.desmoines.aipulse.data.remote.FavoritesRemoteDataSource
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FavoritesRepositoryImplTest {

    private val remote = mockk<FavoritesRemoteDataSource>(relaxed = true)
    private val context = mockk<Context>(relaxed = true)
    private val repository = FavoritesRepositoryImpl(remote, context)

    private val userId = "u1"
    private val eventId = "e1"

    @Test
    fun `ten concurrent favorite taps produce exactly one remote write`() = runTest {
        // A suspension point inside the remote write forces the coroutines to
        // interleave, so only the per-item Mutex + authoritative-state guard can
        // keep this from double-writing.
        coEvery { remote.addEventFavorite(userId, eventId) } coAnswers { delay(10) }

        repeat(10) {
            launch { repository.toggleEventFavorite(userId, eventId, currentIds = emptySet()) }
        }
        advanceUntilIdle()

        coVerify(exactly = 1) { remote.addEventFavorite(userId, eventId) }
        assertTrue(repository.isEventFavorited(eventId))
    }

    @Test
    fun `redundant remove taps collapse to one remote delete`() = runTest {
        // Favorite first, then fire ten concurrent un-favorite taps.
        repository.toggleEventFavorite(userId, eventId, currentIds = emptySet())
        coEvery { remote.removeEventFavorite(userId, eventId) } coAnswers { delay(10) }

        repeat(10) {
            launch { repository.toggleEventFavorite(userId, eventId, currentIds = setOf(eventId)) }
        }
        advanceUntilIdle()

        coVerify(exactly = 1) { remote.removeEventFavorite(userId, eventId) }
        assertFalse(repository.isEventFavorited(eventId))
    }

    @Test
    fun `a single toggle adds then a single toggle removes`() = runTest {
        val added = repository.toggleEventFavorite(userId, eventId, currentIds = emptySet()).getOrThrow()
        assertTrue(added)
        assertTrue(repository.isEventFavorited(eventId))

        val removed = repository.toggleEventFavorite(userId, eventId, currentIds = setOf(eventId)).getOrThrow()
        assertFalse(removed)
        assertFalse(repository.isEventFavorited(eventId))
    }

    @Test
    fun `remote add failure rolls back the optimistic local state`() = runTest {
        coEvery { remote.addEventFavorite(userId, eventId) } throws RuntimeException("network down")

        val result = repository.toggleEventFavorite(userId, eventId, currentIds = emptySet())

        assertTrue(result.isFailure)
        assertFalse(repository.isEventFavorited(eventId))
    }

    @Test
    fun `remote remove failure rolls back to favorited`() = runTest {
        repository.toggleEventFavorite(userId, eventId, currentIds = emptySet())
        coEvery { remote.removeEventFavorite(userId, eventId) } throws RuntimeException("network down")

        val result = repository.toggleEventFavorite(userId, eventId, currentIds = setOf(eventId))

        assertTrue(result.isFailure)
        assertTrue(repository.isEventFavorited(eventId))
    }
}
