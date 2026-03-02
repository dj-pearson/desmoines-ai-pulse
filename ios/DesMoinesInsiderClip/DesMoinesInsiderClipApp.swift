import SwiftUI

/// Entry point for the Des Moines Insider App Clip.
///
/// Invocation URL pattern: https://desmoinesinsider.com/clip
/// (also handles /events/:id and /restaurants/:id deep-links)
@main
struct DesMoinesInsiderClipApp: App {
    @State private var invocationURL: URL?

    var body: some Scene {
        WindowGroup {
            ClipRootView(invocationURL: invocationURL)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    invocationURL = activity.webpageURL
                }
        }
    }
}
