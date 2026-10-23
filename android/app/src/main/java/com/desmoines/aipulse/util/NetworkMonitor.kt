package com.desmoines.aipulse.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Real-time network connectivity monitor matching iOS NetworkMonitor.swift.
 * Follows the system DEFAULT network (registerDefaultNetworkCallback) and counts it
 * as connected only once it reports INTERNET and VALIDATED; see [reduceDefaultNetwork].
 * Exposes isConnected and showReconnected (5-second banner after regaining connection).
 */
@Singleton
class NetworkMonitor @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _isConnected = MutableStateFlow(true)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _showReconnected = MutableStateFlow(false)
    val showReconnected: StateFlow<Boolean> = _showReconnected.asStateFlow()

    private var wasOffline = false
    private var reconnectedJob: kotlinx.coroutines.Job? = null

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    // Callbacks for one registration arrive serially on the ConnectivityManager
    // thread; the lock covers the initial read in init, which runs elsewhere.
    private val stateLock = Any()
    private var defaultNetworkState = DefaultNetworkState<Network>()

    private fun onDefaultNetworkEvent(event: DefaultNetworkEvent<Network>) {
        val connected = synchronized(stateLock) {
            defaultNetworkState = reduceDefaultNetwork(defaultNetworkState, event)
            defaultNetworkState.connected
        }
        handleConnectivityChange(connected)
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            onDefaultNetworkEvent(DefaultNetworkEvent.Available(network))
        }

        override fun onLost(network: Network) {
            onDefaultNetworkEvent(DefaultNetworkEvent.Lost(network))
        }

        override fun onCapabilitiesChanged(
            network: Network,
            networkCapabilities: NetworkCapabilities
        ) {
            onDefaultNetworkEvent(
                DefaultNetworkEvent.CapabilitiesChanged(
                    network = network,
                    hasInternet = networkCapabilities.hasCapability(
                        NetworkCapabilities.NET_CAPABILITY_INTERNET
                    ),
                    isValidated = networkCapabilities.hasCapability(
                        NetworkCapabilities.NET_CAPABILITY_VALIDATED
                    ),
                )
            )
        }
    }

    init {
        // Check initial state
        val initial = DefaultNetworkState(
            network = connectivityManager.activeNetwork,
            connected = isCurrentlyConnected(),
        )
        synchronized(stateLock) { defaultNetworkState = initial }
        _isConnected.value = initial.connected

        // Follow the default network only. registerNetworkCallback reported every
        // internet network, so losing wifi during a handoff to LTE read as offline.
        connectivityManager.registerDefaultNetworkCallback(networkCallback)
    }

    private fun isCurrentlyConnected(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun handleConnectivityChange(connected: Boolean) {
        scope.launch {
            if (connected && wasOffline) {
                // Reconnected after being offline — show banner for 5 seconds
                _isConnected.value = true
                wasOffline = false
                reconnectedJob?.cancel()
                _showReconnected.value = true
                reconnectedJob = scope.launch {
                    delay(5_000L)
                    _showReconnected.value = false
                }
            } else if (!connected) {
                _isConnected.value = false
                wasOffline = true
                reconnectedJob?.cancel()
                _showReconnected.value = false
            } else {
                _isConnected.value = connected
            }
        }
    }
}
