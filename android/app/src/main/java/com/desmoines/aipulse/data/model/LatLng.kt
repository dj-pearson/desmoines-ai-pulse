package com.desmoines.aipulse.data.model

/**
 * Simple latitude/longitude pair.
 * Will be replaced by or mapped to com.google.android.gms.maps.model.LatLng
 * when Google Maps SDK is added in a later story.
 */
data class LatLng(
    val latitude: Double,
    val longitude: Double,
)
