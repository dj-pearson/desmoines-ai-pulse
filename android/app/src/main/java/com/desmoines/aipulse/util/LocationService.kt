package com.desmoines.aipulse.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Location service matching iOS LocationService.swift.
 * Uses FusedLocationProviderClient for best accuracy with minimal battery.
 * Same 5-minute cache, same distance formatting, same fallback to Des Moines center.
 */
@Singleton
class LocationService @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val _userLocation = MutableStateFlow<Location?>(null)
    val userLocation: StateFlow<Location?> = _userLocation.asStateFlow()

    private val _isLocating = MutableStateFlow(false)
    val isLocating: StateFlow<Boolean> = _isLocating.asStateFlow()

    private val _locationError = MutableStateFlow<String?>(null)
    val locationError: StateFlow<String?> = _locationError.asStateFlow()

    /** Cached location timestamp — skip re-fetch if < 5 minutes old */
    private var cachedLocationTime: Long = 0L

    // MARK: - Permission Check

    fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun isGooglePlayServicesAvailable(): Boolean {
        val availability = GoogleApiAvailability.getInstance()
        val result = availability.isGooglePlayServicesAvailable(context)
        return result == ConnectionResult.SUCCESS
    }

    // MARK: - Get Current Location

    /**
     * Get the current location, returning cached location if < 5 minutes old.
     * Falls back to Des Moines center coordinates if permission denied or unavailable.
     * Matches iOS getCurrentLocation() behavior.
     */
    suspend fun getCurrentLocation(): Location {
        _isLocating.value = true
        _locationError.value = null

        try {
            // Return cached location if < 5 minutes old (matching iOS 300-second cache)
            val cached = _userLocation.value
            if (cached != null && (System.currentTimeMillis() - cachedLocationTime) < CACHE_TTL_MS) {
                return cached
            }

            if (!hasLocationPermission()) {
                throw LocationException.PermissionDenied
            }

            if (!isGooglePlayServicesAvailable()) {
                throw LocationException.Unavailable
            }

            val location = requestFreshLocation()
            _userLocation.value = location
            cachedLocationTime = System.currentTimeMillis()
            return location
        } catch (e: LocationException) {
            _locationError.value = e.message
            throw e
        } catch (e: Exception) {
            val error = LocationException.Unavailable
            _locationError.value = error.message
            throw error
        } finally {
            _isLocating.value = false
        }
    }

    /**
     * Get location or fall back to Des Moines center if unavailable.
     * Convenience method for cases where a location is always needed.
     */
    suspend fun getCurrentLocationOrDefault(): Location {
        return try {
            getCurrentLocation()
        } catch (_: Exception) {
            defaultLocation()
        }
    }

    @Suppress("MissingPermission")
    private suspend fun requestFreshLocation(): Location {
        return suspendCancellableCoroutine { continuation ->
            val locationRequest = LocationRequest.Builder(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                1000L // interval — only need one update
            ).apply {
                setMaxUpdates(1)
                setMaxUpdateDelayMillis(10_000L)
            }.build()

            val callback = object : LocationCallback() {
                override fun onLocationResult(result: LocationResult) {
                    fusedLocationClient.removeLocationUpdates(this)
                    val location = result.lastLocation
                    if (location != null) {
                        if (continuation.isActive) {
                            continuation.resume(location)
                        }
                    } else {
                        if (continuation.isActive) {
                            continuation.resumeWithException(LocationException.Unavailable)
                        }
                    }
                }
            }

            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                callback,
                Looper.getMainLooper()
            )

            continuation.invokeOnCancellation {
                fusedLocationClient.removeLocationUpdates(callback)
            }
        }
    }

    // MARK: - Distance Calculation (Haversine)

    /**
     * Calculate distance from user's current location to a coordinate, in miles.
     * Returns null if user location is not available.
     * Matches iOS LocationService.distance(from:) exactly.
     */
    fun distance(latitude: Double, longitude: Double): Double? {
        val userLoc = _userLocation.value ?: return null
        return haversineDistanceMiles(
            userLoc.latitude, userLoc.longitude,
            latitude, longitude
        )
    }

    /**
     * Haversine formula for distance between two coordinates in miles.
     * Static version for use without user location.
     */
    fun haversineDistanceMiles(
        lat1: Double, lng1: Double,
        lat2: Double, lng2: Double
    ): Double {
        val earthRadiusMiles = 3958.8
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLng / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return earthRadiusMiles * c
    }

    /**
     * Formatted distance string matching iOS LocationService.formattedDistance(from:).
     * - "Nearby" for < 0.1 miles
     * - "X ft away" for < 1 mile
     * - "X.X mi" for >= 1 mile
     */
    fun formattedDistance(latitude: Double, longitude: Double): String? {
        val miles = distance(latitude, longitude) ?: return null
        return formatMiles(miles)
    }

    companion object {
        /** 5-minute cache TTL matching iOS (300 seconds) */
        private const val CACHE_TTL_MS = 5 * 60 * 1000L

        /** Des Moines center — fallback when location unavailable */
        fun defaultLocation(): Location {
            return Location("default").apply {
                latitude = Config.DEFAULT_LATITUDE
                longitude = Config.DEFAULT_LONGITUDE
            }
        }

        /**
         * Format a distance in miles to a user-friendly string.
         * Matches iOS LocationService.formattedDistance format exactly.
         */
        fun formatMiles(miles: Double): String {
            return when {
                miles < 0.1 -> "Nearby"
                miles < 1.0 -> "${(miles * 5280).roundToInt()} ft away"
                else -> String.format("%.1f mi", miles)
            }
        }
    }

    // MARK: - Error Types

    /**
     * Location errors matching iOS LocationService.LocationError.
     */
    sealed class LocationException(message: String) : Exception(message) {
        data object PermissionDenied : LocationException(
            "Location permission is required to find events near you."
        )
        data object Unavailable : LocationException(
            "Unable to determine your location."
        )
    }
}
