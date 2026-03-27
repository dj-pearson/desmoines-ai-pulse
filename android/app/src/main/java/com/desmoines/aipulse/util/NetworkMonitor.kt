package com.desmoines.aipulse.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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
 * Uses ConnectivityManager.NetworkCallback for immediate status updates.
 * Exposes isConnected and showReconnected (5-second banner after regaining connection).
 */
@Singleton
class NetworkMonitor @Inject constructor(
    @ApplicationContext private val context: Context
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

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            handleConnectivityChange(true)
        }

        override fun onLost(network: Network) {
            handleConnectivityChange(false)
        }

        override fun onCapabilitiesChanged(
            network: Network,
            networkCapabilities: NetworkCapabilities
        ) {
            val hasInternet = networkCapabilities.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET
            ) && networkCapabilities.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_VALIDATED
            )
            handleConnectivityChange(hasInternet)
        }
    }

    init {
        // Check initial state
        _isConnected.value = isCurrentlyConnected()

        // Register for real-time updates
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
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
