import SwiftUI

/// Placeholder destination for parity features whose native screens haven't
/// shipped yet (IOS-IA-002). Each IOS-PARITY-* story replaces its routing with
/// the real screen, so no Discover-hub tile is ever a dead end in the meantime.
///
/// Offers a "Open on the web" escape hatch when a web URL exists, so the
/// content is reachable today even before the native screen lands.
struct ComingSoonView: View {
    let title: String
    let systemImage: String
    var message: String = "We're building this into the app. In the meantime you can view it on the web."
    var webURL: URL?

    @State private var showWeb = false

    var body: some View {
        VStack(spacing: 18) {
            EmptyStateView(
                icon: systemImage,
                title: "\(title) — Coming Soon",
                message: message,
                actionTitle: webURL != nil ? "Open on the web" : nil,
                action: webURL != nil ? { showWeb = true } : nil
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showWeb) {
            if let webURL {
                NavigationStack {
                    WebViewPage(title: title, url: webURL)
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        ComingSoonView(
            title: "Trip Planner",
            systemImage: "map.fill",
            webURL: URL(string: "https://desmoinesinsider.com/trip-planner")
        )
    }
}
