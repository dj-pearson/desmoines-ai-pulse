package com.desmoines.aipulse.util

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AnalyticsServiceTest {

    private class FakeSink : AnalyticsSink {
        val events = mutableListOf<Pair<String, Map<String, String>>>()
        var collectionEnabled: Boolean? = null
        val collectionCalls = mutableListOf<Boolean>()
        override fun send(name: String, params: Map<String, String>) {
            events += name to params
        }
        override fun setCollectionEnabled(enabled: Boolean) {
            collectionEnabled = enabled
            collectionCalls += enabled
        }
    }

    private fun service(consent: Boolean, sink: FakeSink): AnalyticsService =
        service(MutableStateFlow(consent), sink)

    private fun service(consent: MutableStateFlow<Boolean>, sink: FakeSink): AnalyticsService {
        val consentService = mockk<ConsentService>()
        every { consentService.analyticsConsent } returns consent
        return AnalyticsService(sink, consentService)
    }

    @Test
    fun `drops non-essential events without consent`() {
        val sink = FakeSink()
        val svc = service(consent = false, sink = sink)
        svc.logScreen("home")
        assertTrue(sink.events.isEmpty())
    }

    // Reaching the sink is all `essential` buys: Firebase drops the event while
    // collection is disabled, which the next tests pin for the no-consent case.
    @Test
    fun `hands essential events to the sink without consent`() {
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

    @Test
    fun `never enables collection without consent`() {
        val sink = FakeSink()
        val svc = service(consent = false, sink = sink)
        svc.applyConsent()
        svc.logEvent("crash_breadcrumb", essential = true)
        assertFalse(true in sink.collectionCalls, "collection was enabled with consent=false")
        assertEquals(false, sink.collectionEnabled)
    }

    @Test
    fun `applyConsent follows a grant and a revocation`() {
        val sink = FakeSink()
        val consent = MutableStateFlow(false)
        val svc = service(consent, sink)
        consent.value = true
        svc.applyConsent()
        assertEquals(true, sink.collectionEnabled)
        consent.value = false
        svc.applyConsent()
        assertEquals(false, sink.collectionEnabled)
        assertEquals(listOf(false, true, false), sink.collectionCalls)
    }
}
