package com.desmoines.aipulse.data.model

import androidx.compose.runtime.Immutable

/**
 * Simple latitude/longitude pair.
 * Will be replaced by or mapped to com.google.android.gms.maps.model.LatLng
 * when Google Maps SDK is added in a later story.
 */
@Immutable
data class LatLng(
    val latitude: Double,
    val longitude: Double,
)
