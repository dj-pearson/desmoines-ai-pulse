import Foundation

// MARK: - IOS-ADS-012 · Central ad-density configuration
//
// One place to tune how much advertising the app shows. These are compile-time
// constants today; the shape is deliberately flat so a future Supabase-driven
// remote config (an IOS-ADS-014 follow-up) can populate the same fields without
// touching a single call site. Changing ad density should never require editing
// view code.
enum AdConfig {
    // MARK: In-feed native ad cards (long lists: Events, Dining)

    /// Show the first in-feed ad only after this many organic items.
    static let inFeedFirstSlot = 6
    /// …then another after every this-many organic items.
    static let inFeedInterval = 8

    // MARK: Home between-rail slots

    /// Indices (into the rendered rail order) after which an ad slot is inserted.
    /// Kept in sync with `HomeRailsView`.
    static let homeRailAdIndices: Set<Int> = [1, 3]

    // MARK: Sponsored listings (IOS-ADS-011)

    /// Sponsored listings are content (shown to all tiers). Cap how many are
    /// pulled to the front of a feed so they never dominate the first screen.
    static let maxSponsoredAtFront = 2

    // MARK: Sponsored picks in AI discovery flows (IOS-ADS-015)

    /// At most this many labeled sponsored picks per AI flow render (Ask Pulse,
    /// Trip Planner). The AC requires "at most one".
    static let aiFlowMaxSponsored = 1
    /// Surprise Me returns a sponsored result only on every Nth roll, so it's
    /// "occasional, capped, never every roll".
    static let surpriseMeSponsoredEveryNthRoll = 4

    // MARK: Interstitial (IOS-ADS-012) — rare, capped, free-tier only

    /// At most this many interstitials per app session.
    static let interstitialMaxPerSession = 1
    /// Never during the first N app sessions (so never on first launch / onboarding).
    static let interstitialMinSessionsBeforeFirst = 3
    /// Show only on every Nth qualifying navigation boundary.
    static let interstitialBoundaryInterval = 6
    /// Minimum spacing between interstitials regardless of nav activity.
    static let interstitialMinInterval: TimeInterval = 8 * 60
}
