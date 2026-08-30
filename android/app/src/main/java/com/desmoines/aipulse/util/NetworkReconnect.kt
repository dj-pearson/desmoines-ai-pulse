package com.desmoines.aipulse.util

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/** Debounce before auto-refetching after a reconnect, so brief flaps don't refresh. */
const val RECONNECT_DEBOUNCE_MS = 500L

/**
 * Emits Unit on each offline→online transition of a connectivity flow, ignoring
 * the initial state (so it never fires just from collecting). Drives auto-refetch
 * on reconnect (ANDP-069). Pure and unit-testable.
 */
fun Flow<Boolean>.onReconnect(): Flow<Unit> = flow {
    var previous: Boolean? = null
    collect { connected ->
        if (connected && previous == false) emit(Unit)
        previous = connected
    }
}
