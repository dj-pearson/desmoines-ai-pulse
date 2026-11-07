import SwiftUI

/// A /best-of/<slug> link, opened on that category (IOS-AUDIT-FEAT-040).
///
/// BestOfCategoryView shares this URL, and the app used to open the Best Of
/// hub for it, so the person sent one category had to find it again. The slug
/// is looked up here because categories live in `voting_categories`; one that
/// is not active (or never existed) shows the hub, which is what every such
/// link did before. A failed read offers a retry rather than the hub, so an
/// outage is not mistaken for a missing category.
///
/// Rendered inside DeepLinkResolverView's NavigationStack, so the hub fallback
/// inherits it (`ownsNavigationStack: false`).
struct BestOfCategoryLinkView: View {
    let slug: String

    @State private var phase: Phase = .loading

    enum Phase: Equatable {
        case loading
        case found(VotingCategory)
        case notFound
        case offline
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .found(let category):
                BestOfCategoryView(category: category)
            case .notFound:
                BestOfView(ownsNavigationStack: false)
            case .offline:
                offlineView
            }
        }
        .task { await load() }
    }

    private var offlineView: some View {
        ContentUnavailableView {
            Label("Couldn't open this category", systemImage: "wifi.exclamationmark")
        } description: {
            Text("Check your connection and try again.")
        } actions: {
            Button("Try Again") { Task { await load() } }
        }
        .reloadOnReconnect(if: true) { await load() }
    }

    private func load() async {
        phase = .loading
        do {
            // nil is an inactive or unknown slug: the hub.
            if let category = try await VotingService.shared.fetchCategory(slug: slug) {
                phase = .found(category)
            } else {
                phase = .notFound
            }
        } catch {
            phase = .offline
        }
    }
}
