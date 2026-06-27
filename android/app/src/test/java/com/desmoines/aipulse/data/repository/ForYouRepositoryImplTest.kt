package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Recommendation
import com.desmoines.aipulse.data.remote.ForYouRemoteDataSource
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ForYouRepositoryImplTest {

    private val remote = mockk<ForYouRemoteDataSource>()
    private val repository = ForYouRepositoryImpl(remote)

    private val sample = listOf(Recommendation(id = "e1", title = "Event"))

    @Test
    fun `signed-out user gets the trending feed without a swipe count`() = runTest {
        coEvery { remote.fetchTrending(any()) } returns sample

        val result = repository.fetchForYou(userId = null).getOrThrow()

        assertEquals(ForYouSource.TRENDING, result.source)
        assertEquals(sample, result.items)
        coVerify(exactly = 0) { remote.countRecentSwipes(any(), any()) }
    }

    @Test
    fun `engaged user at or above the swipe threshold gets personalized feed`() = runTest {
        coEvery { remote.countRecentSwipes(any(), any()) } returns ForYouRepository.SWIPE_THRESHOLD
        coEvery { remote.fetchPersonalized(any(), any(), any()) } returns sample

        val result = repository.fetchForYou(userId = "u1").getOrThrow()

        assertEquals(ForYouSource.FOR_YOU, result.source)
        coVerify(exactly = 1) { remote.fetchPersonalized(any(), any(), ForYouRepository.LIMIT) }
    }

    @Test
    fun `user below the swipe threshold falls back to trending`() = runTest {
        coEvery { remote.countRecentSwipes(any(), any()) } returns ForYouRepository.SWIPE_THRESHOLD - 1
        coEvery { remote.fetchTrending(any()) } returns sample

        val result = repository.fetchForYou(userId = "u1").getOrThrow()

        assertEquals(ForYouSource.TRENDING, result.source)
        coVerify(exactly = 1) { remote.fetchTrending(ForYouRepository.LIMIT) }
    }

    @Test
    fun `remote failure surfaces as a failed Result`() = runTest {
        coEvery { remote.fetchTrending(any()) } throws IllegalStateException("network")

        val result = repository.fetchForYou(userId = null)

        assertEquals(true, result.isFailure)
    }
}
