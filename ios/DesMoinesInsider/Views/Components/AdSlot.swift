import SwiftUI

/// Thin wrapper around `AdBannerView` that standardises placement-based
/// padding and accessibility across the three feed screens. Using this
/// instead of dropping `AdBannerView()` directly keeps ad rendering in
/// one place if we later want to swap layouts, add placement telemetry,
/// or gate by feature flag.
///
/// Free-tier check is still owned by AdBannerView — AdSlot renders nothing
/// when the user is subscribed.
struct AdSlot: View {
    enum Placement {
        /// Horizontal rail embedded in a vertical feed (Home, Restaurants,
        /// Attractions). Matches the padding previously inlined at each
        /// call site so visual spacing is unchanged.
        case feed
        /// Tight layout for detail pages where outer padding is already
        /// provided by the surrounding ScrollView.
        case detail
    }

    let placement: Placement

    init(_ placement: Placement = .feed) {
        self.placement = placement
    }

    var body: some View {
        switch placement {
        case .feed:
            AdBannerView(affiliatePlacement: .banner)
                .padding(.horizontal)
                .padding(.vertical, 4)
        case .detail:
            AdBannerView(affiliatePlacement: .banner)
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        AdSlot(.feed)
        AdSlot(.detail)
    }
}
