package com.desmoines.aipulse.util

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NetworkReconnectTest {

    @Test
    fun `offline then online emits once`() = runTest {
        val emissions = flowOf(false, true).onReconnect().toList()
        assertEquals(1, emissions.size)
    }

    @Test
    fun `initial online does not emit`() = runTest {
        // Collecting a flow that starts connected must not fire — we ignore the initial state.
        val emissions = flowOf(true).onReconnect().toList()
        assertEquals(0, emissions.size)
    }

    @Test
    fun `online without a prior offline does not emit`() = runTest {
        val emissions = flowOf(true, true, true).onReconnect().toList()
        assertEquals(0, emissions.size)
    }

    @Test
    fun `each offline to online transition emits`() = runTest {
        val emissions = flowOf(true, false, true, false, true).onReconnect().toList()
        assertEquals(2, emissions.size)
    }

    @Test
    fun `staying online after reconnect does not re-emit`() = runTest {
        val emissions = flowOf(false, true, true, true).onReconnect().toList()
        assertEquals(1, emissions.size)
    }

    @Test
    fun `staying offline never emits`() = runTest {
        val emissions = flowOf(false, false, false).onReconnect().toList()
        assertEquals(0, emissions.size)
    }

    // region Default network decision (AND-OVH-019)

    private fun replay(
        vararg events: DefaultNetworkEvent<String>,
        from: DefaultNetworkState<String> = DefaultNetworkState(),
    ): List<Boolean> {
        var state = from
        return events.map { event ->
            state = reduceDefaultNetwork(state, event)
            state.connected
        }
    }

    private fun validated(network: String) =
        DefaultNetworkEvent.CapabilitiesChanged(network, hasInternet = true, isValidated = true)

    @Test
    fun `a validated default network is connected`() {
        val connected = replay(DefaultNetworkEvent.Available("wifi"), validated("wifi"))
        assertTrue(connected.last())
    }

    @Test
    fun `available but unvalidated is not connected`() {
        val connected = replay(
            DefaultNetworkEvent.Available("wifi"),
            DefaultNetworkEvent.CapabilitiesChanged("wifi", hasInternet = true, isValidated = false),
        )
        assertEquals(listOf(false, false), connected)
    }

    @Test
    fun `internet without validation is not connected even after being online`() {
        val online = DefaultNetworkState("wifi", connected = true)
        val connected = replay(
            DefaultNetworkEvent.CapabilitiesChanged("wifi", hasInternet = true, isValidated = false),
            from = online,
        )
        assertFalse(connected.last())
    }

    @Test
    fun `losing the default network goes offline`() {
        val online = DefaultNetworkState("wifi", connected = true)
        val connected = replay(DefaultNetworkEvent.Lost("wifi"), from = online)
        assertFalse(connected.last())
    }

    @Test
    fun `wifi to LTE handoff stays connected when the old default is lost late`() {
        // The new default arrives and validates, then the platform reports the
        // old one gone. That lost callback is for a network we already left.
        val online = DefaultNetworkState("wifi", connected = true)
        val connected = replay(
            DefaultNetworkEvent.Available("lte"),
            validated("lte"),
            DefaultNetworkEvent.Lost("wifi"),
            from = online,
        )
        assertEquals(listOf(true, true, true), connected)
    }

    @Test
    fun `default lost while another network stays up is connected once the new default arrives`() {
        val online = DefaultNetworkState("wifi", connected = true)
        val connected = replay(
            DefaultNetworkEvent.Lost("wifi"),
            DefaultNetworkEvent.Available("lte"),
            validated("lte"),
            from = online,
        )
        assertEquals(listOf(false, false, true), connected)
    }

    @Test
    fun `a new default does not report online before it validates`() {
        val offline = DefaultNetworkState<String>(network = null, connected = false)
        val connected = replay(DefaultNetworkEvent.Available("lte"), from = offline)
        assertFalse(connected.last())
    }

    // endregion
}
