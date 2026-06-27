package com.desmoines.aipulse.ui.screens.weekend

import com.desmoines.aipulse.data.model.Event
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.LocalDate

class WeekendViewModelTest {

    @Test
    fun `weekendFriday returns the upcoming Friday on a weekday`() {
        // Wednesday 2026-07-01 → Friday 2026-07-03
        val friday = WeekendViewModel.weekendFriday(LocalDate.of(2026, 7, 1))
        assertEquals(LocalDate.of(2026, 7, 3), friday)
        assertEquals(DayOfWeek.FRIDAY, friday.dayOfWeek)
    }

    @Test
    fun `weekendFriday returns the current weekend's Friday on Saturday and Sunday`() {
        // Saturday 2026-07-04 → Friday 2026-07-03
        assertEquals(LocalDate.of(2026, 7, 3), WeekendViewModel.weekendFriday(LocalDate.of(2026, 7, 4)))
        // Sunday 2026-07-05 → Friday 2026-07-03
        assertEquals(LocalDate.of(2026, 7, 3), WeekendViewModel.weekendFriday(LocalDate.of(2026, 7, 5)))
        // Friday itself → same day
        assertEquals(LocalDate.of(2026, 7, 3), WeekendViewModel.weekendFriday(LocalDate.of(2026, 7, 3)))
    }

    @Test
    fun `groupEventsByDay buckets by day and drops empty days`() {
        val friday = LocalDate.of(2026, 7, 3)
        val events = listOf(
            Event(id = "fri1", title = "Fri 1", date = "2026-07-03"),
            Event(id = "sun1", title = "Sun 1", date = "2026-07-05"),
            Event(id = "fri2", title = "Fri 2", date = "2026-07-03"),
        )

        val days = WeekendViewModel.groupEventsByDay(events, friday)

        // Saturday has no events → dropped; Friday + Sunday remain, in order.
        assertEquals(listOf("Friday", "Sunday"), days.map { it.name })
        assertEquals(2, days.first().count)
        assertEquals(1, days[1].count)
        assertTrue(days.first().events.all { it.date == "2026-07-03" })
    }

    @Test
    fun `groupEventsByDay returns empty for no events`() {
        val days = WeekendViewModel.groupEventsByDay(emptyList(), LocalDate.of(2026, 7, 3))
        assertTrue(days.isEmpty())
    }
}
