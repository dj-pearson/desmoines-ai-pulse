package com.desmoines.aipulse.ui.screens.eventdetail

import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.EventsRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.util.LocalNotificationService
import com.desmoines.aipulse.util.LocationService
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * AND-OVH-007: the Remind Me button hardcoded "not set" and its tap only fired a
 * haptic. These pin the ViewModel to LocalNotificationService.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EventDetailReminderTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var eventsRepository: EventsRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var notifications: LocalNotificationService

    private val now: Long = Instant.parse("2026-10-23T12:00:00Z").toEpochMilli()
    private val hour = 3_600_000L

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        eventsRepository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        notifications = mockk(relaxed = true)
        every { authRepository.currentUserId } returns null
        coEvery { eventsRepository.fetchRelatedEvents(any(), any(), any()) } returns Result.success(emptyList())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun event(id: String, startMillis: Long) = Event(
        id = id,
        title = "Event $id",
        date = Instant.ofEpochMilli(startMillis).atOffset(ZoneOffset.UTC)
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
        venue = "Wells Fargo Arena",
        category = "Music",
    )

    private fun loadedViewModel(event: Event): EventDetailViewModel {
        coEvery { eventsRepository.fetchEvent(event.id) } returns Result.success(event)
        val viewModel = EventDetailViewModel(
            eventsRepository,
            mockk<LocationService>(relaxed = true),
            mockk<FavoritesRepository>(relaxed = true),
            authRepository,
            mockk<BillingService>(relaxed = true),
            notifications,
        )
        viewModel.nowMillis = { now }
        viewModel.loadEvent(event.id)
        return viewModel
    }

    @Test
    fun `initial state is read from the service`() = runTest(testDispatcher) {
        every { notifications.isReminderSet("a") } returns true

        val viewModel = loadedViewModel(event("a", now + 5 * hour))
        advanceUntilIdle()

        assertTrue(viewModel.isReminderSet.value)
        verify { notifications.isReminderSet("a") }
    }

    @Test
    fun `toggle schedules then cancels`() = runTest(testDispatcher) {
        val start = now + 5 * hour
        // The service's own toggle flips on what it has stored; mirror that.
        var stored = false
        every { notifications.isReminderSet("b") } answers { stored }
        every { notifications.toggleReminder("b", any(), any(), start) } answers {
            stored = !stored
            stored
        }

        val viewModel = loadedViewModel(event("b", start))
        advanceUntilIdle()
        assertFalse(viewModel.isReminderSet.value)

        viewModel.toggleReminder()
        assertTrue(viewModel.isReminderSet.value)

        viewModel.toggleReminder()
        assertFalse(viewModel.isReminderSet.value)

        verify(exactly = 2) {
            notifications.toggleReminder("b", "Event b", "Wells Fargo Arena", start)
        }
        assertNull(viewModel.reminderMessage.value)
    }

    @Test
    fun `past events report the button hidden`() = runTest(testDispatcher) {
        val viewModel = loadedViewModel(event("c", now - hour))
        advanceUntilIdle()

        assertFalse(viewModel.showReminderButton.value)
    }

    @Test
    fun `future events report the button shown`() = runTest(testDispatcher) {
        val viewModel = loadedViewModel(event("d", now + 2 * hour))
        advanceUntilIdle()

        assertTrue(viewModel.showReminderButton.value)
    }

    @Test
    fun `a set reminder keeps the button visible after the start so it can be cancelled`() {
        val past = event("e", now - hour)
        assertTrue(EventDetailViewModel.isReminderButtonVisible(past, isReminderSet = true, nowMillis = now))
        assertFalse(EventDetailViewModel.isReminderButtonVisible(past, isReminderSet = false, nowMillis = now))
    }

    @Test
    fun `denied notification permission schedules nothing and explains why`() = runTest(testDispatcher) {
        val viewModel = loadedViewModel(event("f", now + 5 * hour))
        advanceUntilIdle()

        viewModel.onNotificationPermissionDenied()

        verify(exactly = 0) { notifications.toggleReminder(any(), any(), any(), any()) }
        verify(exactly = 0) { notifications.scheduleReminder(any(), any(), any(), any()) }
        assertFalse(viewModel.isReminderSet.value)
        assertNotNull(viewModel.reminderMessage.value)

        viewModel.clearReminderMessage()
        assertNull(viewModel.reminderMessage.value)
    }

    @Test
    fun `a reminder the service refuses is reported instead of shown as set`() = runTest(testDispatcher) {
        val start = now + 30 * 60_000L // under the one-hour offset
        every { notifications.toggleReminder("g", any(), any(), start) } returns false

        val viewModel = loadedViewModel(event("g", start))
        advanceUntilIdle()
        viewModel.toggleReminder()

        assertFalse(viewModel.isReminderSet.value)
        assertEquals(
            "This event starts in under an hour, too soon for a reminder.",
            viewModel.reminderMessage.value,
        )
    }
}
