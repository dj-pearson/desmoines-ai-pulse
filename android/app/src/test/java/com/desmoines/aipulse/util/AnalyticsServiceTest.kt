package com.desmoines.aipulse.util

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AnalyticsServiceTest {

    private class FakeSink : AnalyticsSink {
        val events = mutableListOf<Pair<String, Map<String, String>>>()
        var collectionEnabled: Boolean? = null
        override fun send(name: String, params: Map<String, String>) {
            events += name to params
        }
        override fun setCollectionEnabled(enabled: Boolean) {
            collectionEnabled = enabled
        }
    }

    private fun service(consent: Boolean, sink: FakeSink): AnalyticsService {
        val consentService = mockk<ConsentService>()
        every { consentService.analyticsConsent } returns MutableStateFlow(consent)
        return AnalyticsService(sink, consentService)
    }

    @Test
    fun `drops non-essential events without consent`() {
        val sink = FakeSink()
        val svc = service(consent = false, sink = sink)
        svc.logScreen("home")
        assertTrue(sink.events.isEmpty())
    }

    @Test
    fun `sends essential events even without consent`() {
        val sink = FakeSink()
        val svc = service(consent = false, sink = sink)
        svc.logEvent("crash_breadcrumb", essential = true)
        assertEquals(1, sink.events.size)
    }

    @Test
    fun `sends events with consent and structured params`() {
        val sink = FakeSink()
        val svc = service(consent = true, sink = sink)
        svc.logSearch(queryLength = 5, resultCount = 12)
        assertEquals(1, sink.events.size)
        val (name, params) = sink.events.first()
        assertEquals(AnalyticsService.EVENT_SEARCH, name)
        assertEquals("5", params[AnalyticsService.PARAM_QUERY_LENGTH])
        assertEquals("12", params[AnalyticsService.PARAM_RESULT_COUNT])
    }

    @Test
    fun `applies collection consent at construction`() {
        val sink = FakeSink()
        service(consent = true, sink = sink)
        assertEquals(true, sink.collectionEnabled)
    }
}
