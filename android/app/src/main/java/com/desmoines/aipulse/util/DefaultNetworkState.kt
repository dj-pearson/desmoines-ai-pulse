package com.desmoines.aipulse.util

/**
 * What the system default network has told us, reduced to one decision: are we
 * online. Generic over the network handle so the rules are unit-testable without
 * android.net.Network, which is a stub on the JVM.
 *
 * WHY THE DEFAULT NETWORK AND NOT EVERY INTERNET NETWORK. NetworkMonitor used to
 * listen with registerNetworkCallback, which reports every network that matches
 * the request. A wifi to LTE handoff then delivered onLost(wifi) while LTE was
 * already up and carrying traffic, and that one lost network flipped the app
 * offline. Following only the default network means a lost callback for a
 * network that is no longer the default is ignored.
 *
 * WHY VALIDATED. onAvailable fires before the platform has checked the network
 * reaches the internet (a captive portal, a dead hotspot). Only
 * onCapabilitiesChanged with INTERNET and VALIDATED says the network works.
 */
data class DefaultNetworkState<N>(
    val network: N? = null,
    val connected: Boolean = false,
)

sealed interface DefaultNetworkEvent<out N> {
    data class Available<N>(val network: N) : DefaultNetworkEvent<N>
    data class CapabilitiesChanged<N>(
        val network: N,
        val hasInternet: Boolean,
        val isValidated: Boolean,
    ) : DefaultNetworkEvent<N>
    data class Lost<N>(val network: N) : DefaultNetworkEvent<N>
}

fun <N> reduceDefaultNetwork(
    state: DefaultNetworkState<N>,
    event: DefaultNetworkEvent<N>,
): DefaultNetworkState<N> = when (event) {
    // A new default is not proof of connectivity, and not proof of its absence
    // either: the old default may still be carrying traffic until the platform
    // reports the new one's capabilities, which it does immediately after. So
    // adopt the network and keep the current answer.
    is DefaultNetworkEvent.Available -> state.copy(network = event.network)
    is DefaultNetworkEvent.CapabilitiesChanged -> DefaultNetworkState(
        network = event.network,
        connected = event.hasInternet && event.isValidated,
    )
    // Only losing the CURRENT default means offline. A late onLost for the
    // network we already moved off is noise.
    is DefaultNetworkEvent.Lost ->
        if (event.network == state.network) DefaultNetworkState(network = null, connected = false)
        else state
}
