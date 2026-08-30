package com.desmoines.aipulse.ui.screens.hoteldetail

import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.repository.HotelsRepository
import com.desmoines.aipulse.util.LocationService
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HotelDetailViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: HotelsRepository
    private lateinit var locationService: LocationService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        locationService = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun hotel(id: String = "h1") = Hotel(
        id = id, name = "Hotel $id", address = "1 Main St",
        affiliateUrl = "https://book.example.com/$id",
    )

    private fun vm() = HotelDetailViewModel(repository, locationService)

    @Test
    fun `load sets the hotel on success`() = runTest(testDispatcher) {
        coEvery { repository.fetchById("h1") } returns Result.success(hotel("h1"))
        val viewModel = vm()

        viewModel.load("h1")
        advanceUntilIdle()

        assertEquals("h1", viewModel.hotel.value?.id)
        assertNull(viewModel.errorMessage.value)
    }

    @Test
    fun `missing hotel reports not found`() = runTest(testDispatcher) {
        coEvery { repository.fetchById("missing") } returns Result.success(null)
        val viewModel = vm()

        viewModel.load("missing")
        advanceUntilIdle()

        assertNull(viewModel.hotel.value)
        assertEquals("Hotel not found.", viewModel.errorMessage.value)
    }

    @Test
    fun `failure reports a retry message`() = runTest(testDispatcher) {
        coEvery { repository.fetchById(any()) } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()

        viewModel.load("h1")
        advanceUntilIdle()

        assertEquals("Couldn't load this hotel. Tap to retry.", viewModel.errorMessage.value)
    }

    @Test
    fun `retry reloads the last id`() = runTest(testDispatcher) {
        coEvery { repository.fetchById("h1") } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()
        viewModel.load("h1")
        advanceUntilIdle()
        assertNull(viewModel.hotel.value)

        coEvery { repository.fetchById("h1") } returns Result.success(hotel("h1"))
        viewModel.retry()
        advanceUntilIdle()

        assertEquals("h1", viewModel.hotel.value?.id)
        assertNull(viewModel.errorMessage.value)
    }

    @Test
    fun `booking url prefers affiliate then website`() {
        assertEquals("https://book.example.com/h1", hotel("h1").bookingUrl)
        val siteOnly = Hotel(id = "h2", name = "H2", address = "x", website = "https://h2.com")
        assertEquals("https://h2.com", siteOnly.bookingUrl)
        assertNull(Hotel(id = "h3", name = "H3", address = "x").bookingUrl)
    }
}
