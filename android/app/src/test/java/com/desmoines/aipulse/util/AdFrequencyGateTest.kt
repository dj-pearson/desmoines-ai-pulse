package com.desmoines.aipulse.util

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AdFrequencyGateTest {

    @Test
    fun `dedupes the same creative within a session`() {
        val gate = AdFrequencyGate()
        assertTrue(gate.registerImpression("c1", "cr1"))
        assertFalse(gate.registerImpression("c1", "cr1")) // duplicate
    }

    @Test
    fun `caps impressions per campaign per session`() {
        val gate = AdFrequencyGate(maxPerCampaignPerSession = 2)
        assertTrue(gate.canShow("c1"))
        gate.registerImpression("c1", "cr1")
        assertTrue(gate.canShow("c1"))
        gate.registerImpression("c1", "cr2")
        // Two distinct creatives counted → cap reached.
        assertFalse(gate.canShow("c1"))
    }

    @Test
    fun `cap is independent per campaign`() {
        val gate = AdFrequencyGate(maxPerCampaignPerSession = 1)
        gate.registerImpression("c1", "cr1")
        assertFalse(gate.canShow("c1"))
        assertTrue(gate.canShow("c2"))
    }

    @Test
    fun `reset clears counters and dedupe`() {
        val gate = AdFrequencyGate(maxPerCampaignPerSession = 1)
        gate.registerImpression("c1", "cr1")
        assertFalse(gate.canShow("c1"))
        gate.reset()
        assertTrue(gate.canShow("c1"))
        assertTrue(gate.registerImpression("c1", "cr1"))
    }
}
