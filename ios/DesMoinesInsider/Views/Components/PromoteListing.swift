import SwiftUI
import SafariServices

// MARK: - IOS-ADS-016 · In-app "Promote this listing" advertiser funnel
//
// App Review rationale (App Store Review Guidelines 3.1.1 / 3.1.3):
//   Promoting an event/restaurant is ADVERTISING FOR A REAL-WORLD BUSINESS — a
//   service consumed outside the app by the advertiser, NOT an in-app digital
//   good unlocked for the purchasing user. Per the guidelines, such purchases do
//   NOT use In-App Purchase. We therefore route checkout to the existing web
//   campaign flow (create-campaign-checkout → Stripe) opened in
//   SFSafariViewController. No StoreKit purchase UI for advertising is ever
//   rendered natively; the app only links out to the advertiser portal, which
//   pre-fills the listing via the web ListingPicker / campaign create path.

/// Builds links into the web advertiser portal, pre-filling the chosen listing.
enum BusinessPromotion {
    enum Listing {
        case event(id: String, name: String)
        case restaurant(id: String, name: String)
    }

    /// `https://desmoinesinsider.com/advertise?listingType=…&listingId=…&listingName=…`
    /// The web `/advertise` page reads these params and pre-fills the ListingPicker.
    static func advertiseURL(for listing: Listing?) -> URL {
        var components = URLComponents(url: Config.siteURL, resolvingAgainstBaseURL: false)
        components?.path = "/advertise"
        if let listing {
            switch listing {
            case let .event(id, name):
                components?.queryItems = [
                    URLQueryItem(name: "listingType", value: "event"),
                    URLQueryItem(name: "listingId", value: id),
                    URLQueryItem(name: "listingName", value: name),
                ]
            case let .restaurant(id, name):
                components?.queryItems = [
                    URLQueryItem(name: "listingType", value: "restaurant"),
                    URLQueryItem(name: "listingId", value: id),
                    URLQueryItem(name: "listingName", value: name),
                ]
            }
        }
        return components?.url ?? Config.siteURL.appendingPathComponent("advertise")
    }
}

/// SFSafariViewController wrapper. Used for the advertiser checkout so the web
/// Stripe flow runs in a first-class, cookie-sharing browser (Guideline-friendly),
/// not an embedded WKWebView.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        return SFSafariViewController(url: url, configuration: config)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// Reusable "Promote / Advertise this" affordance. Opens the web advertiser
/// portal in SFSafariViewController (see rationale above) — never StoreKit.
struct PromoteListingButton: View {
    enum Style { case inline, prominent, row }

    let listing: BusinessPromotion.Listing?
    var style: Style = .inline

    @State private var showAdvertise = false

    var body: some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            showAdvertise = true
        } label: {
            label
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Opens the advertiser portal in your browser")
        .sheet(isPresented: $showAdvertise) {
            SafariView(url: BusinessPromotion.advertiseURL(for: listing))
                .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private var label: some View {
        switch style {
        case .inline:
            Label("Promote this listing", systemImage: "megaphone.fill")
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(Color.accentColor)
        case .prominent:
            Label("Advertise this", systemImage: "megaphone.fill")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.white)
        case .row:
            Label("Promote your business", systemImage: "megaphone.fill")
        }
    }

    private var accessibilityLabel: String {
        switch listing {
        case .event: return "Promote this event"
        case .restaurant: return "Promote this restaurant"
        case nil: return "Promote your business"
        }
    }
}
