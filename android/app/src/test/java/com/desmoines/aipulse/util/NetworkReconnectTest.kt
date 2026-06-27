package com.desmoines.aipulse.util

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
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
}
