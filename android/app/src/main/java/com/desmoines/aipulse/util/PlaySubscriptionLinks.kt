package com.desmoines.aipulse.util

import java.net.URLEncoder

/**
 * Deep links into Google Play's own subscription management (AND-OVH-008).
 *
 * Play policy expects an app that sells subscriptions to give subscribers a
 * way to manage or cancel them, and the only place that can actually cancel a
 * Play subscription is Play itself. This builds the documented URL; callers
 * open it with [SafeLinkLauncher.openUrl], which hands it to the Play Store app
 * when installed and the browser otherwise.
 *
 * Pure string building (no `android.net.Uri`) so it is JVM unit-testable.
 */
object PlaySubscriptionLinks {

    const val SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions"

    /**
     * The management page for one subscription, or Play's subscription list
     * when [sku] is null or blank (a subscriber whose product id we don't know
     * still lands somewhere they can cancel).
     */
    fun manageUrl(sku: String?, packageName: String): String {
        val id = sku?.trim().orEmpty()
        if (id.isEmpty()) return SUBSCRIPTIONS_URL
        return "$SUBSCRIPTIONS_URL?sku=${encode(id)}&package=${encode(packageName.trim())}"
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
