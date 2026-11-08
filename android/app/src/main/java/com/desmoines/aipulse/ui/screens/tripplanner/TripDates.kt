package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.util.EventTimeText
import java.time.LocalDate
import java.time.ZonedDateTime

/**
 * The trip's first and last day, counted from today on the Des Moines clock
 * (AND-AUDIT-032). It used LocalDate.now(), the phone's day: a visitor whose
 * phone was still on UTC asked at 8pm Central for a trip "starting today" and
 * sent generate-itinerary tomorrow's date, so the plan skipped the evening
 * they were planning around.
 */
internal object TripDates {
    /**
     * [startOffsetDays] days from the Des Moines day at [now], running
     * [lengthDays] days inclusive. [now] is the phone's clock in whatever zone
     * it is set to; only the instant is used.
     */
    fun range(
        startOffsetDays: Int,
        lengthDays: Int,
        now: ZonedDateTime = ZonedDateTime.now(),
    ): Pair<LocalDate, LocalDate> {
        val start = EventTimeText.desMoinesToday(now).plusDays(startOffsetDays.toLong())
        return start to start.plusDays((lengthDays - 1).coerceAtLeast(0).toLong())
    }
}
