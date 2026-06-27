package com.desmoines.aipulse.data.model

/**
 * Context that triggered a soft paywall, with the copy to show. Mirrors the
 * iOS PaywallView contexts. [id] is used for analytics conversion tracking.
 */
enum class PaywallContext(
    val id: String,
    val headline: String,
    val body: String,
) {
    FAVORITES(
        id = "favorites",
        headline = "Save everything you love",
        body = "Free saves are capped at 3. Go Insider for unlimited favorites across events, dining, and places.",
    ),
    TRIP_PLANNER(
        id = "trip_planner",
        headline = "Plan smarter with AI",
        body = "Unlock the AI Trip Planner and build a full Des Moines itinerary in seconds.",
    ),
    INSIDER_TIPS(
        id = "insider_tips",
        headline = "Get the insider edge",
        body = "Insider tips, advanced filters, and premium recommendations — unlock with Insider.",
    ),
    DINING_TIPS(
        id = "dining_tips",
        headline = "Dine like a local",
        body = "Unlock dining tips and premium picks for every restaurant with Insider.",
    ),
    GENERIC(
        id = "generic",
        headline = "Unlock more with Insider",
        body = "Upgrade for unlimited favorites, AI trip planning, and premium local tips.",
    ),
}
