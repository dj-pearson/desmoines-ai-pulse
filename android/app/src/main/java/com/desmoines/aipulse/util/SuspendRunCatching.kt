package com.desmoines.aipulse.util

import kotlinx.coroutines.CancellationException

/**
 * [runCatching] for code that suspends (AND-OVH-020).
 *
 * The stdlib version catches every Throwable, CancellationException included.
 * When the user leaves a screen mid-request, the ViewModel scope cancels and
 * the in-flight call throws CancellationException; runCatching turned that into
 * Result.failure, the repository logged it through AppLogger.network.error
 * (which uploads as a crash) and the caller could set an error state for a
 * screen nobody is looking at. This one rethrows cancellation so structured
 * concurrency stops the coroutine, and wraps everything else as before.
 *
 * Inline, so the block may call suspend functions from a suspending caller.
 * Plain runCatching stays fine for non-suspending work such as JSON parsing.
 */
inline fun <R> suspendRunCatching(block: () -> R): Result<R> =
    try {
        Result.success(block())
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (error: Throwable) {
        Result.failure(error)
    }
